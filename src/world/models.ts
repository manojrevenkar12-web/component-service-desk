import { Keyed } from '../keyed.ts'
import type { Resolution } from '../wire.ts'
import { bySku, partById } from './catalog.ts'
import { localDate } from './invoice.ts'
import { wordReply, type DraftFacts } from './replies.ts'
import { addYears } from './truth.ts'
import type { ModelNoise, Scenario, World } from './world.ts'

/**
 * The language models of the simulation, behind an OpenAI-compatible endpoint. A model reads what it is sent and
 * makes the mistakes models make (drops a name, quotes text that is not there, answers in the wrong language), keyed
 * by the message, the task, the model and the attempt, so every design that sends the same request gets the same
 * answer.
 */

interface ChatRequest {
  model: string
  messages: { role: string; content: string }[]
}

export interface ModelCall {
  model: string
  task: string
  messageId: string
  promptTokens: number
  completionTokens: number
  failed: boolean
}

const SWAP_INTENT: Record<string, string> = { compatibility: 'spare_part', warranty: 'troubleshooting', troubleshooting: 'warranty', spare_part: 'compatibility', status: 'other', other: 'compatibility' }

function bend(quote: string): string {
  // A model that "quotes" by memory: right meaning, not the characters on the page.
  if (/^SM-/.test(quote)) return quote.replace('SM-', 'SM ')
  if (/\d{2}\.\d{2}\.\d{4}|\d{2}\/\d{2}\/\d{4}/.test(quote)) {
    const m = quote.match(/(\d{2})[./](\d{2})[./](\d{4})/)!
    return `${m[3]}-${m[2]}-${m[1]}`
  }
  if (/^SM\d/.test(quote)) return quote.slice(0, 6) + '-' + quote.slice(6)
  return quote.includes(' ') ? quote.replace(' ', '') : `${quote} W`
}

export class SimulatedModels {
  readonly calls: ModelCall[] = []
  /** Reply text the models wrote, with what they got wrong: the world's judge reads this, the desk cannot. */
  readonly defects = new Map<string, string[]>()
  private readonly attempts = new Map<string, number>()
  private readonly k: Keyed

  constructor(
    private readonly world: World,
    private readonly noise: Record<string, ModelNoise>,
  ) {
    this.k = new Keyed(`${world.cfg.seed}|models`)
  }

