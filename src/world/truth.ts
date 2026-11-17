import type { PartRecord, PimRecord, Policy } from '../catalog-shape.ts'
import type { Resolution, Verdict } from '../wire.ts'

/** The world's own reading of the published terms, applied to the true catalog. Written apart from the desk's rules. */

export type Entity = { own: PimRecord } | { part: PartRecord }

export interface CompatTruth {
  verdict: Verdict
  reason: string
}

export function compatTruth(policy: Policy, entities: Entity[]): CompatTruth {
  const own = entities.flatMap((e) => ('own' in e ? [e.own] : []))
  const parts = entities.flatMap((e) => ('part' in e ? [e.part] : []))
  const cooler = own.find((p) => p.kind === 'cooler')
  const aio = own.find((p) => p.kind === 'aio')
  const box = own.find((p) => p.kind === 'case')
  const psus = own.filter((p) => p.kind === 'psu')
  const cpu = parts.find((p) => p.kind === 'cpu')
  const gpu = parts.find((p) => p.kind === 'gpu')
  const fails: string[] = []
  let kit = false
  if (cooler && cpu) {
    const s = cpu.cpu!.socket
    if (cooler.cooler!.socketsWithKit.some((k) => k.socket === s)) kit = true
    else if (!cooler.cooler!.sockets.includes(s)) fails.push('socket')
  }
  if (aio && cpu && !aio.aio!.sockets.includes(cpu.cpu!.socket)) fails.push('socket')
  if (cooler && box && cooler.cooler!.heightMm! > box.case!.maxCoolerMm!) fails.push('height')
  if (aio && box && !box.case!.radiatorsMm.includes(aio.aio!.radiatorMm)) fails.push('radiator')
  if (gpu && box && gpu.gpu!.lengthMm > box.case!.maxGpuMm!) fails.push('gpu_length')
  if (psus.length === 1 && box && psus[0].psu!.lengthMm! > box.case!.maxPsuMm!) fails.push('psu_length')
  if (psus.length === 1 && cpu && gpu) {
    const need = Math.ceil((cpu.cpu!.sizingW + gpu.gpu!.boardPowerW) * policy.psu.headroom + policy.psu.baseW)
    if (psus[0].psu!.watts < need) fails.push('wattage')
    if (gpu.gpu!.connector === '12v2x6' && psus[0].psu!.cableGen !== policy.connector12v2x6CableGen) fails.push('connector')
  }
  if (psus.length === 2 && psus[0].psu!.cableGen !== psus[1].psu!.cableGen) fails.push('cable_generation')
  if (fails.length) return { verdict: 'does_not_fit', reason: fails[0] }
  if (kit) return { verdict: 'fits_with_kit', reason: 'socket_kit' }
  return { verdict: 'fits', reason: 'ok' }
}

export function addYears(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const t = new Date(Date.UTC(y + years, m - 1, d))
  if (t.getUTCMonth() !== m - 1) t.setUTCDate(0)
  return t.toISOString().slice(0, 10)
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, d))
  if (t.getUTCDate() !== d) t.setUTCDate(0)
  return t.toISOString().slice(0, 10)
}

export interface WarrantyFacts {
  product: PimRecord
  purchaseDate: string
  receivedDate: string
  country: string
  invoiceReadable: boolean
}

export function warrantyTruth(policy: Policy, f: WarrantyFacts): Resolution {
  if (!policy.servedCountries.includes(f.country)) return { kind: 'deny', reason: 'country' }
  if (!f.invoiceReadable) return { kind: 'ask', missing: ['invoice'] }
  const years = policy.warrantyYears[f.product.series]
  if (f.receivedDate > addYears(f.purchaseDate, years)) return { kind: 'deny', reason: 'expired' }
  const express =
    policy.express.series.includes(f.product.series) &&
    policy.express.countries.includes(f.country) &&
    f.receivedDate <= addMonths(f.purchaseDate, policy.express.maxAgeMonths)
  return { kind: 'rma', express }
}
