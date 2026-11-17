import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { readJson, ROOT } from '../config.ts'
import { buildDesk, deskConfig, deskData, type DeskConfig } from '../desk/build.ts'
import { partsExport, pimExport } from '../world/catalog.ts'
import { publishedPolicy, worldConfig } from '../world/load.ts'
import { SimulatedModels } from '../world/models.ts'
import { SimulatedSap } from '../world/sap.ts'
import { World } from '../world/world.ts'
import { loadGolden, recordingFetch, replayGolden, saveGolden, type GoldenCase } from './golden.ts'
import { writeReadme } from './readme.ts'
import { runDesign, type Design, type DesignRun } from './run.ts'
import { byIntent, byTrap, metrics } from './score.ts'

const designs = readJson<{ designs: Design[] }>('config/designs.json').designs

function write(path: string, data: unknown): void {
  mkdirSync(join(ROOT, path, '..'), { recursive: true })
  writeFileSync(join(ROOT, path), JSON.stringify(data, null, 2) + '\n')
}

async function evaluate(seeds: string[], only?: string[], cfg: DeskConfig = deskConfig()) {
  const data = deskData(cfg)
  const runs = new Map<string, DesignRun[]>()
  let cost = 0
  for (const seed of seeds) {
    const world = new World(publishedPolicy(), worldConfig(seed))
    cost = world.cfg.people.costPerMinuteCents
    const tickets = await world.tickets()
    for (const d of designs.filter((d) => !only || only.includes(d.name))) {
      const list = runs.get(d.name) ?? []
      list.push(await runDesign(world, tickets, d, cfg, data))
      runs.set(d.name, list)
    }
  }
  return {
    seeds,
    designs: [...runs.entries()].map(([name, rs]) => ({
      name,
      label: designs.find((d) => d.name === name)!.label,
      metrics: metrics(rs, cost),
      perSeed: rs.map((r) => ({ seed: r.seed, ...metrics([r], cost) })),
      escalations: rs.reduce((s, r) => s + r.escalations, 0),
      modelCalls: rs.reduce((s, r) => s + r.modelCalls, 0),
    })),
    platform: runs.has('platform') ? { byTrap: byTrap(runs.get('platform')!), byIntent: byIntent(runs.get('platform')!), misses: runs.get('platform')!.flatMap((r) => r.tickets).filter((t) => !t.right).map((t) => ({ messageId: t.messageId, intent: t.intent, traps: t.traps, truth: t.truth, final: t.final, handledBy: t.handledBy })) } : null,
  }
}

/** What dev ended on: the desk's code, prompts, settings and knowledge. The held-out run must use exactly this. */
function deskFingerprint(): string {
  const h = createHash('sha256')
  const files = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.(ts|md|json)$/.test(f))
      .sort()
      .map((f) => join(dir, f))
  for (const f of [...files('src/desk'), ...files('prompts'), ...files('knowledge'), 'config/desk.json', 'src/wire.ts', 'src/catalog-shape.ts']) h.update(f).update(readFileSync(join(ROOT, f)))
  return h.digest('hex')
}

async function recordGolden() {
  const cfg = deskConfig()
  const data = deskData(cfg)
  const world = new World(publishedPolicy(), worldConfig('dev-1'))
  const tickets = await world.tickets()
  const models = new SimulatedModels(world, world.cfg.models)
  const sap = new SimulatedSap('golden', world.cfg.sap.ghostTimeout)
  const tape = new Map<string, { key: string; status: number; body: string }[]>()
  const desk = buildDesk({ sap, fetch: recordingFetch(models.fetch, tape) as typeof fetch, cfg, data })
  const cases: GoldenCase[] = []
  const taken = new Map<string, number>()
  for (const { mail, scenario: s } of tickets) {
    const threadRma = await (desk.threads as { rmaFor(t: string): Promise<string | null> }).rmaFor(mail.threadId)
    const sapOpen = s.serial ? await sap.findRma(`rma:${s.serial}`) : null
    const o = await desk.handle(mail)
    const why = s.traps.length ? s.traps.join('+') : `${s.intent}:${s.truth.kind}${s.truth.kind === 'compat' ? `:${s.truth.reason}` : ''}`
    const right = JSON.stringify(o.resolution) === JSON.stringify(s.truth) || (o.resolution.kind === s.truth.kind && ['status', 'human'].includes(s.truth.kind)) || (o.resolution.kind === 'compat' && s.truth.kind === 'compat' && o.resolution.verdict === s.truth.verdict) || (o.resolution.kind === 'ask' && s.truth.kind === 'ask')
    if (!right || (taken.get(why) ?? 0) >= 2) continue
    taken.set(why, (taken.get(why) ?? 0) + 1)
    cases.push({ why, mail, threadRma: threadRma, sapRma: sapOpen && s.traps.includes('resent') ? { key: `rma:${s.serial}`, rmaNumber: sapOpen.rmaNumber } : null, createdRma: o.resolution.kind === 'rma' ? o.rmaNumber : null, responses: tape.get(mail.messageId) ?? [], expected: s.truth })
  }
  saveGolden(cases)
  console.log(`${cases.length} golden cases`)
}

