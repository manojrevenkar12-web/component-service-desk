import { serialValid, type PartRecord, type PimRecord } from '../../catalog-shape.ts'

export function norm(s: string): string {
  return s.toLowerCase().replace(/(\d)\s*w\b/g, '$1').replace(/[\s\-_]+/g, ' ').trim()
}

export interface OwnMatch {
  quote: string
  /** How the product was found: an identifier decides, a name only proposes. */
  by: 'sku' | 'serial' | 'name' | 'none'
  candidates: PimRecord[]
}

export interface PartMatch {
  quote: string
  kind: 'cpu' | 'gpu'
  part: PartRecord | null
}

/** The catalog as the desk has it: the PIM export and the third-party parts database, gaps and all. */
export class Catalog {
  private readonly bySku: Map<string, PimRecord>
  private readonly byCode: Map<string, PimRecord>

  constructor(
    readonly products: PimRecord[],
    readonly parts: PartRecord[],
  ) {
    this.bySku = new Map(products.map((p) => [p.sku, p]))
    this.byCode = new Map(products.filter((p) => p.serialCode).map((p) => [p.serialCode!, p]))
  }

  sku(sku: string): PimRecord | undefined {
    return this.bySku.get(sku)
  }

  /** The product a valid serial number names, or undefined. */
  bySerial(serial: string): PimRecord | undefined {
    return serialValid(serial) ? this.byCode.get(serial.slice(4, 7)) : undefined
  }

  own(quote: string): OwnMatch {
    const q = quote.trim()
    const sku = this.bySku.get(q.toUpperCase())
    if (sku) return { quote, by: 'sku', candidates: [sku] }
    if (/^SM\d{2}/.test(q)) {
      const p = this.bySerial(q)
      return p ? { quote, by: 'serial', candidates: [p] } : { quote, by: 'none', candidates: [] }
    }
    const n = norm(q)
    const exact = this.products.filter((p) => norm(p.name) === n)
    if (exact.length) return { quote, by: 'name', candidates: exact }
    const alias = this.products.filter((p) => p.aliases.some((a) => norm(a) === n))
    return { quote, by: alias.length ? 'name' : 'none', candidates: alias }
  }

  part(quote: string, kind: 'cpu' | 'gpu'): PartMatch {
    const n = norm(quote)
    const hits = this.parts.filter((p) => p.kind === kind && (norm(p.name) === n || p.aliases.some((a) => norm(a) === n)))
    return { quote, kind, part: hits.length === 1 ? hits[0] : null }
  }

  spares(item: string, sku: string): PimRecord[] {
    return this.products.filter((p) => p.spare && p.spare.item === item && p.spare.forSkus.includes(sku))
  }
}
