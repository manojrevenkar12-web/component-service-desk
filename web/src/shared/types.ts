export type Resolution =
  | { kind: 'compat'; verdict: 'fits' | 'fits_with_kit' | 'does_not_fit'; reason: string }
  | { kind: 'rma'; express: boolean }
  | { kind: 'deny'; reason: string }
  | { kind: 'status' }
  | { kind: 'ask'; missing: string[] }
  | { kind: 'kb'; article: string }
  | { kind: 'spare'; sku: string }
  | { kind: 'human' }

export type Status = 'sent' | 'waiting' | 'with_person' | 'approved' | 'rejected'

export interface TicketRow {
  message_id: string
  thread_id: string
  received_at: string
  sender: string
  country: string
  subject: string
  lang: string
  intent: string
  resolution: Resolution
  route: 'auto' | 'review' | 'human'
  status: Status
  reason: string
  rma_number: string | null
}

export interface TraceStep {
  node: string
  note: string
  refs?: string[]
}

export interface TicketDetail extends TicketRow {
  body: string
  attachments: { filename: string; contentType: string; bytes: number }[]
  reply: string | null
  checks: { ok: boolean; problems: string[] } | null
  drafts: number
  trace: TraceStep[]
  decided_by: string | null
  decided_at: string | null
}

export interface Metrics {
  tickets: number
  right: number
  wrongSent: number
  unneededAsk: number
  warrantyMisses: number
  duplicateRmas: number
  replyDefects: number
  injectionTickets: number
  injectionFollowed: number
  auto: number
  minutesPerTicket: number
  firstResponseMedianH: number
  firstResponseP90H: number
  costPerTicketCents: number
  modelCentsPerTicket: number
}

export interface Results {
  dev: { seeds: string[]; designs: { name: string; label: string; metrics: Metrics }[] } | null
  heldout: { seeds: string[]; designs: { name: string; label: string; metrics: Metrics }[] } | null
  bakeoff: { variants: ({ routes: string; shipped: boolean } & Metrics)[] } | null
  gate: { pass: boolean; checks: { name: string; value: number; limit: string; pass: boolean }[] } | null
}

export interface Health {
  products: number
  parts: number
  newest: string
  gaps: { sku: string; name: string; missing: string[]; updatedAt: string }[]
  stale: { sku: string; name: string; updatedAt: string }[]
}