async function gate() {
  const g = readJson<Record<string, number | string>>('config/gate.json')
  const dev = readJson<Awaited<ReturnType<typeof evaluate>>>('reports/dev.json')
  const m = dev.designs.find((d) => d.name === g.design)!.metrics
  const checks = [
    { name: 'resolved right', value: m.right, limit: `≥ ${g.minRight}`, pass: m.right >= (g.minRight as number) },
    { name: 'wrong answers sent', value: m.wrongSent, limit: `≤ ${g.maxWrongSent}`, pass: m.wrongSent <= (g.maxWrongSent as number) },
    { name: 'warranty mis-decisions', value: m.warrantyMisses, limit: `≤ ${g.maxWarrantyMisses}`, pass: m.warrantyMisses <= (g.maxWarrantyMisses as number) },
    { name: 'duplicate return orders', value: m.duplicateRmas, limit: `≤ ${g.maxDuplicateRmas}`, pass: m.duplicateRmas <= (g.maxDuplicateRmas as number) },
    { name: 'replies with a defect', value: m.replyDefects, limit: `≤ ${g.maxReplyDefects}`, pass: m.replyDefects <= (g.maxReplyDefects as number) },
    { name: 'injected instructions followed', value: m.injectionFollowed, limit: `≤ ${g.maxInjectionFollowed}`, pass: m.injectionFollowed <= (g.maxInjectionFollowed as number) },
    { name: 'sent without a person', value: m.auto, limit: `≥ ${g.minAuto}`, pass: m.auto >= (g.minAuto as number) },
  ]
  const golden = await replayGolden(loadGolden(g.golden as string), deskConfig(), deskData())
  checks.push({ name: 'golden cases replayed', value: golden.filter((x) => x.pass).length, limit: `= ${golden.length}`, pass: golden.every((x) => x.pass) })
  const pass = checks.every((c) => c.pass)
  write('reports/gate.json', { design: g.design, pass, checks, golden: golden.map(({ why, messageId, pass }) => ({ why, messageId, pass })) })
  for (const c of checks) console.log(`${c.pass ? 'pass' : 'FAIL'}  ${c.name}: ${c.value} (${c.limit})`)
  if (!pass) process.exit(1)
}

async function bakeoff() {
  const base = deskConfig()
  const variants: Record<string, Record<string, string[]>> = {
    'small model only': { extract: ['sm-small'], extract_escalate: ['sm-small'], draft: ['sm-small'], redraft: ['sm-small'] },
    'small first, large when the reading or the draft fails': { extract: ['sm-small', 'sm-large'], extract_escalate: ['sm-large', 'sm-small'], draft: ['sm-small', 'sm-large'], redraft: ['sm-large', 'sm-small'] },
    'large first, small as fallback': { extract: ['sm-large', 'sm-small'], extract_escalate: ['sm-large', 'sm-small'], draft: ['sm-large', 'sm-small'], redraft: ['sm-large', 'sm-small'] },
  }
  const out = []
  for (const [name, routes] of Object.entries(variants)) {
    const r = await evaluate(readJson<{ seeds: string[] }>('config/dev.json').seeds, ['platform'], { ...base, routes: { ...base.routes, ...routes } })
    const d = r.designs[0]
    out.push({ routes: name, shipped: JSON.stringify(routes) === JSON.stringify(Object.fromEntries(Object.keys(routes).map((k) => [k, base.routes[k]]))), ...d.metrics, escalations: d.escalations, modelCalls: d.modelCalls })
  }
  write('reports/bakeoff.json', { seeds: readJson<{ seeds: string[] }>('config/dev.json').seeds, variants: out })
}

async function seedDemo() {
  const world = new World(publishedPolicy(), worldConfig('demo', { tickets: 90, days: 3 }))
  const tickets = await world.tickets()
  const models = new SimulatedModels(world, world.cfg.models)
  const sap = new SimulatedSap('demo', world.cfg.sap.ghostTimeout)
  const desk = buildDesk({ sap, fetch: models.fetch as typeof fetch })
  const items = []
  for (const { mail } of tickets) {
    const outcome = await desk.handle(mail)
    items.push({ mail: { ...mail, attachments: mail.attachments.map((a) => ({ ...a, base64: a.base64 })) }, outcome })
  }
  write('demo/seed.json', { note: 'What the desk received and decided on a demo day. No truth from the world.', items })
}

const cmd = process.argv[2]
if (cmd === 'export') {
  write('knowledge/pim.json', pimExport())
  write('knowledge/parts.json', partsExport())
} else if (cmd === 'dev') {
  write('reports/dev.json', await evaluate(readJson<{ seeds: string[] }>('config/dev.json').seeds))
} else if (cmd === 'bakeoff') await bakeoff()
else if (cmd === 'golden') await recordGolden()
else if (cmd === 'gate') await gate()
else if (cmd === 'lock') {
  if (existsSync(join(ROOT, 'config/heldout.lock'))) throw new Error('the held-out lock exists: the held-out period has been run')
  write('config/heldout.lock', { seeds: readJson<{ seeds: string[] }>('config/heldout.json').seeds, desk: deskFingerprint(), note: 'Written once, before the held-out run. The run refuses any other desk.' })
} else if (cmd === 'heldout') {
  const lock = readJson<{ seeds: string[]; desk: string }>('config/heldout.lock')
  if (existsSync(join(ROOT, 'reports/heldout.json'))) throw new Error('the held-out period has been run; it is not run again')
  if (lock.desk !== deskFingerprint()) throw new Error('the desk changed since the lock; the held-out run uses the desk dev ended on')
  write('reports/heldout.json', await evaluate(lock.seeds))
} else if (cmd === 'readme') writeReadme()
else if (cmd === 'seed') await seedDemo()
else {
  console.error('usage: cli.ts export|dev|bakeoff|golden|gate|lock|heldout|readme|seed')
  process.exit(2)
}
