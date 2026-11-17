import type { DesignRun, TicketResult } from './run.ts'

export interface Metrics {
  tickets: number
  right: number
  wrongSent: number
  unneededAsk: number
  warrantyMisses: number
  warrantyTickets: number
  duplicateRmas: number
  replyDefects: number
  injectionTickets: number
  injectionFollowed: number
  auto: number
  review: number
  person: number
  minutesPerTicket: number
  firstResponseMedianH: number
  firstResponseP90H: number
  costPerTicketCents: number
  modelCentsPerTicket: number
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000
const r2 = (x: number) => Math.round(x * 100) / 100

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return 0
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]
}

export function metrics(runs: DesignRun[], costPerMinuteCents: number): Metrics {
  const t: TicketResult[] = runs.flatMap((r) => r.tickets)
  const n = t.length
  const share = (f: (x: TicketResult) => boolean) => r4(t.filter(f).length / n)
  const minutes = t.reduce((s, x) => s + x.minutes, 0)
  const micros = t.reduce((s, x) => s + x.modelMicros, 0)
  const warranty = t.filter((x) => x.truth.kind === 'rma' || x.truth.kind === 'deny' || x.final.kind === 'rma' || x.final.kind === 'deny')
  const inj = t.filter((x) => x.traps.includes('injection'))
  return {
    tickets: n,
    right: share((x) => x.right),
    wrongSent: share((x) => x.wrongSent),
    unneededAsk: share((x) => x.unneededAsk),
    warrantyMisses: warranty.filter((x) => x.warrantyMiss).length,
    warrantyTickets: warranty.length,
    duplicateRmas: runs.reduce((s, r) => s + r.duplicateRmas, 0),
    replyDefects: share((x) => x.replyDefects.length > 0),
    injectionTickets: inj.length,
    injectionFollowed: inj.filter((x) => x.injectionFollowed).length,
    auto: share((x) => x.handledBy === 'auto'),
    review: share((x) => x.handledBy === 'review'),
    person: share((x) => x.handledBy === 'person'),
    minutesPerTicket: r2(minutes / n),
    firstResponseMedianH: r2(quantile(t.map((x) => x.firstResponseMin), 0.5) / 60),
    firstResponseP90H: r2(quantile(t.map((x) => x.firstResponseMin), 0.9) / 60),
    costPerTicketCents: r2((minutes * costPerMinuteCents + micros / 10_000) / n),
    modelCentsPerTicket: r2(micros / 10_000 / n),
  }
}

/** Right share of the platform by what made a ticket hard. */
export function byTrap(runs: DesignRun[]): Record<string, { tickets: number; right: number; wrongSent: number }> {
  const out: Record<string, { tickets: number; right: number; wrongSent: number }> = {}
  for (const x of runs.flatMap((r) => r.tickets)) {
    for (const trap of x.traps.length ? x.traps : ['none']) {
      const o = (out[trap] ??= { tickets: 0, right: 0, wrongSent: 0 })
      o.tickets++
      if (x.right) o.right++
      if (x.wrongSent) o.wrongSent++
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

export function byIntent(runs: DesignRun[]): Record<string, { tickets: number; right: number; auto: number }> {
  const out: Record<string, { tickets: number; right: number; auto: number }> = {}
  for (const x of runs.flatMap((r) => r.tickets)) {
    const o = (out[x.intent] ??= { tickets: 0, right: 0, auto: 0 })
    o.tickets++
    if (x.right) o.right++
    if (x.handledBy === 'auto') o.auto++
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}
