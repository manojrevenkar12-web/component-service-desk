import { makeSerial, type PartRecord, type PimRecord, type Policy } from '../catalog-shape.ts'
import { Keyed } from '../keyed.ts'
import type { InboundMail, Lang, Resolution } from '../wire.ts'
import { bySku, PARTS, PARTS_DB_MISSING, partById, PRODUCTS } from './catalog.ts'
import { invoicePdf, localDate, scannedPdf, type InvoiceLang } from './invoice.ts'
import * as P from './phrases.ts'
import { addYears, compatTruth, warrantyTruth, type Entity } from './truth.ts'

export type Intent = 'compatibility' | 'warranty' | 'troubleshooting' | 'spare_part' | 'other' | 'status'

export interface WorldConfig {
  seed: string
  start: string
  days: number
  tickets: number
  intentMix: Record<string, number>
  countryMix: Record<string, number>
  compatMix: Record<string, number>
  naming: { sharedAliasShare: number; skuShare: number }
  newPartShare: number
  warranty: {
    productMix: Record<string, number>
    invoicePdf: number
    invoiceScan: number
    serialInMail: number
    serialTypo: number
    mailDateShare: number
    mailDateWrong: number
    expiredShare: number
    nearExpiryShare: number
    followUpShare: number
    resentShare: number
  }
  injectionShare: number
  models: Record<string, ModelNoise>
  modelAlone: Record<string, number>
  decideOnRecords: Record<string, number>
  sap: { ghostTimeout: number }
  people: PeopleConfig
}

export interface ModelNoise {
  outage: number
  dropMention: number
  inventQuote: number
  intentSlip: number
  vagueSymptom: number
  wrongLanguage: number
  inventNumber: number
  flipVerdict: number
}

export interface PeopleConfig {
  agents: number
  shift: { from: number; to: number; weekdays: number[] }
  minutes: Record<Intent, number>
  fromPreparedFactor: number
  approveMinutes: number
  fixMinutes: number
  error: Record<Intent, number>
  duplicateRma: number
  catchDraftError: number
  costPerMinuteCents: number
}

export interface Mention {
  ref: string
  kind: 'own' | 'cpu' | 'gpu'
  phrase: string
}

/** Everything the world knows about one message, including what the right answer is. */
export interface Scenario {
  messageId: string
  threadId: string
  intent: Intent
  lang: Lang
  country: string
  customer: string
  receivedAt: string
  mentions: Mention[]
  compatKind?: P.CompatKind
  /** Warranty: the product, its serial and when it was bought. */
  sku?: string
  serial?: string
  serialInMail?: string
  purchaseDate?: string
  invoice?: 'pdf' | 'scan' | 'none'
  invoiceText?: { date: string; serial: string; product: string }
  symptom?: P.Symptom
  spareAsk?: P.SpareAsk
  injection: boolean
  /** What makes this ticket hard: the noise of model-only designs keys on these. */
  traps: string[]
  truth: Resolution
  /** Numbers a correct reply may contain. */
  facts: string[]
  firstOf?: string
}

export interface WorldTicket {
  mail: InboundMail
  scenario: Scenario
}

function pickWeighted<T extends string>(k: Keyed, mix: Record<string, number>, ...key: (string | number)[]): T {
  const entries = Object.entries(mix)
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let u = k.u(...key) * total
  for (const [name, w] of entries) {
    u -= w
    if (u < 0) return name as T
  }
  return entries[entries.length - 1][0] as T
}

const LANG_OF: Record<string, Lang> = { DE: 'de', AT: 'de', CH: 'de', FR: 'fr', BE: 'fr', LU: 'fr', PL: 'pl', NL: 'en', GB: 'en', US: 'en' }
const INVOICE_LANG: Record<Lang, InvoiceLang> = { de: 'de', en: 'en', fr: 'fr', pl: 'de' }

function fill(t: string, v: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? `{${k}}`)
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

function priceCents(p: PimRecord): number {
  if (p.psu) return Math.round(p.psu.watts * 17 + 1990)
  return { cooler: 8990, aio: 13990, case: 15990, fan: 2490, spare: 990, psu: 0 }[p.kind]
}

function isoAt(start: string, minutes: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + minutes * 60_000).toISOString()
}

export class World {
  readonly k: Keyed
  readonly scenarios = new Map<string, Scenario>()

  constructor(
    readonly policy: Policy,
    readonly cfg: WorldConfig,
  ) {
    this.k = new Keyed(cfg.seed)
  }

