import type { PartRecord, PimRecord, Policy } from '../../catalog-shape.ts'
import type { Verdict } from '../../wire.ts'
import type { Catalog } from './catalog.ts'

export type Item = { own: PimRecord } | { part: PartRecord }

export interface Fact {
  key: string
  value: number
  unit: string
  /** Where the number comes from, shown in the decision trace. */
  source: string
}

export interface CompatResult {
  verdict: Verdict
  reason: string
  kitSku?: string
  /** The rule each check applied, in order. */
  rules: string[]
  facts: Fact[]
  /** Fields the decision needed that the PIM export does not have. */
  missing: string[]
}

/**
 * Compatibility by the published rules. Every number comes from the PIM export or the parts database; a field the
 * export lacks is reported as missing, never guessed.
 */
export function checkCompat(policy: Policy, catalog: Catalog, items: Item[]): CompatResult {
  const own = items.flatMap((i) => ('own' in i ? [i.own] : []))
  const parts = items.flatMap((i) => ('part' in i ? [i.part] : []))
  const cooler = own.find((p) => p.kind === 'cooler')
  const aio = own.find((p) => p.kind === 'aio')
  const box = own.find((p) => p.kind === 'case')
  const psus = own.filter((p) => p.kind === 'psu')
  const cpu = parts.find((p) => p.kind === 'cpu')
  const gpu = parts.find((p) => p.kind === 'gpu')
  const fails: string[] = []
  const rules: string[] = []
  const facts: Fact[] = []
  const missing: string[] = []
  let kitSku: string | undefined
  const num = (key: string, value: number | null | undefined, unit: string, source: string): number | null => {
    if (value === null || value === undefined) {
      missing.push(source)
      return null
    }
    facts.push({ key, value, unit, source })
    return value
  }

  if ((cooler || aio) && cpu) {
    const socket = cpu.cpu!.socket
    rules.push('socket')
    const holder = (cooler ?? aio)!
    const native = cooler ? cooler.cooler!.sockets : aio!.aio!.sockets
    if (!native.includes(socket)) {
      // The cooler record and the spare-parts list both say which sockets a kit adds: either is enough.
      const kit = cooler?.cooler!.socketsWithKit.find((k) => k.socket === socket)?.kitSku ?? catalog.spares('mounting_kit', holder.sku).find((s) => s.spare!.socket === socket)?.sku
      if (kit) kitSku = kit
      else fails.push('socket')
    }
  }
  if (cooler && box) {
    rules.push('height')
    const h = num('cooler_height', cooler.cooler!.heightMm, 'mm', `pim:${cooler.sku}.cooler.heightMm`)
    const m = num('case_max_cooler', box.case!.maxCoolerMm, 'mm', `pim:${box.sku}.case.maxCoolerMm`)
    if (h !== null && m !== null && h > m) fails.push('height')
  }
  if (aio && box) {
    rules.push('radiator')
    num('radiator', aio.aio!.radiatorMm, 'mm', `pim:${aio.sku}.aio.radiatorMm`)
    num('case_radiators', Math.max(...box.case!.radiatorsMm), 'mm', `pim:${box.sku}.case.radiatorsMm`)
    if (!box.case!.radiatorsMm.includes(aio.aio!.radiatorMm)) fails.push('radiator')
  }
  if (gpu && box) {
    rules.push('gpu_length')
    const l = num('gpu_length', gpu.gpu!.lengthMm, 'mm', `parts:${gpu.id}.lengthMm`)
    const m = num('case_max_gpu', box.case!.maxGpuMm, 'mm', `pim:${box.sku}.case.maxGpuMm`)
    if (l !== null && m !== null && l > m) fails.push('gpu_length')
  }
  if (psus.length === 1 && box) {
    rules.push('psu_length')
    const l = num('psu_length', psus[0].psu!.lengthMm, 'mm', `pim:${psus[0].sku}.psu.lengthMm`)
    const m = num('case_max_psu', box.case!.maxPsuMm, 'mm', `pim:${box.sku}.case.maxPsuMm`)
    if (l !== null && m !== null && l > m) fails.push('psu_length')
  }
  if (psus.length === 1 && cpu && gpu) {
    rules.push('wattage', 'connector')
    const need = Math.ceil((cpu.cpu!.sizingW + gpu.gpu!.boardPowerW) * policy.psu.headroom + policy.psu.baseW)
    facts.push({ key: 'need_watts', value: need, unit: 'W', source: `policy:psu (${cpu.id} ${cpu.cpu!.sizingW} W + ${gpu.id} ${gpu.gpu!.boardPowerW} W)` })
    num('psu_watts', psus[0].psu!.watts, 'W', `pim:${psus[0].sku}.psu.watts`)
    if (psus[0].psu!.watts < need) fails.push('wattage')
    if (gpu.gpu!.connector === '12v2x6' && psus[0].psu!.cableGen !== policy.connector12v2x6CableGen) fails.push('connector')
  }
  if (psus.length === 2) {
    rules.push('cable_generation')
    if (psus[0].psu!.cableGen !== psus[1].psu!.cableGen) fails.push('cable_generation')
  }
  if (missing.length) return { verdict: 'does_not_fit', reason: 'missing_data', rules, facts, missing }
  if (fails.length) return { verdict: 'does_not_fit', reason: fails[0], rules, facts, missing }
  if (kitSku) return { verdict: 'fits_with_kit', reason: 'socket_kit', kitSku, rules, facts, missing }
  return { verdict: 'fits', reason: 'ok', rules, facts, missing }
}

/** Which question the resolved items make; fewer than two items is no compatibility question. */
export function answerable(items: Item[]): boolean {
  const kinds = items.map((i) => ('own' in i ? i.own.kind : i.part.kind)).sort().join('+')
  return ['cooler+cpu', 'aio+cpu', 'case+cooler', 'aio+case', 'case+gpu', 'cpu+gpu+psu', 'case+psu', 'psu+psu'].includes(kinds)
}
