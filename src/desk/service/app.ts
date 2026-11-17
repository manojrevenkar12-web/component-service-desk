import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { readJson, ROOT } from '../../config.ts'
import type { InboundMail } from '../../wire.ts'
import { buildDesk, deskConfig, deskData, type DeskData } from '../build.ts'
import type { Desk, Outcome } from '../desk.ts'
import { embed } from '../rag/kb.ts'
import type { Db } from './db.ts'
import { DbSap, DbThreads, saveLedger, saveOutcome, takeMessage } from './store.ts'

interface ServiceConfig {
  port: number
  keys: Record<string, 'agent' | 'viewer'>
  seedFile: string
}

const Mail = z.object({
  messageId: z.string().min(3),
  threadId: z.string().min(3),
  from: z.string().min(3),
  country: z.string().length(2),
  receivedAt: z.string(),
  subject: z.string(),
  body: z.string(),
  attachments: z.array(z.object({ filename: z.string(), contentType: z.string(), base64: z.string() })).default([]),
})

type Row = Record<string, unknown>

function role(req: FastifyRequest, cfg: ServiceConfig): 'agent' | 'viewer' | null {
  return cfg.keys[String(req.headers['x-api-key'] ?? '')] ?? null
}

/** Load the demo day into an empty database: what the desk received and decided, nothing from the world. */
export async function seedDemo(db: Db, file: string): Promise<number> {
  const count = await db.query<{ n: number }>('select count(*)::int as n from messages')
  if (count.rows[0].n > 0 || !existsSync(join(ROOT, file))) return 0
  const seed = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as { items: { mail: InboundMail; outcome: Outcome }[] }
  for (const { mail, outcome } of seed.items) {
    await takeMessage(db, mail)
    await saveOutcome(db, outcome)
    if (outcome.rmaNumber && outcome.resolution.kind === 'rma') await db.query('insert into threads (thread_id, rma_number) values ($1, $2) on conflict do nothing', [mail.threadId, outcome.rmaNumber])
  }
  return seed.items.length
}

export async function indexArticles(db: Db, data: DeskData, dims: number): Promise<void> {
  for (const a of data.kb.articles) {
    await db.query('insert into kb_articles (id, title, body, embedding) values ($1, $2, $3, $4) on conflict (id) do update set title = excluded.title, body = excluded.body, embedding = excluded.embedding', [
      a.id,
      a.title,
      a.body,
      JSON.stringify(embed(`${a.title}\n${a.title}\n${a.summary.en}\n${a.body}`, dims)),
    ])
  }
}

