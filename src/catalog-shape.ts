/**
 * The shape of the catalog exports the desk reads: the maker's PIM export and the third-party parts database.
 * The world writes them (with the gaps a real PIM has); the desk reads them. Imports nothing.
 */

export type ProductKind = 'psu' | 'cooler' | 'aio' | 'case' | 'fan' | 'spare'
export type CableGen = 'C4' | 'C5'
export type SpareItem = 'mounting_kit' | 'fan_clips' | 'cable_12v2x6'
export type GpuConnector = '12v2x6' | '3x8pin' | '2x8pin' | '1x8pin'

export interface PimRecord {
  sku: string
  name: string
  /** Names customers use. One alias can belong to several products ("Tide 850"). */
  aliases: string[]
  kind: ProductKind
  /** Warranty series, a key of the published warranty terms. */
  series: string
  /** The three characters after the year in the serial number, null for spare parts. */
  serialCode: string | null
  status: 'active' | 'legacy'
  psu?: { watts: number; cableGen: CableGen; lengthMm: number | null }
  cooler?: { heightMm: number | null; sockets: string[]; socketsWithKit: { socket: string; kitSku: string }[] }
  aio?: { radiatorMm: number; sockets: string[] }
  case?: { maxCoolerMm: number | null; maxGpuMm: number | null; maxPsuMm: number | null; radiatorsMm: number[] }
  fan?: { sizeMm: number }
  spare?: { item: SpareItem; forSkus: string[]; socket?: string }
  updatedAt: string
}

export interface PartRecord {
  id: string
  kind: 'cpu' | 'gpu'
  name: string
  aliases: string[]
  cpu?: { socket: string; sizingW: number }
  gpu?: { boardPowerW: number; lengthMm: number; connector: GpuConnector }
}

/** Published warranty and compatibility terms: public, read by the world and the desk alike. */
export interface Policy {
  warrantyYears: Record<string, number>
  servedCountries: string[]
  express: { series: string[]; countries: string[]; maxAgeMonths: number }
  psu: { headroom: number; baseW: number }
  /** Cable generation a power supply needs to drive a 12V-2x6 card without an adapter. */
  connector12v2x6CableGen: CableGen
}

/** Serial numbers: SM, two-digit year, three-character product code, five digits, one Luhn check digit. */
export const SERIAL_RE = /\bSM\d{2}[A-Z0-9]{3}\d{6}\b/g

export function luhnDigit(digits: string): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 0) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return (10 - (sum % 10)) % 10
}

/** The digits a serial's check digit covers: year and running number. */
function serialPayload(serial: string): string {
  return serial.slice(2, 4) + serial.slice(7, 12)
}

export function makeSerial(year2: string, code: string, running: number): string {
  const body = `SM${year2}${code}${String(running).padStart(5, '0')}`
  return body + luhnDigit(serialPayload(body + '0'))
}

export function serialValid(serial: string): boolean {
  if (!/^SM\d{2}[A-Z0-9]{3}\d{6}$/.test(serial)) return false
  return luhnDigit(serialPayload(serial)) === Number(serial[12])
}
