import { describe, expect, test } from 'vitest'
import { makeSerial, serialValid } from '../src/catalog-shape.ts'
import { Catalog } from '../src/desk/domain/catalog.ts'
import { checkCompat } from '../src/desk/domain/compat.ts'
import { detectLanguage } from '../src/desk/domain/language.ts'
import { decideWarranty, parseLocalDate, plusYears } from '../src/desk/domain/warranty.ts'
import { data } from './helpers.ts'

const cat = new Catalog(data.pim, data.parts)
const own = (q: string) => ({ own: cat.own(q).candidates[0] })
const part = (q: string, k: 'cpu' | 'gpu') => ({ part: cat.part(q, k).part! })

describe('identifiers decide, names propose', () => {
  test('an article number or a valid serial names exactly one product', () => {
    expect(cat.own('SM-TD850').candidates.map((c) => c.sku)).toEqual(['SM-TD850'])
    const serial = makeSerial('25', 'DP1', 12345)
    expect(serialValid(serial)).toBe(true)
    expect(cat.own(serial).candidates.map((c) => c.sku)).toEqual(['SM-DP1000'])
  })
  test('a serial with one wrong digit fails its check digit and names nothing', () => {
    const s = makeSerial('25', 'DP1', 12345)
    const typo = s.slice(0, 9) + ((Number(s[9]) + 1) % 10) + s.slice(10)
    expect(serialValid(typo)).toBe(false)
    expect(cat.own(typo).candidates).toHaveLength(0)
  })
  test('a shared name proposes every product it fits', () => {
    expect(cat.own('Tide 850').candidates.map((c) => c.sku).sort()).toEqual(['SM-TB850', 'SM-TD850'])
    expect(cat.own('Tide 12 850W').candidates.map((c) => c.sku)).toEqual(['SM-TD850'])
  })
  test('a card launched after the parts database refresh is not found', () => {
    expect(cat.part('Nimbus RTX 5080 Super', 'gpu').part).toBeNull()
  })
})

describe('compatibility rules', () => {
  test('socket: a kit counts when the cooler record or the spare-parts list names it', () => {
    const r = checkCompat(data.policy, cat, [own('Hush Tower 5'), part('Core Ultra 7 265K', 'cpu')])
    expect(r).toMatchObject({ verdict: 'fits_with_kit', kitSku: 'SM-KIT-1851' })
    expect(checkCompat(data.policy, cat, [own('Slim Hush 2'), part('265K', 'cpu')]).reason).toBe('socket')
  })
  test('power: headroom, then the 12V-2x6 connector needs cable generation C5', () => {
    // (250 + 360) × 1.3 + 75 = 868 W
    expect(checkCompat(data.policy, cat, [own('Tide 12 850'), part('265K', 'cpu'), part('Aero RTX 5080', 'gpu')]).reason).toBe('wattage')
    expect(checkCompat(data.policy, cat, [own('Tide 12 1000'), part('265K', 'cpu'), part('Aero RTX 5080', 'gpu')]).verdict).toBe('fits')
    expect(checkCompat(data.policy, cat, [own('Deep 13 1000'), part('265K', 'cpu'), part('Aero RTX 5080', 'gpu')]).reason).toBe('connector')
  })
  test('cables: modular cables only within one generation', () => {
    expect(checkCompat(data.policy, cat, [own('Tide 11 850'), own('Deep 14 1000')]).reason).toBe('cable_generation')
    expect(checkCompat(data.policy, cat, [own('Tide 12 850'), own('Deep 14 1000')]).verdict).toBe('fits')
  })
  test('a field the PIM export lacks is reported, never guessed', () => {
    const r = checkCompat(data.policy, cat, [own('Deep Pro 13 1600'), own('Harbor 802')])
    expect(r.reason).toBe('missing_data')
    expect(r.missing).toEqual(['pim:SM-HB802.case.maxPsuMm'])
  })
})

describe('warranty', () => {
  const deep = cat.sku('SM-DP1000')!
  test('years run from the invoice date; express only for Deep in DE and FR within 24 months', () => {
    expect(decideWarranty(data.policy, deep, '2025-03-01', '2026-10-06', 'DE').resolution).toEqual({ kind: 'rma', express: true })
    expect(decideWarranty(data.policy, deep, '2025-03-01', '2026-10-06', 'PL').resolution).toEqual({ kind: 'rma', express: false })
    expect(decideWarranty(data.policy, deep, '2024-03-01', '2026-10-06', 'DE').resolution).toEqual({ kind: 'rma', express: false })
    expect(decideWarranty(data.policy, cat.sku('SM-EM550')!, '2023-10-05', '2026-10-06', 'DE').resolution).toEqual({ kind: 'deny', reason: 'expired' })
    expect(decideWarranty(data.policy, cat.sku('SM-EM550')!, '2023-10-06', '2026-10-06', 'DE').resolution.kind).toBe('rma')
  })
  test('dates: European formats only, impossible dates rejected, leap days kept', () => {
    expect(parseLocalDate('Rechnungsdatum: 03.04.2025')).toBe('2025-04-03')
    expect(parseLocalDate('Date de facture : 31/12/2024')).toBe('2024-12-31')
    expect(parseLocalDate('31.02.2025')).toBeNull()
    expect(parseLocalDate('2025-04-03')).toBeNull()
    expect(plusYears('2024-02-29', 3)).toBe('2027-02-28')
  })
})

test('language by the commonest small words', () => {
  expect(detectLanguage('Passt der Kühler auf meinen Prozessor? Ich habe ein Problem mit dem Netzteil.')).toBe('de')
  expect(detectLanguage('Est-ce que le ventirad est compatible avec mon processeur ?')).toBe('fr')
  expect(detectLanguage('Czy zasilacz wystarczy do mojego komputera? Nie jestem pewien.')).toBe('pl')
  expect(detectLanguage('Will the cooler fit on my CPU?')).toBe('en')
})