export async function buildApp(db: Db, opts: { fetch?: typeof fetch; baseURL?: string; apiKey?: string } = {}): Promise<FastifyInstance> {
  const cfg = readJson<ServiceConfig>('config/service.json')
  const dcfg = deskConfig()
  const data = deskData(dcfg)
  await indexArticles(db, data, dcfg.kb.dims)
  const baseURL = opts.baseURL ?? process.env.OPENAI_BASE_URL
  const desk: Desk | null = baseURL || opts.fetch ? buildDesk({ sap: new DbSap(db), threads: new DbThreads(db), fetch: opts.fetch, baseURL, apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY, data, cfg: dcfg }) : null
  // One message at a time, in the order they arrive: the thread and the SAP order of one claim see each other.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(f: () => Promise<T>): Promise<T> => {
    const next = queue.then(f, f)
    queue = next.catch(() => undefined)
    return next
  }

  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 })
  const web = join(ROOT, 'web/dist')
  if (existsSync(web)) await app.register(fastifyStatic, { root: web, wildcard: false })

  app.get('/healthz', async () => ({ ok: true, models: desk ? 'configured' : 'not configured' }))

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return
    const r = role(req, cfg)
    if (!r) return reply.code(401).send({ error: 'missing or unknown X-Api-Key' })
    if (req.method !== 'GET' && r !== 'agent') return reply.code(403).send({ error: 'this key may only read' })
  })

  app.post('/api/messages', async (req, reply) => {
    const parsed = Mail.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'not a message', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
    const mail = parsed.data as InboundMail
    if (!desk) return reply.code(503).send({ error: 'no model endpoint configured: set OPENAI_BASE_URL' })
    return serial(async () => {
      const fresh = await takeMessage(db, mail)
      const prior = await db.query('select * from outcomes where message_id = $1', [mail.messageId])
      if (!fresh && prior.rows[0]) return { duplicate: true, outcome: prior.rows[0] }
      const from = desk.gw.ledger.length
      const outcome = await desk.handle(mail)
      await saveOutcome(db, outcome)
      await saveLedger(db, mail.messageId, desk.gw.ledger.slice(from))
      return { duplicate: false, outcome }
    })
  })

  app.get('/api/tickets', async (req) => {
    const status = (req.query as { status?: string }).status
    const r = await db.query<Row>(
      `select m.message_id, m.thread_id, m.received_at, m.sender, m.country, m.subject, o.lang, o.intent, o.resolution, o.route, o.status, o.reason, o.rma_number
       from messages m join outcomes o using (message_id) ${status ? 'where o.status = $1' : ''} order by m.received_at desc, m.message_id`,
      status ? [status] : [],
    )
    return r.rows
  })

  app.get('/api/tickets/:id', async (req, reply) => {
    const id = decodeURIComponent((req.params as { id: string }).id)
    const r = await db.query<Row>('select m.*, o.lang, o.intent, o.resolution, o.route, o.status, o.reason, o.reply, o.rma_number, o.checks, o.drafts, o.trace, o.decided_by, o.decided_at from messages m join outcomes o using (message_id) where m.message_id = $1', [id])
    if (!r.rows[0]) return reply.code(404).send({ error: 'no such ticket' })
    return r.rows[0]
  })

  const decide = (to: 'approved' | 'rejected') => async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
    const id = decodeURIComponent((req.params as { id: string }).id)
    const by = z.object({ by: z.string().min(1) }).safeParse(req.body)
    if (!by.success) return reply.code(400).send({ error: 'say who decides: {"by": "..."}' })
    const r = await db.query<Row>(`update outcomes set status = $2, decided_by = $3, decided_at = now() where message_id = $1 and status = 'waiting' returning message_id, status`, [id, to, by.data.by])
    if (!r.rows[0]) return reply.code(409).send({ error: 'only a draft waiting for review can be approved or rejected' })
    return r.rows[0]
  }
  app.post('/api/tickets/:id/approve', decide('approved'))
  app.post('/api/tickets/:id/reject', decide('rejected'))

  app.get('/api/kb/search', async (req) => {
    const q = String((req.query as { q?: string }).q ?? '')
    const vec = JSON.stringify(embed(q, dcfg.kb.dims))
    const sem = await db.query<{ id: string; title: string; similarity: number }>('select id, title, 1 - (embedding <=> $1) as similarity from kb_articles order by embedding <=> $1, id limit 5', [vec])
    return { query: q, pgvector: sem.rows.map((r) => ({ ...r, similarity: Math.round(Number(r.similarity) * 1000) / 1000 })), hybrid: data.kb.search(q, 5) }
  })

  app.get('/api/catalog/health', async () => {
    const gaps = data.pim.flatMap((p) => {
      const nulls: string[] = []
      for (const [group, v] of Object.entries(p)) if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (x === null) nulls.push(`${group}.${k}`)
      return nulls.length ? [{ sku: p.sku, name: p.name, missing: nulls, updatedAt: p.updatedAt }] : []
    })
    const newest = data.pim.map((p) => p.updatedAt).sort().at(-1)!
    const stale = data.pim.filter((p) => p.updatedAt < newest).map((p) => ({ sku: p.sku, name: p.name, updatedAt: p.updatedAt }))
    return { products: data.pim.length, parts: data.parts.length, gaps, stale, newest }
  })

  app.get('/api/results', async () => {
    const read = (f: string) => (existsSync(join(ROOT, f)) ? JSON.parse(readFileSync(join(ROOT, f), 'utf8')) : null)
    const dev = read('reports/dev.json')
    const held = read('reports/heldout.json')
    const strip = (r: { seeds: string[]; designs: { name: string; label: string; metrics: unknown }[] } | null) => (r ? { seeds: r.seeds, designs: r.designs.map(({ name, label, metrics }) => ({ name, label, metrics })) } : null)
    return { dev: strip(dev), heldout: strip(held), bakeoff: read('reports/bakeoff.json'), gate: read('reports/gate.json') }
  })

  app.get('/api/ledger', async () => {
    const r = await db.query<Row>('select model, route, count(*)::int as calls, sum(micros)::bigint as micros, sum(case when ok then 0 else 1 end)::int as failed from ledger group by model, route order by model, route')
    return r.rows.map((x) => ({ ...x, micros: Number(x.micros) }))
  })

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !existsSync(join(web, 'index.html'))) return reply.code(404).send({ error: 'not found' })
    return reply.type('text/html').send(readFileSync(join(web, 'index.html')))
  })
  return app
}