  readonly fetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const req = JSON.parse(String(init?.body)) as ChatRequest
    const system = req.messages.find((m) => m.role === 'system')?.content ?? ''
    const user = req.messages.find((m) => m.role === 'user')?.content ?? ''
    const task = system.match(/^# task: (\w+)/m)?.[1] ?? 'unknown'
    const messageId = user.match(/Message-ID: (\S+)/)?.[1] ?? (JSON.parse(user) as { messageId: string }).messageId
    const key = `${messageId}|${task}|${req.model}`
    const attempt = (this.attempts.get(key) ?? 0) + 1
    this.attempts.set(key, attempt)
    const n = this.noise[req.model]
    const promptTokens = Math.ceil((system.length + user.length) / 4)
    if (!n || this.k.chance(n.outage, key, attempt, 'outage')) {
      this.calls.push({ model: req.model, task, messageId, promptTokens, completionTokens: 0, failed: true })
      return new Response(JSON.stringify({ error: { message: 'model overloaded', type: 'server_error' } }), { status: 503, headers: { 'content-type': 'application/json' } })
    }
    const s = this.world.scenarios.get(messageId)
    if (!s) throw new Error(`the simulated model has no message ${messageId}`)
    const r = (p: number, ...more: (string | number)[]) => this.k.chance(p, key, attempt, ...more)
    let content: unknown
    if (task === 'extract') content = this.extract(s, n, r)
    else if (task === 'draft') content = this.draft(JSON.parse(user).facts as DraftFacts, n, r)
    else if (task === 'decide') content = { resolution: this.guess(s, this.world.cfg.decideOnRecords, r) }
    else if (task === 'answer') content = this.answer(s, n, r)
    else throw new Error(`unknown task ${task}`)
    const text = JSON.stringify(content)
    const completionTokens = Math.ceil(text.length / 4)
    this.calls.push({ model: req.model, task, messageId, promptTokens, completionTokens, failed: false })
    return new Response(
      JSON.stringify({
        id: `chatcmpl-${messageId}-${attempt}`,
        object: 'chat.completion',
        created: 0,
        model: req.model,
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }

  private extract(s: Scenario, n: ModelNoise, r: (p: number, ...k: (string | number)[]) => boolean) {
    const quote = (q: string, tag: string) => (r(n.inventQuote, 'q', tag) ? bend(q) : q)
    const mentions = s.mentions.filter((_, i) => !r(n.dropMention, 'drop', i)).map((m, i) => ({ quote: quote(m.phrase, `m${i}`), kind: m.kind }))
    const intent = r(n.intentSlip, 'intent') ? SWAP_INTENT[s.intent] : s.intent === 'status' ? 'status' : s.intent
    return {
      intent,
      mentions,
      serial_quote: s.serialInMail ? quote(s.serialInMail, 'serial') : null,
      invoice: s.invoiceText ? { date_quote: quote(s.invoiceText.date, 'date'), serial_quote: quote(s.invoiceText.serial, 'iserial'), product_quote: s.invoiceText.product } : null,
      symptom_en: s.symptom ? (r(n.vagueSymptom, 'vague') ? s.symptom.vague : s.symptom.en) : s.intent === 'warranty' ? 'the product is faulty' : null,
      spare_item: s.spareAsk ?? null,
    }
  }

  private draft(facts: DraftFacts, n: ModelNoise, r: (p: number, ...k: (string | number)[]) => boolean) {
    const w = { wrongLanguage: facts.lang !== 'en' && r(n.wrongLanguage, 'lang'), inventNumber: r(n.inventNumber, 'num'), flip: ['compat', 'rma', 'deny'].includes(facts.resolution.kind) && r(n.flipVerdict, 'flip') }
    const reply = wordReply(facts, w)
    const d = [w.wrongLanguage && 'wrong language', w.inventNumber && 'invented number', w.flip && 'contradicts the decision'].filter(Boolean) as string[]
    this.defects.set(reply, d)
    return { reply }
  }

  /** A model deciding by itself: right unless the ticket has a trap it falls for. */
  private guess(s: Scenario, rates: Record<string, number>, r: (p: number, ...k: (string | number)[]) => boolean): Resolution {
    const traps = s.intent === 'troubleshooting' ? ['kb', ...s.traps] : s.traps
    const p = Math.max(rates.base, ...traps.map((t) => rates[t] ?? 0))
    if (!r(p, 'wrong')) return s.truth
    const t = s.truth
    if (s.traps.includes('injection')) return { kind: 'rma', express: true }
    switch (t.kind) {
      case 'compat':
        return t.verdict === 'fits' ? { kind: 'compat', verdict: 'does_not_fit', reason: 'guess' } : { kind: 'compat', verdict: 'fits', reason: 'guess' }
      case 'ask':
        return t.missing[0] === 'model' ? { kind: 'compat', verdict: r(0.5, 'coin') ? 'fits' : 'does_not_fit', reason: 'guess' } : { kind: 'rma', express: false }
      case 'rma':
        return s.traps.includes('express') ? { kind: 'rma', express: !t.express } : s.traps.includes('expiry') ? { kind: 'deny', reason: 'expired' } : { kind: 'rma', express: !t.express }
      case 'deny':
        return { kind: 'rma', express: false }
      case 'kb': {
        const other = ['psu-fan-idle', 'case-fan-hub', 'fan-no-rpm', 'cooler-fan-clicking'].find((a) => a !== t.article)!
        return { kind: 'kb', article: other }
      }
      case 'spare':
        return { kind: 'human' }
      case 'status':
        return { kind: 'rma', express: false }
      case 'human':
        return { kind: 'spare', sku: 'SM-CLIP-HT' }
    }
  }

  private answer(s: Scenario, n: ModelNoise, r: (p: number, ...k: (string | number)[]) => boolean) {
    const rates = this.world.cfg.modelAlone
    let resolution: Resolution
    if (s.traps.includes('followUp') || s.traps.includes('resent')) resolution = r(rates.rmaOnFollowUp, 'again') ? { kind: 'rma', express: false } : { kind: 'status' }
    else resolution = this.guess(s, rates, r)
    if (resolution.kind === 'human') resolution = { kind: 'compat', verdict: 'fits', reason: 'guess' }
    const facts = this.factsFor(s, resolution)
    const w = { wrongLanguage: s.lang !== 'en' && r(n.wrongLanguage, 'lang'), inventNumber: r(n.inventNumber, 'num') }
    const reply = wordReply(facts, w)
    this.defects.set(reply, [w.wrongLanguage && 'wrong language', w.inventNumber && 'invented number'].filter(Boolean) as string[])
    return { resolution, reply, create_rma: resolution.kind === 'rma', serial: s.serial ?? null }
  }

  /** What a model answering on its own would write: names from the message, numbers it believes. */
  private factsFor(s: Scenario, res: Resolution): DraftFacts {
    const items = s.mentions.map((m) => m.phrase)
    const product = s.sku ? bySku.get(s.sku)! : undefined
    const years = product ? this.world.policy.warrantyYears[product.series] : undefined
    const numbers: DraftFacts['numbers'] = []
    for (const m of s.mentions) {
      const p = m.kind === 'own' ? bySku.get(m.ref) : undefined
      const part = m.kind !== 'own' ? partById.get(m.ref) : undefined
      if (p?.cooler) numbers.push({ key: 'cooler_height', value: p.cooler.heightMm!, unit: 'mm' })
      if (p?.case && s.compatKind === 'cooler_case') numbers.push({ key: 'case_max_cooler', value: p.case.maxCoolerMm!, unit: 'mm' })
      if (part?.gpu && s.compatKind === 'gpu_case') numbers.push({ key: 'gpu_length', value: part.gpu.lengthMm, unit: 'mm' })
    }
    return {
      lang: s.lang,
      customer: s.customer,
      resolution: res,
      items,
      numbers: res.kind === 'compat' ? numbers : [],
      kitSku: 'SM-KIT-1851',
      rmaNumber: 'RMA-PENDING',
      product: product?.name,
      purchaseDate: s.purchaseDate ? localDate(s.purchaseDate, s.lang) : undefined,
      warrantyUntil: s.purchaseDate && years ? localDate(addYears(s.purchaseDate, years), s.lang) : undefined,
      warrantyYears: years,
      country: s.country,
      options: items,
      article: res.kind === 'kb' ? { title: res.article, summary: '', url: `https://support.stillmark.example/kb/${res.article}` } : undefined,
      spare: res.kind === 'spare' ? { sku: res.sku, name: res.sku } : undefined,
      socket: 'LGA1851',
      genA: 'C4',
      genB: 'C5',
    }
  }
}
