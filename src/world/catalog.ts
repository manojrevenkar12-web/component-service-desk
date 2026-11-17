import type { PartRecord, PimRecord } from '../catalog-shape.ts'

/**
 * The maker's true catalog. Stillmark is a fictional brand; every product name, size and number here is invented.
 * The PIM export the desk reads is made from this with the gaps a real PIM has (see `pimExport`).
 */

const at = '2026-09-01'

function psu(sku: string, name: string, aliases: string[], series: string, code: string, watts: number, cableGen: 'C4' | 'C5', lengthMm: number, legacy = false): PimRecord {
  return { sku, name, aliases, kind: 'psu', series, serialCode: code, status: legacy ? 'legacy' : 'active', psu: { watts, cableGen, lengthMm }, updatedAt: at }
}

export const PRODUCTS: PimRecord[] = [
  psu('SM-EM550', 'Ember 550W', ['Ember 550'], 'ember', 'EM5', 550, 'C4', 140),
  psu('SM-EM650', 'Ember 650W', ['Ember 650'], 'ember', 'EM6', 650, 'C4', 140),
  psu('SM-EM750', 'Ember 750W', ['Ember 750'], 'ember', 'EM7', 750, 'C4', 150),
  psu('SM-TD750', 'Tide 12 750W', ['Tide 12 750', 'Tide 750'], 'tide', 'TD7', 750, 'C5', 150),
  psu('SM-TD850', 'Tide 12 850W', ['Tide 12 850', 'Tide 850'], 'tide', 'TD8', 850, 'C5', 160),
  psu('SM-TD1000', 'Tide 12 1000W', ['Tide 12 1000', 'Tide 1000'], 'tide', 'TD1', 1000, 'C5', 170),
  psu('SM-TB750', 'Tide 11 750W', ['Tide 11 750', 'Tide 750'], 'tide', 'TB7', 750, 'C4', 160, true),
  psu('SM-TB850', 'Tide 11 850W', ['Tide 11 850', 'Tide 850'], 'tide', 'TB8', 850, 'C4', 160, true),
  psu('SM-DP850', 'Deep 14 850W', ['Deep 14 850', 'Deep 850'], 'deep', 'DP8', 850, 'C5', 170),
  psu('SM-DP1000', 'Deep 14 1000W', ['Deep 14 1000', 'Deep 1000'], 'deep', 'DP1', 1000, 'C5', 180),
  psu('SM-DP1200', 'Deep 14 1200W', ['Deep 14 1200', 'Deep 1200'], 'deep', 'DP2', 1200, 'C5', 190),
  psu('SM-DO1000', 'Deep 13 1000W', ['Deep 13 1000', 'Deep 1000'], 'deep', 'DO1', 1000, 'C4', 180, true),
  psu('SM-DQ1300', 'Deep Pro 13 1300W', ['Deep Pro 13 1300', 'Deep Pro 1300'], 'deep-pro', 'DQ3', 1300, 'C5', 200),
  psu('SM-DQ1600', 'Deep Pro 13 1600W', ['Deep Pro 13 1600', 'Deep Pro 1600'], 'deep-pro', 'DQ6', 1600, 'C5', 210),
  {
    sku: 'SM-HT5', name: 'Hush Tower 5', aliases: ['Hush Tower 5'], kind: 'cooler', series: 'hush', serialCode: 'HT5', status: 'active',
    cooler: { heightMm: 162, sockets: ['AM5', 'AM4', 'LGA1700'], socketsWithKit: [{ socket: 'LGA1851', kitSku: 'SM-KIT-1851' }] }, updatedAt: at,
  },
  {
    sku: 'SM-HP5', name: 'Hush Tower Pro 5', aliases: ['Hush Tower Pro 5', 'Hush Tower Pro'], kind: 'cooler', series: 'hush', serialCode: 'HP5', status: 'active',
    cooler: { heightMm: 168, sockets: ['AM5', 'AM4', 'LGA1700', 'LGA1851'], socketsWithKit: [] }, updatedAt: at,
  },
  {
    sku: 'SM-SH2', name: 'Slim Hush 2', aliases: ['Slim Hush 2', 'Slim Hush'], kind: 'cooler', series: 'hush', serialCode: 'SH2', status: 'active',
    cooler: { heightMm: 135, sockets: ['AM5', 'AM4', 'LGA1700'], socketsWithKit: [] }, updatedAt: at,
  },
  {
    sku: 'SM-FL240', name: 'Flowline 240', aliases: ['Flowline 240'], kind: 'aio', series: 'flowline', serialCode: 'FL2', status: 'active',
    aio: { radiatorMm: 240, sockets: ['AM5', 'AM4', 'LGA1700', 'LGA1851'] }, updatedAt: at,
  },
  {
    sku: 'SM-FL360', name: 'Flowline 360', aliases: ['Flowline 360'], kind: 'aio', series: 'flowline', serialCode: 'FL3', status: 'active',
    aio: { radiatorMm: 360, sockets: ['AM5', 'AM4', 'LGA1700', 'LGA1851'] }, updatedAt: at,
  },
  {
    sku: 'SM-HB600', name: 'Harbor 600', aliases: ['Harbor 600'], kind: 'case', series: 'harbor', serialCode: 'HB6', status: 'active',
    case: { maxCoolerMm: 170, maxGpuMm: 380, maxPsuMm: 200, radiatorsMm: [240, 280, 360] }, updatedAt: at,
  },
  {
    sku: 'SM-HB802', name: 'Harbor 802', aliases: ['Harbor 802'], kind: 'case', series: 'harbor', serialCode: 'HB8', status: 'active',
    case: { maxCoolerMm: 185, maxGpuMm: 430, maxPsuMm: 220, radiatorsMm: [240, 280, 360, 420] }, updatedAt: at,
  },
  {
    sku: 'SM-NK400', name: 'Nook 400', aliases: ['Nook 400'], kind: 'case', series: 'nook', serialCode: 'NK4', status: 'active',
    case: { maxCoolerMm: 134, maxGpuMm: 330, maxPsuMm: 160, radiatorsMm: [240] }, updatedAt: at,
  },
  { sku: 'SM-DR4-120', name: 'Drift 4 120mm', aliases: ['Drift 4 120'], kind: 'fan', series: 'drift', serialCode: 'DR2', status: 'active', fan: { sizeMm: 120 }, updatedAt: at },
  { sku: 'SM-DR4-140', name: 'Drift 4 140mm', aliases: ['Drift 4 140'], kind: 'fan', series: 'drift', serialCode: 'DR4', status: 'active', fan: { sizeMm: 140 }, updatedAt: at },
  {
    sku: 'SM-KIT-1851', name: 'Mounting kit LGA1851 (Hush Tower 5)', aliases: [], kind: 'spare', series: 'spare', serialCode: null, status: 'active',
    spare: { item: 'mounting_kit', forSkus: ['SM-HT5'], socket: 'LGA1851' }, updatedAt: at,
  },
  {
    sku: 'SM-CLIP-HT', name: 'Fan clips, Hush coolers', aliases: [], kind: 'spare', series: 'spare', serialCode: null, status: 'active',
    spare: { item: 'fan_clips', forSkus: ['SM-HT5', 'SM-HP5', 'SM-SH2'] }, updatedAt: at,
  },
  {
    sku: 'SM-CBL-12V-C5', name: '12V-2x6 cable, C5 power supplies', aliases: [], kind: 'spare', series: 'spare', serialCode: null, status: 'active',
    spare: { item: 'cable_12v2x6', forSkus: ['SM-TD750', 'SM-TD850', 'SM-TD1000', 'SM-DP850', 'SM-DP1000', 'SM-DP1200', 'SM-DQ1300', 'SM-DQ1600'] }, updatedAt: at,
  },
]

