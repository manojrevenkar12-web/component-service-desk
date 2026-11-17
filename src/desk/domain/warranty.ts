import type { PimRecord, Policy } from '../../catalog-shape.ts'
import type { Resolution } from '../../wire.ts'

export function plusYears(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y + years, m - 1, d))
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0)
  return t.toISOString().slice(0, 10)
}

export function plusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, d))
  if (t.getUTCDate() !== d) t.setUTCDate(0)
  return t.toISOString().slice(0, 10)
}

export interface WarrantyDecision {
  resolution: Resolution
  until: string
  years: number
  rules: string[]
}

/** The published warranty terms, applied to a product, the purchase date on the invoice and the day the claim came in. */
export function decideWarranty(policy: Policy, product: PimRecord, purchaseDate: string, receivedDate: string, country: string): WarrantyDecision {
  const years = policy.warrantyYears[product.series]
  const until = plusYears(purchaseDate, years)
  const rules = [`warranty:${product.series}=${years}y`]
  if (receivedDate > until) return { resolution: { kind: 'deny', reason: 'expired' }, until, years, rules: [...rules, 'expired'] }
  const express =
    policy.express.series.includes(product.series) && policy.express.countries.includes(country) && receivedDate <= plusMonths(purchaseDate, policy.express.maxAgeMonths)
  rules.push(express ? 'express:eligible' : 'express:not-eligible')
  return { resolution: { kind: 'rma', express }, until, years, rules }
}

/** A European date as it is written on an invoice (31.12.2025 or 31/12/2025) to ISO, or null. */
export function parseLocalDate(quote: string): string | null {
  const m = quote.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/)
  if (!m) return null
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCDate() !== d) return null
  return t.toISOString().slice(0, 10)
}

export function localDate(iso: string, lang: string): string {
  const [y, m, d] = iso.split('-')
  return lang === 'de' || lang === 'pl' ? `${d}.${m}.${y}` : `${d}/${m}/${y}`
}
