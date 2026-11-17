import { z } from 'zod'
import { readText } from '../../config.ts'
import type { Gateway } from '../llm/gateway.ts'

export const Extraction = z.object({
  intent: z.enum(['compatibility', 'warranty', 'troubleshooting', 'spare_part', 'status', 'other']),
  mentions: z.array(z.object({ quote: z.string().min(1), kind: z.enum(['own', 'cpu', 'gpu']) })).max(8),
  serial_quote: z.string().nullable(),
  invoice: z.object({ date_quote: z.string().nullable(), serial_quote: z.string().nullable(), product_quote: z.string().nullable() }).nullable(),
  symptom_en: z.string().nullable(),
  spare_item: z.enum(['mounting_kit', 'fan_clips', 'cable_12v2x6']).nullable(),
})
export type Extraction = z.infer<typeof Extraction>

export interface ReadResult {
  extraction: Extraction
  model: string
  /** Quotes that are not in the text: dropped, never used. */
  dropped: string[]
  /** Why the first reading was not good enough. */
  problems: string[]
  escalated: boolean
}

const SYSTEM = readText('prompts/extract.md')

/** Keep only what the text says: a quote that is not in the message or the invoice is removed. */
export function keepQuoted(x: Extraction, mail: string, invoice: string): { x: Extraction; dropped: string[] } {
  const dropped: string[] = []
  const inMail = (q: string | null) => (q !== null && mail.includes(q) ? q : (q !== null && dropped.push(q), null))
  const inInvoice = (q: string | null) => (q !== null && invoice.includes(q) ? q : (q !== null && dropped.push(q), null))
  const mentions = x.mentions.filter((m) => (mail.includes(m.quote) ? true : (dropped.push(m.quote), false)))
  const invoiceOut = x.invoice ? { date_quote: inInvoice(x.invoice.date_quote), serial_quote: inInvoice(x.invoice.serial_quote), product_quote: inInvoice(x.invoice.product_quote) } : null
  return { x: { ...x, mentions, serial_quote: inMail(x.serial_quote), invoice: invoiceOut }, dropped }
}

/** Reasons a reading is incomplete, checked by code against the message itself. */
export function problemsOf(x: Extraction, dropped: string[], hasInvoiceText: boolean): string[] {
  const p: string[] = []
  if (dropped.length) p.push(`quotes not in the text: ${dropped.join(' | ')}`)
  if (x.intent === 'spare_part' && !x.spare_item) p.push('spare part asked without an item')
  if (x.intent === 'compatibility' && x.mentions.length < 2) p.push('compatibility question with fewer than two parts')
  if (hasInvoiceText && (!x.invoice || !x.invoice.date_quote || !x.invoice.serial_quote)) p.push('invoice attached but not read')
  if (hasInvoiceText && x.intent !== 'warranty' && x.intent !== 'status') p.push(`invoice attached but intent ${x.intent}`)
  if (x.intent === 'troubleshooting' && !x.symptom_en) p.push('problem without a description')
  if (x.intent === 'warranty' && !hasInvoiceText && !x.mentions.length && !x.serial_quote) p.push('warranty claim without a product')
  return p
}

export async function readMessage(gw: Gateway, messageText: string, invoiceText: string): Promise<ReadResult> {
  const user = invoiceText ? `${messageText}\n\n=== invoice text ===\n${invoiceText}` : messageText
  const first = await gw.json('extract', SYSTEM, user, Extraction)
  const a = keepQuoted(first.value, messageText, invoiceText)
  const problems = problemsOf(a.x, a.dropped, invoiceText.length > 0)
  if (!problems.length) return { extraction: a.x, model: first.model, dropped: a.dropped, problems, escalated: false }
  const second = await gw.json('extract_escalate', SYSTEM, user, Extraction)
  const b = keepQuoted(second.value, messageText, invoiceText)
  return { extraction: b.x, model: second.model, dropped: [...a.dropped, ...b.dropped], problems, escalated: true }
}