/** Third-party parts. Chip names are real; the board partners (Nimbus, Aero, Volta) and their numbers are invented. */
export const PARTS: PartRecord[] = [
  { id: 'cpu-9800x3d', kind: 'cpu', name: 'AMD Ryzen 7 9800X3D', aliases: ['Ryzen 7 9800X3D', '9800X3D'], cpu: { socket: 'AM5', sizingW: 162 } },
  { id: 'cpu-7600', kind: 'cpu', name: 'AMD Ryzen 5 7600', aliases: ['Ryzen 5 7600'], cpu: { socket: 'AM5', sizingW: 88 } },
  { id: 'cpu-5800x3d', kind: 'cpu', name: 'AMD Ryzen 7 5800X3D', aliases: ['Ryzen 7 5800X3D', '5800X3D'], cpu: { socket: 'AM4', sizingW: 142 } },
  { id: 'cpu-265k', kind: 'cpu', name: 'Intel Core Ultra 7 265K', aliases: ['Core Ultra 7 265K', 'Ultra 7 265K', '265K'], cpu: { socket: 'LGA1851', sizingW: 250 } },
  { id: 'cpu-285k', kind: 'cpu', name: 'Intel Core Ultra 9 285K', aliases: ['Core Ultra 9 285K', 'Ultra 9 285K', '285K'], cpu: { socket: 'LGA1851', sizingW: 250 } },
  { id: 'cpu-14600k', kind: 'cpu', name: 'Intel Core i5-14600K', aliases: ['i5-14600K', '14600K'], cpu: { socket: 'LGA1700', sizingW: 181 } },
  { id: 'cpu-14900k', kind: 'cpu', name: 'Intel Core i9-14900K', aliases: ['i9-14900K', '14900K'], cpu: { socket: 'LGA1700', sizingW: 253 } },
  { id: 'gpu-n5090', kind: 'gpu', name: 'Nimbus RTX 5090 OC', aliases: ['Nimbus RTX 5090 OC', 'Nimbus RTX 5090'], gpu: { boardPowerW: 600, lengthMm: 357, connector: '12v2x6' } },
  { id: 'gpu-a5080', kind: 'gpu', name: 'Aero RTX 5080', aliases: ['Aero RTX 5080'], gpu: { boardPowerW: 360, lengthMm: 304, connector: '12v2x6' } },
  { id: 'gpu-n5070ti', kind: 'gpu', name: 'Nimbus RTX 5070 Ti', aliases: ['Nimbus RTX 5070 Ti'], gpu: { boardPowerW: 300, lengthMm: 312, connector: '12v2x6' } },
  { id: 'gpu-a5070', kind: 'gpu', name: 'Aero RTX 5070', aliases: ['Aero RTX 5070'], gpu: { boardPowerW: 250, lengthMm: 242, connector: '12v2x6' } },
  { id: 'gpu-v9070xt', kind: 'gpu', name: 'Volta RX 9070 XT', aliases: ['Volta RX 9070 XT'], gpu: { boardPowerW: 304, lengthMm: 322, connector: '3x8pin' } },
  { id: 'gpu-v9060xt', kind: 'gpu', name: 'Volta RX 9060 XT', aliases: ['Volta RX 9060 XT'], gpu: { boardPowerW: 160, lengthMm: 230, connector: '1x8pin' } },
  { id: 'gpu-a5060ti', kind: 'gpu', name: 'Aero RTX 5060 Ti', aliases: ['Aero RTX 5060 Ti'], gpu: { boardPowerW: 180, lengthMm: 228, connector: '1x8pin' } },
  { id: 'gpu-n5080s', kind: 'gpu', name: 'Nimbus RTX 5080 Super', aliases: ['Nimbus RTX 5080 Super'], gpu: { boardPowerW: 400, lengthMm: 340, connector: '12v2x6' } },
  { id: 'gpu-v9070gre', kind: 'gpu', name: 'Volta RX 9070 GRE', aliases: ['Volta RX 9070 GRE'], gpu: { boardPowerW: 260, lengthMm: 300, connector: '2x8pin' } },
]

/** Cards launched after the last parts-database refresh: the desk cannot look them up. */
export const PARTS_DB_MISSING = new Set(['gpu-n5080s', 'gpu-v9070gre'])

/**
 * The PIM export as the desk receives it. Two known defects, kept on purpose:
 * the Harbor 802 record lost its power-supply length, and the Slim Hush 2 still carries the height of the
 * pre-series sample (133 mm instead of 135 mm).
 */
export function pimExport(): PimRecord[] {
  const out = structuredClone(PRODUCTS)
  for (const r of out) {
    if (r.sku === 'SM-HB802' && r.case) {
      r.case.maxPsuMm = null
      r.updatedAt = '2025-02-11'
    }
    if (r.sku === 'SM-SH2' && r.cooler) {
      r.cooler.heightMm = 133
      r.updatedAt = '2024-11-04'
    }
  }
  return out
}

export function partsExport(): PartRecord[] {
  return structuredClone(PARTS.filter((p) => !PARTS_DB_MISSING.has(p.id)))
}

export const bySku = new Map(PRODUCTS.map((p) => [p.sku, p]))
export const partById = new Map(PARTS.map((p) => [p.id, p]))