  private nameOf(p: PimRecord, key: string): string {
    const shared = p.aliases.find((a) => PRODUCTS.some((q) => q !== p && q.aliases.includes(a)))
    if (shared && this.k.chance(this.cfg.naming.sharedAliasShare, key, 'shared')) return shared
    if (this.k.chance(this.cfg.naming.skuShare, key, 'sku')) return p.sku
    const own = p.aliases.filter((a) => a !== shared)
    return own.length ? this.k.pick(own, key, 'alias') : p.name
  }

  private partName(p: PartRecord, key: string): string {
    return this.k.pick(p.aliases, key, 'alias')
  }

  private pickProduct(kind: string, key: string, filter: (p: PimRecord) => boolean = () => true): PimRecord {
    const pool = PRODUCTS.filter((p) => p.kind === kind && filter(p))
    return this.k.pick(pool, key)
  }

  private pickPart(kind: 'cpu' | 'gpu', key: string): PartRecord {
    const missing = PARTS.filter((p) => p.kind === kind && PARTS_DB_MISSING.has(p.id))
    if (missing.length && this.k.chance(this.cfg.newPartShare, key, 'new')) return this.k.pick(missing, key, 'm')
    return this.k.pick(PARTS.filter((p) => p.kind === kind && !PARTS_DB_MISSING.has(p.id)), key, 'known')
  }

  /** All products that share the phrase a customer used: a shared alias names more than one. */
  candidates(phrase: string): PimRecord[] {
    return PRODUCTS.filter((p) => p.sku === phrase || p.aliases.includes(phrase))
  }

  private compat(id: string, lang: Lang): Omit<Scenario, 'messageId' | 'threadId' | 'country' | 'customer' | 'receivedAt' | 'lang' | 'injection'> {
    const kind = pickWeighted<P.CompatKind>(this.k, this.cfg.compatMix, id, 'ck')
    const own = (k: string, f?: (p: PimRecord) => boolean) => this.pickProduct(k, `${id}|${k}|${f ? 'f' : ''}`, f)
    let ents: { e: Entity; ref: string; mkind: Mention['kind'] }[]
    const o = (p: PimRecord) => ({ e: { own: p } as Entity, ref: p.sku, mkind: 'own' as const })
    const t = (p: PartRecord) => ({ e: { part: p } as Entity, ref: p.id, mkind: p.kind })
    switch (kind) {
      case 'cooler_cpu':
        ents = [o(own('cooler')), t(this.pickPart('cpu', id))]
        break
      case 'cooler_case':
        ents = [o(own('cooler')), o(own('case'))]
        break
      case 'aio_case':
        ents = [o(own('aio')), o(own('case'))]
        break
      case 'gpu_case':
        ents = [t(this.pickPart('gpu', id)), o(own('case'))]
        break
      case 'psu_build':
        ents = [o(own('psu')), t(this.pickPart('cpu', id)), t(this.pickPart('gpu', id))]
        break
      case 'psu_case':
        ents = [o(own('psu')), o(own('case'))]
        break
      case 'cable_reuse': {
        const a = own('psu')
        const b = this.pickProduct('psu', `${id}|psu2`, (p) => p.sku !== a.sku && p.status === 'active')
        ents = [o(a), o(b)]
        break
      }
    }
    const mentions: Mention[] = ents.map((x, i) => ({
      ref: x.ref,
      kind: x.mkind,
      phrase: x.mkind === 'own' ? this.nameOf(bySku.get(x.ref)!, `${id}|n${i}`) : this.partName(partById.get(x.ref)!, `${id}|n${i}`),
    }))
    // The truth for a phrase that names several products: the answer if they all agree, otherwise ask which one.
    const variants: Entity[][] = [[]]
    for (const [i, x] of ents.entries()) {
      const opts: Entity[] = x.mkind === 'own' ? this.candidates(mentions[i].phrase).map((p) => ({ own: p })) : [x.e]
      const next: Entity[][] = []
      for (const v of variants) for (const e of opts) next.push([...v, e])
      variants.splice(0, variants.length, ...next)
    }
    const verdicts = variants.map((v) => compatTruth(this.policy, v))
    const actual = compatTruth(this.policy, ents.map((x) => x.e))
    const agree = verdicts.every((v) => v.verdict === verdicts[0].verdict)
    const truth: Resolution = agree ? { kind: 'compat', verdict: actual.verdict, reason: actual.reason } : { kind: 'ask', missing: ['model'] }
    const traps: string[] = []
    if (variants.length > 1) traps.push('sharedAlias')
    if (actual.verdict === 'fits_with_kit') traps.push('kit')
    if (kind === 'cable_reuse') traps.push('cables')
    if (ents.some((x) => x.mkind !== 'own' && PARTS_DB_MISSING.has(x.ref))) traps.push('unknownPart')
    if (actual.reason === 'connector') traps.push('connector')
    const facts: string[] = []
    for (const x of ents) {
      if ('own' in x.e) {
        const p = x.e.own
        if (p.psu) facts.push(String(p.psu.watts), String(p.psu.lengthMm))
        if (p.cooler) facts.push(String(p.cooler.heightMm))
        if (p.aio) facts.push(String(p.aio.radiatorMm))
        if (p.case) facts.push(String(p.case.maxCoolerMm), String(p.case.maxGpuMm), String(p.case.maxPsuMm), ...p.case.radiatorsMm.map(String))
      } else {
        const p = x.e.part
        if (p.gpu) facts.push(String(p.gpu.lengthMm), String(p.gpu.boardPowerW))
        if (p.cpu) facts.push(String(p.cpu.sizingW))
      }
    }
    const psu = ents.find((x) => x.mkind === 'own' && bySku.get(x.ref)!.kind === 'psu')
    const cpu = ents.find((x) => x.mkind === 'cpu')
    const gpu = ents.find((x) => x.mkind === 'gpu')
    if (kind === 'psu_build' && psu && cpu && gpu) {
      const need = Math.ceil((partById.get(cpu.ref)!.cpu!.sizingW + partById.get(gpu.ref)!.gpu!.boardPowerW) * this.policy.psu.headroom + this.policy.psu.baseW)
      facts.push(String(need))
      if (Math.abs(need - bySku.get(psu.ref)!.psu!.watts) <= 80) traps.push('nearLimit')
    }
    void lang
    return { intent: 'compatibility', mentions, compatKind: kind, traps, truth, facts }
  }

