import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import { keepQuoted, problemsOf, type Extraction } from '../src/desk/agents/extract.ts'
import { Gateway } from '../src/desk/llm/gateway.ts'
import { verifyReply } from '../src/desk/review/verify.ts'
import type { DraftFacts } from '../src/desk/agents/draft.ts'
import { cfg, data } from './helpers.ts'

function fakeModels(plan: Record<string, (n: number) => { status: number; content?: string }>) {
  const n = new Map<string, number>()
  return (async (_u: unknown, init?: RequestInit) => {
    const model = JSON.parse(String(init?.body)).model as string
    const i = (n.get(model) ?? 0) + 1
    n.set(model, i)
    const r = plan[model](i)
    if (r.status !== 200) return new Response('{"error":{"message":"down"}}', { status: r.status })
    return new Response(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model, choices: [{ index: 0, message: { role: 'assistant', content: r.content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100, total_tokens: 1100 } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

describe('gateway', () => {
  const settings = { ...cfg, routes: { t: ['sm-small', 'sm-large'] } }
  test('a 503 or output off the schema hands the request to the next model; every call is in the ledger', async () => {
    const gw = new Gateway(settings, { fetch: fakeModels({ 'sm-small': () => ({ status: 503 }), 'sm-large': () => ({ status: 200, content: '{"a":1}' }) }) })
    const out = await gw.json('t', 's', 'u', z.object({ a: z.number() }))
    expect(out).toEqual({ value: { a: 1 }, model: 'sm-large' })
    expect(gw.ledger.map((e) => [e.model, e.ok])).toEqual([['sm-small', false], ['sm-large', true]])
    // 1000 × 2.5 € + 100 × 10 € per million tokens = 3500 micro-euros
    expect(gw.ledger[1].micros).toBe(3500)
    const bad = new Gateway(settings, { fetch: fakeModels({ 'sm-small': () => ({ status: 200, content: '{"a":"x"}' }), 'sm-large': () => ({ status: 200, content: '{"a":2}' }) }) })
    expect((await bad.json('t', 's', 'u', z.object({ a: z.number() }))).value).toEqual({ a: 2 })
  })
  test('a 400 is not retried on another model', async () => {
    const gw = new Gateway(settings, { fetch: fakeModels({ 'sm-small': () => ({ status: 400 }), 'sm-large': () => ({ status: 200, content: '{}' }) }) })
    await expect(gw.json('t', 's', 'u', z.object({}))).rejects.toThrow()
    expect(gw.ledger).toHaveLength(1)
  })
})

describe('reading', () => {
  const x: Extraction = { intent: 'warranty', mentions: [{ quote: 'Deep 1000', kind: 'own' }, { quote: 'Deep 14 1000', kind: 'own' }], serial_quote: null, invoice: { date_quote: '2025-04-03', serial_quote: 'SM25DP1123456', product_quote: null }, symptom_en: null, spare_item: null }
  test('a quote that is not in the text is dropped, and the drop triggers a second reading', () => {
    const { x: kept, dropped } = keepQuoted(x, 'mein Deep 1000 ist defekt', 'Rechnungsdatum: 03.04.2025 Seriennummer: SM25DP1123456')
    expect(kept.mentions.map((m) => m.quote)).toEqual(['Deep 1000'])
    expect(kept.invoice).toEqual({ date_quote: null, serial_quote: 'SM25DP1123456', product_quote: null })
    expect(dropped).toEqual(['Deep 14 1000', '2025-04-03'])
    expect(problemsOf(kept, dropped, true)).toEqual(expect.arrayContaining([expect.stringMatching(/not in the text/), 'invoice attached but not read']))
  })
})

describe('the reply check', () => {
  const facts: DraftFacts = { lang: 'de', customer: 'Lena Fischer', resolution: { kind: 'compat', verdict: 'does_not_fit', reason: 'height' }, items: ['Hush Tower Pro 5', 'Nook 400'], numbers: [{ key: 'cooler_height', value: 168, unit: 'mm' }, { key: 'case_max_cooler', value: 134, unit: 'mm' }] }
  const good = 'Hallo Lena,\n\nvielen Dank für Ihre Nachricht. Hush Tower Pro 5 und Nook 400 passen leider nicht zusammen. Zum Vergleich: Kühlerhöhe 168 mm, maximale Kühlerhöhe des Gehäuses 134 mm.\n\nViele Grüße\nIhr Stillmark Support-Team'
  test('a faithful draft passes', () => expect(verifyReply(good, facts, '').ok).toBe(true))
  test('an invented number, the opposite decision and the wrong language are each caught', () => {
    expect(verifyReply(good.replace('Zum Vergleich', 'Die Bearbeitung dauert 6 Werktage. Zum Vergleich'), facts, '').problems).toEqual(['numbers not in the facts: 6'])
    expect(verifyReply(good.replace('passen leider nicht zusammen', 'passen zusammen'), facts, '').problems[0]).toMatch(/says it fits/)
    const en = 'Hello Lena,\n\nthank you for your message. Unfortunately, Hush Tower Pro 5 and Nook 400 are not compatible. For reference: cooler height 168 mm, cooler clearance of the case 134 mm.\n\nBest regards,\nStillmark Support'
    expect(verifyReply(en, facts, '').problems[0]).toMatch(/written in en/)
  })
  test('names and summaries from the facts do not decide the language', () => {
    const kb: DraftFacts = { lang: 'de', customer: 'X', resolution: { kind: 'kb', article: 'a' }, article: { title: 'Power supply whines', summary: 'Ein leises hohes Fiepen ist normal.', url: 'https://support.stillmark.example/kb/a' } }
    const mixed = 'Hello X,\n\nthank you for your message. We have a guide for this: Ein leises hohes Fiepen ist normal. The full guide: https://support.stillmark.example/kb/a\n\nBest regards,\nStillmark Support'
    expect(verifyReply(mixed, kb, '').ok).toBe(false)
  })
})

test('help search: both retrievers agree on a clear description, not on a vague one', () => {
  const clear = data.kb.search('power supply fan is not spinning at low load, is that normal')
  expect(clear[0]).toMatchObject({ id: 'psu-fan-idle', agreed: true })
  expect(data.kb.search('fan problem in BIOS')[0].agreed).toBe(false)
})
