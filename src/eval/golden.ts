import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../config.ts'
import { buildDesk, type DeskConfig, type DeskData } from '../desk/build.ts'
import { MemoryThreads } from '../desk/desk.ts'
import { sameResolution, type InboundMail, type Resolution, type RmaRequest, type RmaResult, type SapPort } from '../wire.ts'

/**
 * Golden cases: real messages from a dev run, the model answers recorded at the time, and the right resolution.
 * Replaying them needs no world: the gate runs them on every change to the rules, the prompts or the catalog.
 */
export interface GoldenCase {
  why: string
  mail: InboundMail
  /** For a follow-up: the return order its conversation already has. */
  threadRma: string | null
  /** For a claim sent twice: the order SAP already holds for this serial. */
  sapRma: { key: string; rmaNumber: string } | null
  /** The number SAP gave the order this case created when it was recorded. */
  createdRma: string | null
  responses: { key: string; status: number; body: string }[]
  expected: Resolution
}

export function recordingFetch(inner: (u: string | URL | Request, i?: RequestInit) => Promise<Response>, tape: Map<string, { key: string; status: number; body: string }[]>) {
  const seen = new Map<string, number>()
  return async (u: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] }
    const user = req.messages.find((m) => m.role === 'user')!.content
    const task = req.messages.find((m) => m.role === 'system')!.content.match(/^# task: (\w+)/m)![1]
    const id = user.match(/Message-ID: (\S+)/)?.[1] ?? JSON.parse(user).messageId
    const k = `${id}|${task}|${req.model}`
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    const res = await inner(u, init)
    const body = await res.text()
    if (!tape.has(id)) tape.set(id, [])
    tape.get(id)!.push({ key: `${k}|${n}`, status: res.status, body })
    return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
  }
}

function replayFetch(c: GoldenCase) {
  const seen = new Map<string, number>()
  return async (_u: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = JSON.parse(String(init?.body)) as { model: string; messages: { role: string; content: string }[] }
    const task = req.messages.find((m) => m.role === 'system')!.content.match(/^# task: (\w+)/m)![1]
    const k = `${c.mail.messageId}|${task}|${req.model}`
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    const hit = c.responses.find((r) => r.key === `${k}|${n}`)
    if (!hit) return new Response(JSON.stringify({ error: { message: `no recorded answer for ${k}|${n}` } }), { status: 503 })
    return new Response(hit.body, { status: hit.status, headers: { 'content-type': 'application/json' } })
  }
}

class GoldenSap implements SapPort {
  constructor(
    private readonly open: GoldenCase['sapRma'],
    private readonly created: string | null,
  ) {}
  async createRma(_req: RmaRequest): Promise<RmaResult> {
    return { rmaNumber: this.created ?? 'RMA-GOLDEN', created: true }
  }
  async findRma(key: string): Promise<RmaResult | null> {
    return this.open && this.open.key === key ? { rmaNumber: this.open.rmaNumber, created: false } : null
  }
}

export function loadGolden(path = 'evals/golden.json'): GoldenCase[] {
  return JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as GoldenCase[]
}

export function saveGolden(cases: GoldenCase[], path = 'evals/golden.json'): void {
  writeFileSync(join(ROOT, path), JSON.stringify(cases, null, 1) + '\n')
}

export async function replayGolden(cases: GoldenCase[], cfg: DeskConfig, data: DeskData): Promise<{ why: string; messageId: string; expected: Resolution; got: Resolution; pass: boolean }[]> {
  const out = []
  for (const c of cases) {
    const threads = new MemoryThreads()
    if (c.threadRma) await threads.remember(c.mail.threadId, c.threadRma)
    const desk = buildDesk({ sap: new GoldenSap(c.sapRma, c.createdRma), fetch: replayFetch(c) as typeof fetch, threads, cfg, data })
    const o = await desk.handle(c.mail)
    out.push({ why: c.why, messageId: c.mail.messageId, expected: c.expected, got: o.resolution, pass: sameResolution(c.expected, o.resolution) && o.resolution.kind === c.expected.kind })
  }
  return out
}