  private warrantyCase(id: string, country: string, receivedDate: string) {
    const w = this.cfg.warranty
    const kind = pickWeighted<string>(this.k, w.productMix, id, 'wk')
    const product = this.pickProduct(kind, `${id}|wp`)
    const years = this.policy.warrantyYears[product.series]
    const expired = this.k.chance(w.expiredShare, id, 'exp')
    const near = this.k.chance(w.nearExpiryShare, id, 'near')
    let ageDays: number
    if (near) ageDays = Math.round(years * 365.25 + this.k.between(-25, 25, id, 'nd'))
    else if (expired) ageDays = Math.round(years * 365.25 + this.k.between(30, 900, id, 'ed'))
    else ageDays = Math.round(this.k.between(20, years * 365.25 - 30, id, 'ad'))
    if (product.status === 'legacy') ageDays = Math.max(ageDays, 800)
    const purchaseDate = new Date(Date.parse(`${receivedDate}T00:00:00Z`) - ageDays * 86_400_000).toISOString().slice(0, 10)
    const serial = makeSerial(purchaseDate.slice(2, 4), product.serialCode!, this.k.int(10000, 99999, id, 'sn'))
    const r = this.k.u(id, 'inv')
    const invoice: Scenario['invoice'] = r < w.invoicePdf ? 'pdf' : r < w.invoicePdf + w.invoiceScan ? 'scan' : 'none'
    return { product, purchaseDate, serial, invoice, years }
  }

  private async mailFor(s: Scenario, extra: { body: string; attachments: InboundMail['attachments'] }): Promise<WorldTicket> {
    const mail: InboundMail = {
      messageId: s.messageId,
      threadId: s.threadId,
      from: `${s.customer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0142/g, 'l').replace(/\u0131/g, 'i').replace(/[^a-z]+/g, '.')}@mail.example`,
      country: s.country,
      receivedAt: s.receivedAt,
      subject: P.SUBJECT[s.lang][s.intent],
      body: extra.body,
      attachments: extra.attachments,
    }
    this.scenarios.set(s.messageId, s)
    return { mail, scenario: s }
  }

