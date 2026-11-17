/** What passes between the world and the desk: mail in, resolutions and replies out. Imports nothing. */

export type Lang = 'de' | 'en' | 'fr' | 'pl'
export const LANGS: readonly Lang[] = ['de', 'en', 'fr', 'pl']

export interface Attachment {
  filename: string
  contentType: string
  /** Base64 of the file bytes. */
  base64: string
}

/** One message from the support form or the support mailbox. */
export interface InboundMail {
  messageId: string
  /** Replies to the desk's answers keep the thread of the first message. */
  threadId: string
  from: string
  /** The country picked in the support form (ISO 3166 alpha-2). */
  country: string
  /** ISO timestamp, UTC. */
  receivedAt: string
  subject: string
  body: string
  attachments: Attachment[]
}

export type Verdict = 'fits' | 'fits_with_kit' | 'does_not_fit'
export type DenyReason = 'expired' | 'country'
export type Missing = 'invoice' | 'model' | 'serial'

/** What a ticket was resolved to. The world holds the true one; the designs produce one each. */
export type Resolution =
  | { kind: 'compat'; verdict: Verdict; reason: string }
  | { kind: 'rma'; express: boolean }
  | { kind: 'deny'; reason: DenyReason }
  | { kind: 'status' }
  | { kind: 'ask'; missing: Missing[] }
  | { kind: 'kb'; article: string }
  | { kind: 'spare'; sku: string }
  | { kind: 'human' }

/** A write to SAP: one return order per product case, keyed so that a retry cannot make a second one. */
export interface RmaRequest {
  idempotencyKey: string
  serial: string
  sku: string
  express: boolean
  country: string
  customer: string
  messageId: string
}

export interface RmaResult {
  rmaNumber: string
  created: boolean
}

/** SAP as the desk sees it. A call can time out after SAP has committed the order. */
export interface SapPort {
  createRma(req: RmaRequest): Promise<RmaResult>
  findRma(idempotencyKey: string): Promise<RmaResult | null>
}

export class SapTimeout extends Error {
  constructor() {
    super('SAP did not answer in time')
  }
}

export function resolutionLabel(r: Resolution): string {
  switch (r.kind) {
    case 'compat':
      return `${r.verdict.replaceAll('_', ' ')} (${r.reason})`
    case 'rma':
      return r.express ? 'return order, express exchange' : 'return order'
    case 'deny':
      return `warranty declined: ${r.reason}`
    case 'status':
      return 'status of the open return'
    case 'ask':
      return `ask for ${r.missing.join(', ')}`
    case 'kb':
      return `help article ${r.article}`
    case 'spare':
      return `spare part ${r.sku}`
    case 'human':
      return 'a person answers'
  }
}

export function sameResolution(a: Resolution, b: Resolution): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'compat':
      return a.verdict === (b as typeof a).verdict
    case 'rma':
      return a.express === (b as typeof a).express
    case 'deny':
      return a.reason === (b as typeof a).reason
    case 'ask':
      return (b as typeof a).missing.includes(a.missing[0])
    case 'kb':
      return a.article === (b as typeof a).article
    case 'spare':
      return a.sku === (b as typeof a).sku
    default:
      return true
  }
}
