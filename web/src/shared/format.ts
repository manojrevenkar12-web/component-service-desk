import type { Resolution, Status } from './types'

export function resolutionText(r: Resolution): string {
  switch (r.kind) {
    case 'compat':
      return r.verdict === 'fits' ? 'Fits' : r.verdict === 'fits_with_kit' ? 'Fits with the free kit' : `Does not fit: ${r.reason.replaceAll('_', ' ')}`
    case 'rma':
      return r.express ? 'Return order, express exchange' : 'Return order'
    case 'deny':
      return r.reason === 'expired' ? 'Warranty expired' : 'Bought outside our countries'
    case 'status':
      return 'Return already open'
    case 'ask':
      return `Asked for the ${r.missing.join(' and ')}`
    case 'kb':
      return `Help article: ${r.article}`
    case 'spare':
      return `Spare part ${r.sku}`
    case 'human':
      return 'With a person'
  }
}

/** Which way a resolution leans, for its colour: yes, no or a person. */
export function tone(r: Resolution): 'yes' | 'no' | 'person' | 'neutral' {
  if (r.kind === 'human') return 'person'
  if (r.kind === 'deny' || (r.kind === 'compat' && r.verdict === 'does_not_fit')) return 'no'
  if (r.kind === 'compat' || r.kind === 'rma' || r.kind === 'spare' || r.kind === 'kb') return 'yes'
  return 'neutral'
}

export const statusText: Record<Status, string> = {
  sent: 'Sent',
  waiting: 'Waiting for review',
  with_person: 'With a person',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const intentText: Record<string, string> = {
  compatibility: 'Compatibility',
  warranty: 'Warranty',
  troubleshooting: 'Troubleshooting',
  spare_part: 'Spare part',
  status: 'Return status',
  other: 'Other',
}

export function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
}

export function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}

export function euros(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`
}

export function senderName(email: string): string {
  return email.split('@')[0].split('.').filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ')
}

/** Model spend is a fraction of a cent per ticket: shown in cents so it does not round to nothing. */
export function cents(c: number): string {
  return `${c.toFixed(2)} ct`
}