  /** Every message of the period, in the order they arrive. Same seed, same messages, whatever any design does. */
  async tickets(): Promise<WorldTicket[]> {
    const out: WorldTicket[] = []
    const cfg = this.cfg
    const follow: { at: number; make: () => Promise<WorldTicket> }[] = []
    const arrivals = Array.from({ length: cfg.tickets }, (_, i) => {
      const day = Math.floor(this.k.u('day', i) * cfg.days)
      const hour = 7 + 16 * Math.pow(this.k.u('hour', i), 1.3)
      return day * 1440 + Math.floor(hour * 60)
    }).sort((a, b) => a - b)
    for (const [i, minute] of arrivals.entries()) {
      const id = `${cfg.seed}-${String(i).padStart(4, '0')}`
      const country = pickWeighted<string>(this.k, cfg.countryMix, id, 'country')
      const lang = LANG_OF[country]
      const customer = this.k.pick(P.NAMES[lang], id, 'name')
      const receivedAt = isoAt(cfg.start, minute)
      const intent = pickWeighted<Intent>(this.k, cfg.intentMix, id, 'intent')
      const injection = this.k.chance(cfg.injectionShare, id, 'inj')
      const base = { messageId: `<${id}@mail.example>`, threadId: `<${id}@mail.example>`, lang, country, customer, receivedAt, injection }
      const greet = this.k.pick(P.GREETING[lang], id, 'g')
      const close = `${this.k.pick(P.CLOSING[lang], id, 'c')}\n${customer}`
      const wrap = (core: string) => `${greet}\n\n${cap(core)}${injection ? `\n\n${P.INJECTION[lang]}` : ''}\n\n${close}\n`
      if (intent === 'compatibility') {
        const c = this.compat(id, lang)
        const tpl = this.k.pick(P.COMPAT[lang][c.compatKind!], id, 'tpl')
        const body = wrap(fill(tpl, { A: c.mentions[0].phrase, B: c.mentions[1].phrase, C: c.mentions[2]?.phrase ?? '' }))
        if (injection) c.traps.push('injection')
        out.push(await this.mailFor({ ...base, ...c }, { body, attachments: [] }))
      } else if (intent === 'warranty') {
        const w = this.warrantyCase(id, country, receivedAt.slice(0, 10))
        const wc = cfg.warranty
        const phrase = this.nameOf(w.product, `${id}|wn`)
        let serialInMail: string | undefined
        if (this.k.chance(wc.serialInMail, id, 'sim')) {
          serialInMail = w.serial
          if (this.k.chance(wc.serialTypo, id, 'typo')) {
            const pos = 7 + this.k.int(0, 4, id, 'tp')
            const d = (Number(w.serial[pos]) + 1 + this.k.int(0, 7, id, 'td')) % 10
            serialInMail = w.serial.slice(0, pos) + d + w.serial.slice(pos + 1)
          }
        }
        let mailDate = w.purchaseDate
        if (this.k.chance(wc.mailDateWrong, id, 'mdw')) mailDate = new Date(Date.parse(`${w.purchaseDate}T00:00:00Z`) - this.k.int(40, 400, id, 'mdd') * 86_400_000).toISOString().slice(0, 10)
        const W = P.WARRANTY[lang]
        const dealer = this.k.pick(P.DEALERS[lang], id, 'dealer')
        const core = fill(W.body, {
          P: phrase,
          S: P.DEFECT[lang][w.product.kind as P.SymptomKind],
          DATE: this.k.chance(wc.mailDateShare, id, 'md') ? fill(W.date, { d: localDate(mailDate, lang) }) : W.vague,
          D: dealer,
          SERIAL: serialInMail ? fill(W.serial, { s: serialInMail }) : '',
          INVOICE: w.invoice === 'none' ? '' : W.invoice,
        })
        const attachments: InboundMail['attachments'] = []
        const invLang = INVOICE_LANG[lang]
        const invNo = `${invLang === 'de' ? 'RE' : invLang === 'fr' ? 'FA' : 'INV'}-${w.purchaseDate.slice(0, 4)}-${this.k.int(10000, 99999, id, 'invno')}`
        if (w.invoice === 'pdf') {
          const pdf = await invoicePdf({ lang: invLang, dealer, number: invNo, date: w.purchaseDate, customer, productName: w.product.name, sku: w.product.sku, serial: w.serial, priceCents: priceCents(w.product) })
          attachments.push({ filename: `${invNo}.pdf`, contentType: 'application/pdf', base64: Buffer.from(pdf).toString('base64') })
        } else if (w.invoice === 'scan') {
          const pdf = await scannedPdf(w.purchaseDate)
          attachments.push({ filename: `scan_${this.k.int(1000, 9999, id, 'scan')}.pdf`, contentType: 'application/pdf', base64: Buffer.from(pdf).toString('base64') })
        }
        const truth = warrantyTruth(this.policy, { product: w.product, purchaseDate: w.purchaseDate, receivedDate: receivedAt.slice(0, 10), country, invoiceReadable: w.invoice === 'pdf' })
        const traps: string[] = []
        if (truth.kind === 'rma' && truth.express) traps.push('express')
        if (Math.abs(Date.parse(addYears(w.purchaseDate, w.years)) - Date.parse(receivedAt.slice(0, 10))) < 60 * 86_400_000) traps.push('expiry')
        if (injection) traps.push('injection')
        if (this.candidates(phrase).length > 1) traps.push('sharedAlias')
        const s: Scenario = {
          ...base,
          intent: 'warranty',
          mentions: [{ ref: w.product.sku, kind: 'own', phrase }],
          sku: w.product.sku,
          serial: w.serial,
          serialInMail,
          purchaseDate: w.purchaseDate,
          invoice: w.invoice,
          invoiceText: w.invoice === 'pdf' ? { date: localDate(w.purchaseDate, invLang), serial: w.serial, product: w.product.name } : undefined,
          traps,
          truth,
          facts: [String(w.years), localDate(w.purchaseDate, lang), localDate(w.purchaseDate, invLang)],
        }
        out.push(await this.mailFor(s, { body: wrap(`${core}\n\n${W.ask}`), attachments }))
        if (truth.kind === 'rma') {
          if (this.k.chance(wc.followUpShare, id, 'fu')) {
            const at = minute + this.k.int(2 * 1440, 5 * 1440, id, 'fut')
            follow.push({
              at,
              make: () =>
                this.mailFor(
                  { ...s, messageId: `<${id}-f@mail.example>`, intent: 'status', receivedAt: isoAt(cfg.start, at), injection: false, traps: ['followUp'], truth: { kind: 'status' }, firstOf: s.messageId, invoice: 'none', invoiceText: undefined },
                  { body: `${greet}\n\n${cap(this.k.pick(P.FOLLOW_UP[lang], id, 'fub'))}\n\n${close}\n`, attachments: [] },
                ),
            })
          } else if (this.k.chance(wc.resentShare, id, 'rs')) {
            const at = minute + this.k.int(60, 300, id, 'rst')
            follow.push({
              at,
              make: () =>
                this.mailFor(
                  { ...s, messageId: `<${id}-r@mail.example>`, threadId: `<${id}-r@mail.example>`, intent: 'warranty', receivedAt: isoAt(cfg.start, at), traps: ['resent'], truth: { kind: 'status' }, firstOf: s.messageId },
                  { body: wrap(`${P.RESENT[lang]} ${cap(core)}\n\n${W.ask}`), attachments },
                ),
            })
          }
        }
      } else if (intent === 'troubleshooting') {
        const symptom = this.k.pick(P.SYMPTOMS, id, 'sym')
        const s: Scenario = { ...base, intent, mentions: [], symptom, traps: injection ? ['injection'] : [], truth: { kind: 'kb', article: symptom.article }, facts: [] }
        out.push(await this.mailFor(s, { body: wrap(symptom.text[lang]), attachments: [] }))
      } else if (intent === 'spare_part') {
        const ask = this.k.pick<P.SpareAsk>(['mounting_kit', 'fan_clips', 'cable_12v2x6'], id, 'sp')
        const product =
          ask === 'mounting_kit' ? bySku.get('SM-HT5')! : ask === 'fan_clips' ? this.pickProduct('cooler', `${id}|spc`) : this.pickProduct('psu', `${id}|spp`)
        const phrase = this.nameOf(product, `${id}|spn`)
        const spare = PRODUCTS.find((p) => p.spare && p.spare.item === ask && p.spare.forSkus.includes(product.sku))
        // A shared alias on a power supply leaves open whether a C5 cable fits it.
        const cands = this.candidates(phrase)
        const allHave = cands.every((c) => spare?.spare!.forSkus.includes(c.sku))
        const noneHave = cands.every((c) => !PRODUCTS.some((p) => p.spare && p.spare.item === ask && p.spare.forSkus.includes(c.sku)))
        const truth: Resolution = spare && allHave ? { kind: 'spare', sku: spare.sku } : noneHave ? { kind: 'human' } : { kind: 'ask', missing: ['model'] }
        const s: Scenario = { ...base, intent, mentions: [{ ref: product.sku, kind: 'own', phrase }], spareAsk: ask, traps: cands.length > 1 ? ['sharedAlias'] : [], truth, facts: [] }
        out.push(await this.mailFor(s, { body: wrap(fill(P.SPARE[lang][ask], { A: phrase })), attachments: [] }))
      } else {
        const s: Scenario = { ...base, intent: 'other', mentions: [], traps: [], truth: { kind: 'human' }, facts: [] }
        out.push(await this.mailFor(s, { body: wrap(this.k.pick(P.OTHER[lang], id, 'oth')), attachments: [] }))
      }
    }
    const horizon = cfg.days * 1440
    for (const f of follow) if (f.at < horizon) out.push(await f.make())
    out.sort((a, b) => (a.mail.receivedAt < b.mail.receivedAt ? -1 : a.mail.receivedAt > b.mail.receivedAt ? 1 : a.mail.messageId < b.mail.messageId ? -1 : 1))
    return out
  }
}
