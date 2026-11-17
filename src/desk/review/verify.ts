import type { Lang } from '../../wire.ts'
import { detectLanguage } from '../domain/language.ts'
import type { DraftFacts } from '../agents/draft.ts'

const NEGATIVE: Record<Lang, string[]> = {
  de: ['passen leider nicht', 'nicht kompatibel', 'passt leider nicht'],
  en: ['not compatible', 'does not fit', 'do not fit'],
  fr: ['pas compatible', 'ne rentre pas'],
  pl: ['nie są', 'nie zmieści', 'nie pasuje'],
}

export interface Check {
  ok: boolean
  problems: string[]
}

/** Tokens that carry a digit, kept whole: "12V-2x6", "SM-HT5", "17.11.2028" and "162" are one token each. */
function numbersIn(s: string): string[] {
  return (s.match(/[\p{L}\d]*\d[\p{L}\d.\-\/]*/gu) ?? []).map((t) => t.replace(/[.\-\/]+$/, ''))
}

function strings(x: unknown): string[] {
  if (typeof x === 'string') return [x]
  if (Array.isArray(x)) return x.flatMap(strings)
  if (x && typeof x === 'object') return Object.values(x).flatMap(strings)
  return []
}

/**
 * Code reads the draft before anyone else does: the right language, no number that is not in the facts or the
 * customer's own message, and the decision stated as it was made.
 */
export function verifyReply(reply: string, facts: DraftFacts, customerText: string): Check {
  const problems: string[] = []
  // The language of the desk's own words: names, summaries and links from the facts are taken out first.
  let own = reply
  for (const v of strings(facts).filter((v) => v.length > 3).sort((a, b) => b.length - a.length)) own = own.split(v).join(' ')
  const lang = detectLanguage(own)
  if (lang !== facts.lang) problems.push(`written in ${lang}, customer wrote ${facts.lang}`)
  const allowed = new Set([...strings(facts).flatMap(numbersIn), ...numbersIn(JSON.stringify(facts)), ...numbersIn(customerText)])
  const stray = numbersIn(reply).filter((n) => !allowed.has(n))
  if (stray.length) problems.push(`numbers not in the facts: ${[...new Set(stray)].join(', ')}`)
  const r = facts.resolution
  const text = reply.toLowerCase()
  const negative = NEGATIVE[facts.lang].some((p) => text.includes(p))
  if (r.kind === 'compat' && r.verdict === 'does_not_fit' && !negative) problems.push('says it fits; the decision is that it does not')
  if (r.kind === 'compat' && r.verdict !== 'does_not_fit' && negative) problems.push('says it does not fit; the decision is that it does')
  if (r.kind === 'compat' && r.verdict === 'fits_with_kit' && facts.kitSku && !reply.includes(facts.kitSku)) problems.push('kit not named')
  if ((r.kind === 'rma' || r.kind === 'status') && facts.rmaNumber && !reply.includes(facts.rmaNumber)) problems.push('return number missing')
  if (r.kind === 'deny' && /RMA-\d+/.test(reply)) problems.push('declines the claim but gives a return number')
  if (r.kind === 'deny' && r.reason === 'expired' && facts.warrantyUntil && !reply.includes(facts.warrantyUntil)) problems.push('end of warranty missing')
  if (r.kind === 'kb' && facts.article && !reply.includes(facts.article.url)) problems.push('article link missing')
  if (r.kind === 'spare' && facts.spare && !reply.includes(facts.spare.sku)) problems.push('spare part number missing')
  return { ok: problems.length === 0, problems }
}
