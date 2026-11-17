import { SapTimeout, type InboundMail, type RmaRequest, type RmaResult, type SapPort } from '../../wire.ts'
import type { Outcome, Threads } from '../desk.ts'
import type { LedgerEntry } from '../llm/gateway.ts'
import type { Db } from './db.ts'

export type Status = 'sent' | 'waiting' | 'with_person' | 'approved' | 'rejected'

export function statusOf(o: Outcome): Status {
  return o.route === 'auto' ? 'sent' : o.route === 'review' ? 'waiting' : 'with_person'
}

export class DbThreads implements Threads {
  constructor(private readonly db: Db) {}
  async rmaFor(threadId: string) {
    const r = await this.db.query<{ rma_number: string }>('select rma_number from threads where thread_id = $1', [threadId])
    return r.rows[0]?.rma_number ?? null
  }
  async remember(threadId: string, rma: string) {
    await this.db.query('insert into threads (thread_id, rma_number) values ($1, $2) on conflict (thread_id) do nothing', [threadId, rma])
  }
}

/** The return-order write as a table: insert once per key; a second insert for the key returns the first order. */
export class DbSap implements SapPort {
  constructor(private readonly db: Db) {}
  async createRma(req: RmaRequest): Promise<RmaResult> {
    const r = await this.db.query<{ rma_number: string }>(
      `insert into sap_orders (idempotency_key, rma_number, serial, sku, express, message_id)
       values ($1, 'RMA-' || nextval('rma_seq'), $2, $3, $4, $5)
       on conflict (idempotency_key) do nothing returning rma_number`,
      [req.idempotencyKey, req.serial, req.sku, req.express, req.messageId],
    )
    if (r.rows[0]) return { rmaNumber: r.rows[0].rma_number, created: true }
    const found = await this.findRma(req.idempotencyKey)
    if (!found) throw new SapTimeout()
    return found
  }
  async findRma(key: string): Promise<RmaResult | null> {
    const r = await this.db.query<{ rma_number: string }>('select rma_number from sap_orders where idempotency_key = $1', [key])
    return r.rows[0] ? { rmaNumber: r.rows[0].rma_number, created: false } : null
  }
}

/** Take a message once: a second delivery of the same Message-ID changes nothing. */
export async function takeMessage(db: Db, m: InboundMail): Promise<boolean> {
  const r = await db.query(
    `insert into messages (message_id, thread_id, received_at, sender, country, subject, body, attachments)
     values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (message_id) do nothing returning message_id`,
    [m.messageId, m.threadId, m.receivedAt, m.from, m.country, m.subject, m.body, JSON.stringify(m.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, bytes: Math.floor((a.base64.length * 3) / 4) })))],
  )
  return r.rows.length === 1
}

export async function saveOutcome(db: Db, o: Outcome): Promise<void> {
  await db.query(
    `insert into outcomes (message_id, lang, intent, resolution, route, reason, reply, rma_number, checks, drafts, trace, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict (message_id) do nothing`,
    [o.messageId, o.lang, o.intent, JSON.stringify(o.resolution), o.route, o.reason, o.reply, o.rmaNumber, o.check ? JSON.stringify(o.check) : null, o.drafts, JSON.stringify(o.trace), statusOf(o)],
  )
}

export async function saveLedger(db: Db, messageId: string, entries: LedgerEntry[]): Promise<void> {
  for (const e of entries) await db.query('insert into ledger (message_id, route, model, ok, prompt_tokens, completion_tokens, micros) values ($1, $2, $3, $4, $5, $6, $7)', [messageId, e.route, e.model, e.ok, e.promptTokens, e.completionTokens, e.micros])
}
