import { Annotation, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import { SERIAL_RE, type PimRecord, type Policy } from '../catalog-shape.ts'
import { readText } from '../config.ts'
import type { InboundMail, Lang, Resolution, SapPort } from '../wire.ts'
import { SapTimeout } from '../wire.ts'
import { draftReply, type DraftFacts } from './agents/draft.ts'
import { readMessage, type ReadResult } from './agents/extract.ts'
import { Catalog, type OwnMatch, type PartMatch } from './domain/catalog.ts'
import { answerable, checkCompat, type CompatResult, type Item } from './domain/compat.ts'
import { detectLanguage } from './domain/language.ts'
import { decideWarranty, localDate, parseLocalDate } from './domain/warranty.ts'
import { pdfText } from './docs/pdf.ts'
import { GatewayError, type Gateway } from './llm/gateway.ts'
import type { Hit, KnowledgeBase } from './rag/kb.ts'
import { verifyReply, type Check } from './review/verify.ts'

export interface DeskSettings {
  kb: { k: number; minLexical: number; url: string }
  reviewKinds: string[]
  maxRedrafts: number
  /** Ablations: decide by code rules, and check drafts before they go out. */
  rules: boolean
  verifier: boolean
}

export type Route = 'auto' | 'review' | 'human'

export interface TraceStep {
  node: string
  note: string
  refs?: string[]
}

/** What the desk did with one message: the decision, the reply and how it got there. Nothing in it comes from the world. */
export interface Outcome {
  messageId: string
  threadId: string
  lang: Lang
  intent: string
  resolution: Resolution
  route: Route
  reason: string
  reply: string | null
  rmaNumber: string | null
  check: Check | null
  drafts: number
  trace: TraceStep[]
}

/** Where the desk keeps the return order of each conversation. */
export interface Threads {
  rmaFor(threadId: string): Promise<string | null>
  remember(threadId: string, rmaNumber: string): Promise<void>
}

export class MemoryThreads implements Threads {
  private readonly m = new Map<string, string>()
  async rmaFor(t: string) {
    return this.m.get(t) ?? null
  }
  async remember(t: string, rma: string) {
    this.m.set(t, rma)
  }
}

const State = Annotation.Root({
  mail: Annotation<InboundMail>(),
  text: Annotation<string>(),
  invoiceText: Annotation<string>(),
  hasInvoice: Annotation<boolean>(),
  lang: Annotation<Lang>(),
  reading: Annotation<ReadResult | null>(),
  own: Annotation<OwnMatch[]>(),
  parts: Annotation<PartMatch[]>(),
  hits: Annotation<Hit[]>(),
  resolution: Annotation<Resolution | null>(),
  reason: Annotation<string>(),
  facts: Annotation<DraftFacts | null>(),
  rmaKey: Annotation<string | null>(),
  rmaSerial: Annotation<string | null>(),
  rmaSku: Annotation<string | null>(),
  rmaNumber: Annotation<string | null>(),
  reply: Annotation<string | null>(),
  check: Annotation<Check | null>(),
  drafts: Annotation<number>(),
  routed: Annotation<Route | null>(),
  trace: Annotation<TraceStep[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
})
type S = typeof State.State

const DECIDE_SYSTEM = readText('prompts/decide.md')
const ResolutionSchema = z.object({ resolution: z.any() })

/**
 * The service desk as a LangGraph workflow: read → resolve → retrieve → decide → act → draft → verify → route.
 * The model reads and words; code decides, writes to SAP once and checks the draft.
 */
export class Desk {
  readonly catalog: Catalog
  private readonly graph

  constructor(
    readonly policy: Policy,
    pim: PimRecord[],
    parts: ConstructorParameters<typeof Catalog>[1],
    readonly kb: KnowledgeBase,
    readonly gw: Gateway,
    readonly sap: SapPort,
    readonly threads: Threads,
    readonly settings: DeskSettings,
  ) {
    this.catalog = new Catalog(pim, parts)
    this.graph = new StateGraph(State)
      .addNode('read', (s: S) => this.readNode(s))
      .addNode('resolve', (s: S) => this.resolveNode(s))
      .addNode('retrieve', (s: S) => this.retrieveNode(s))
      .addNode('decide', (s: S) => this.decideNode(s))
      .addNode('act', (s: S) => this.actNode(s))
      .addNode('draft', (s: S) => this.draftNode(s))
      .addNode('verify', (s: S) => this.verifyNode(s))
      .addNode('route', (s: S) => this.routeNode(s))
      .addEdge(START, 'read')
      .addEdge('read', 'resolve')
      .addEdge('resolve', 'retrieve')
      .addEdge('retrieve', 'decide')
      .addEdge('decide', 'act')
      .addConditionalEdges('act', (s: S) => (s.resolution!.kind === 'human' ? 'route' : 'draft'), ['draft', 'route'])
      .addEdge('draft', 'verify')
      .addConditionalEdges('verify', (s: S) => (s.check && !s.check.ok && s.drafts <= this.settings.maxRedrafts ? 'draft' : 'route'), ['draft', 'route'])
      .addEdge('route', END)
      .compile({ checkpointer: new MemorySaver() })
  }

  async handle(mail: InboundMail): Promise<Outcome> {
    let s: S
    try {
      s = (await this.graph.invoke({ mail, drafts: 0 }, { configurable: { thread_id: mail.messageId } })) as S
    } catch (e) {
      if (!(e instanceof GatewayError)) throw e
      // No model answered: the message goes to a person with nothing decided.
      return { messageId: mail.messageId, threadId: mail.threadId, lang: detectLanguage(mail.body), intent: 'other', resolution: { kind: 'human' }, route: 'human', reason: e.message, reply: null, rmaNumber: null, check: null, drafts: 0, trace: [{ node: 'gateway', note: e.message }] }
    }
    return {
      messageId: mail.messageId,
      threadId: mail.threadId,
      lang: s.lang,
      intent: s.reading?.extraction.intent ?? 'other',
      resolution: s.resolution!,
      route: s.routed!,
      reason: s.reason,
      reply: s.reply,
      rmaNumber: s.rmaNumber,
      check: s.check,
      drafts: s.drafts,
      trace: s.trace,
    }
  }

  private async readNode(s: S): Promise<Partial<S>> {
    const m = s.mail
    const pdfs = m.attachments.filter((a) => a.contentType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf'))
    const texts = await Promise.all(pdfs.map((a) => pdfText(a.base64)))
    const invoiceText = texts.filter(Boolean).join('\n\n')
    const text = `Message-ID: ${m.messageId}\nCountry: ${m.country}\nSubject: ${m.subject}\n\n${m.body}`
    const lang = detectLanguage(`${m.subject}\n${m.body}`)
    const read = await readMessage(this.gw, text, invoiceText)
    const trace: TraceStep[] = [
      { node: 'read', note: `language ${lang}; ${pdfs.length} PDF attachment(s), ${invoiceText ? 'text layer read' : pdfs.length ? 'no text layer (photo)' : 'none'}` },
      { node: 'extract', note: `${read.model} read intent ${read.extraction.intent}, ${read.extraction.mentions.length} mention(s)${read.escalated ? ` after escalation (${read.problems.join('; ')})` : ''}`, refs: read.dropped.map((d) => `dropped:${d}`) },
    ]
    return { text, invoiceText, hasInvoice: pdfs.length > 0, lang, reading: read, trace }
  }

  private async resolveNode(s: S): Promise<Partial<S>> {
    const x = s.reading!.extraction
    const own = x.mentions.filter((m) => m.kind === 'own').map((m) => this.catalog.own(m.quote))
    const parts = x.mentions.filter((m) => m.kind !== 'own').map((m) => this.catalog.part(m.quote, m.kind as 'cpu' | 'gpu'))
    const note = [
      ...own.map((o) => `"${o.quote}" → ${o.candidates.map((c) => c.sku).join(' or ') || 'unknown'} (by ${o.by})`),
      ...parts.map((p) => `"${p.quote}" → ${p.part?.id ?? 'not in the parts database'}`),
    ].join('; ')
    return { own, parts, trace: [{ node: 'resolve', note: note || 'nothing to resolve' }] }
  }

  private async retrieveNode(s: S): Promise<Partial<S>> {
    const x = s.reading!.extraction
    if (x.intent !== 'troubleshooting' || !x.symptom_en) return { hits: [] }
    const hits = this.kb.search(x.symptom_en, this.settings.kb.k)
    return { hits, trace: [{ node: 'retrieve', note: `"${x.symptom_en}" → ${hits.map((h) => `${h.id} (${h.lexical.toFixed(1)} / ${h.semantic.toFixed(2)})`).join(', ')}`, refs: hits.map((h) => `kb:${h.id}`) }] }
  }

  private human(reason: string): Partial<S> {
    return { resolution: { kind: 'human' }, reason, facts: null, trace: [{ node: 'decide', note: `a person answers: ${reason}` }] }
  }

  private base(s: S): DraftFacts {
    return { lang: s.lang, customer: s.mail.from.split('@')[0].split('.').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' '), resolution: { kind: 'human' } }
  }

  private async decideNode(s: S): Promise<Partial<S>> {
    const x = s.reading!.extraction
    const threadRma = await this.threads.rmaFor(s.mail.threadId)
    if (threadRma && (x.intent === 'status' || x.intent === 'warranty')) {
      return { resolution: { kind: 'status' }, reason: 'the conversation already has a return order', rmaNumber: threadRma, facts: { ...this.base(s), resolution: { kind: 'status' }, rmaNumber: threadRma }, trace: [{ node: 'decide', note: `status: thread has ${threadRma}`, refs: [`thread:${s.mail.threadId}`] }] }
    }
    // Documents decide: an invoice or a serial number makes it a warranty claim, whatever the reading said.
    const serialInMail = x.serial_quote && this.catalog.bySerial(x.serial_quote) ? x.serial_quote : null
    const warranty = x.intent === 'warranty' || s.hasInvoice || (serialInMail !== null && x.intent !== 'compatibility' && x.intent !== 'spare_part')
    if (x.intent === 'status' && !threadRma) return this.human('asks about a return the desk does not know')
    if (warranty) return this.warranty(s, serialInMail)
    if (x.intent === 'compatibility') return this.compat(s)
    if (x.intent === 'troubleshooting') return this.troubleshoot(s)
    if (x.intent === 'spare_part') return this.spare(s)
    return this.human('not a question the desk answers')
  }

  /** Ablation: code gathers the records and the facts, a model picks the answer. */
  private async byModel(s: S, records: unknown, facts: DraftFacts, note: string): Promise<Partial<S>> {
    const out = await this.gw.json('decide', DECIDE_SYSTEM, JSON.stringify({ messageId: s.mail.messageId, message: s.mail.body, records }), ResolutionSchema)
    const r = out.value.resolution as Resolution
    if (r.kind === 'kb') {
      const a = this.kb.article(r.article)
      if (a) facts = { ...facts, article: { title: a.title, summary: a.summary[s.lang], url: `${this.settings.kb.url}${a.id}` } }
    }
    if (r.kind === 'spare') facts = { ...facts, spare: { sku: r.sku, name: this.catalog.sku(r.sku)?.name ?? r.sku } }
    return { resolution: r, reason: `decided by ${out.model} (ablation)`, facts: { ...facts, resolution: r }, trace: [{ node: 'decide', note: `${note}; decided by ${out.model}` }] }
  }

  private async compat(s: S): Promise<Partial<S>> {
    if (s.parts.some((p) => !p.part)) return this.human(`part not in the parts database: ${s.parts.filter((p) => !p.part).map((p) => p.quote).join(', ')}`)
    if (s.own.some((o) => !o.candidates.length)) return this.human(`product not in the catalog: ${s.own.filter((o) => !o.candidates.length).map((o) => o.quote).join(', ')}`)
    // Every reading of an ambiguous name: answer only if they all agree.
    let combos: Item[][] = [s.parts.map((p) => ({ part: p.part! }))]
    for (const o of s.own) combos = combos.flatMap((c) => o.candidates.map((p) => [...c, { own: p }]))
    if (!combos.every(answerable)) return this.human('the parts named do not make a compatibility question')
    const results = combos.map((c) => checkCompat(this.policy, this.catalog, c))
    if (results.some((r) => r.reason === 'missing_data')) return this.human(`the PIM export lacks ${[...new Set(results.flatMap((r) => r.missing))].join(', ')}`)
    const items = [...s.own.map((o) => o.quote), ...s.parts.map((p) => p.part!.name)]
    if (!results.every((r) => r.verdict === results[0].verdict)) {
      const options = s.own.filter((o) => o.candidates.length > 1).flatMap((o) => o.candidates.map((c) => c.name))
      return {
        resolution: { kind: 'ask', missing: ['model'] },
        reason: 'the name fits several products and the answer differs between them',
        facts: { ...this.base(s), resolution: { kind: 'ask', missing: ['model'] }, options },
        trace: [{ node: 'decide', note: `ask: ${options.join(' / ')} give different answers (${results.map((r) => r.verdict).join(', ')})` }],
      }
    }
    const r: CompatResult = results[0]
    const res: Resolution = { kind: 'compat', verdict: r.verdict, reason: r.reason }
    const psus = combos[0].flatMap((i) => ('own' in i && i.own.psu ? [i.own] : []))
    const cpu = s.parts.find((p) => p.part?.cpu)?.part
    const facts: DraftFacts = {
      ...this.base(s),
      resolution: res,
      items,
      numbers: r.facts.map(({ key, value, unit }) => ({ key, value, unit })),
      kitSku: r.kitSku ?? this.catalog.products.find((p) => p.spare?.item === 'mounting_kit')?.sku,
      socket: cpu?.cpu?.socket,
      genA: psus[0]?.psu?.cableGen,
      genB: psus[1]?.psu?.cableGen,
    }
    if (!this.settings.rules) return this.byModel(s, { items: combos[0], policy: this.policy }, facts, 'records found')
    return {
      resolution: res,
      reason: `rule ${r.reason}`,
      facts,
      trace: [{ node: 'decide', note: `${r.verdict} by rules ${r.rules.join(', ')}${r.reason !== 'ok' ? ` (failed: ${r.reason})` : ''}`, refs: r.facts.map((f) => `${f.source}=${f.value}`) }],
    }
  }

  private async warranty(s: S, serialInMail: string | null): Promise<Partial<S>> {
    const x = s.reading!.extraction
    const country = s.mail.country
    if (!this.policy.servedCountries.includes(country)) {
      const res: Resolution = { kind: 'deny', reason: 'country' }
      return { resolution: res, reason: `country ${country} is served by a distributor`, facts: { ...this.base(s), resolution: res, country }, trace: [{ node: 'decide', note: `deny: ${country} not in served countries`, refs: ['policy:servedCountries'] }] }
    }
    // An invoice with exactly one date: that is the purchase date, even when the reader quoted it wrongly.
    const datesOnInvoice = [...new Set((s.invoiceText.match(/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g) ?? []).map(parseLocalDate).filter(Boolean))]
    const date = (x.invoice?.date_quote ? parseLocalDate(x.invoice.date_quote) : null) ?? (datesOnInvoice.length === 1 ? datesOnInvoice[0] : null)
    // Identifiers decide: a serial the reader missed is still found by its pattern and check digit, if exactly one is on the invoice.
    const onInvoice = [...new Set(s.invoiceText.match(SERIAL_RE) ?? [])].filter((x) => this.catalog.bySerial(x))
    const invoiceSerial = x.invoice?.serial_quote && this.catalog.bySerial(x.invoice.serial_quote) ? x.invoice.serial_quote : onInvoice.length === 1 ? onInvoice[0] : null
    if (s.invoiceText && (!date || !invoiceSerial)) return this.human('the invoice has text, but no single purchase date and serial could be read from it')
    if (!s.invoiceText || !date || !invoiceSerial) {
      const res: Resolution = { kind: 'ask', missing: ['invoice'] }
      const why = !s.hasInvoice ? 'no invoice attached' : !s.invoiceText ? 'the invoice has no readable text' : 'the invoice has no readable date or serial'
      return { resolution: res, reason: why, facts: { ...this.base(s), resolution: res }, trace: [{ node: 'decide', note: `ask for the invoice: ${why}` }] }
    }
    if (serialInMail && serialInMail !== invoiceSerial) {
      const res: Resolution = { kind: 'ask', missing: ['serial'] }
      return { resolution: res, reason: 'serial in the message and on the invoice differ', facts: { ...this.base(s), resolution: res }, trace: [{ node: 'decide', note: `ask for the serial: ${serialInMail} ≠ ${invoiceSerial}` }] }
    }
    const product = this.catalog.bySerial(invoiceSerial)!
    const key = `rma:${invoiceSerial}`
    const open = await this.sap.findRma(key)
    if (open) {
      return { resolution: { kind: 'status' }, reason: `SAP already has ${open.rmaNumber} for this serial`, rmaNumber: open.rmaNumber, facts: { ...this.base(s), resolution: { kind: 'status' }, rmaNumber: open.rmaNumber }, trace: [{ node: 'decide', note: `status: SAP has ${open.rmaNumber} for ${invoiceSerial}`, refs: [`sap:${key}`] }] }
    }
    const d = decideWarranty(this.policy, product, date, s.mail.receivedAt.slice(0, 10), country)
    const wfacts: DraftFacts = { ...this.base(s), resolution: d.resolution, product: product.name, purchaseDate: localDate(date, s.lang), warrantyUntil: localDate(d.until, s.lang), warrantyYears: d.years }
    if (!this.settings.rules) return { ...(await this.byModel(s, { product, purchase: date, received: s.mail.receivedAt, country, policy: this.policy }, wfacts, `invoice ${date}, ${product.sku}`)), rmaKey: key, rmaSerial: invoiceSerial, rmaSku: product.sku }
    return {
      resolution: d.resolution,
      reason: d.rules.join(', '),
      rmaKey: key,
      rmaSerial: invoiceSerial,
      rmaSku: product.sku,
      facts: wfacts,
      trace: [{ node: 'decide', note: `${d.resolution.kind === 'rma' ? (d.resolution.express ? 'return, express exchange' : 'return') : 'decline: expired'}; bought ${date}, covered until ${d.until}`, refs: [`invoice:serial=${invoiceSerial}`, `invoice:date=${date}`, `pim:${product.sku}.series=${product.series}`, ...d.rules.map((r) => `policy:${r}`)] }],
    }
  }

  private async troubleshoot(s: S): Promise<Partial<S>> {
    const top = s.hits[0]
    if (!top || !top.agreed || top.lexical < this.settings.kb.minLexical) return this.human(top ? `no help article is a clear match (best ${top.id})` : 'no description of the problem')
    if (!this.settings.rules) return this.byModel(s, { articles: s.hits.map((h) => h.id) }, this.base(s), 'articles found')
    const a = this.kb.article(top.id)!
    const res: Resolution = { kind: 'kb', article: a.id }
    return {
      resolution: res,
      reason: `help article ${a.id}`,
      facts: { ...this.base(s), resolution: res, article: { title: a.title, summary: a.summary[s.lang], url: `${this.settings.kb.url}${a.id}` } },
      trace: [{ node: 'decide', note: `help article ${a.id}: both retrievers rank it first`, refs: [`kb:${a.id}`] }],
    }
  }

  private async spare(s: S): Promise<Partial<S>> {
    const x = s.reading!.extraction
    const target = s.own[0]
    if (!x.spare_item || !target?.candidates.length) return this.human('spare part request without a product or item')
    const per = target.candidates.map((c) => this.catalog.spares(x.spare_item!, c.sku)[0]?.sku ?? null)
    if (per.every((p) => p === null)) return this.human(`no ${x.spare_item} listed for ${target.candidates.map((c) => c.sku).join(', ')}`)
    if (!per.every((p) => p === per[0])) {
      const res: Resolution = { kind: 'ask', missing: ['model'] }
      return { resolution: res, reason: 'the name fits several products with different spare parts', facts: { ...this.base(s), resolution: res, options: target.candidates.map((c) => c.name) }, trace: [{ node: 'decide', note: `ask: ${target.candidates.map((c) => c.sku).join(' / ')} take different parts` }] }
    }
    const spare = this.catalog.sku(per[0]!)!
    const res: Resolution = { kind: 'spare', sku: spare.sku }
    return { resolution: res, reason: `spare part ${spare.sku}`, facts: { ...this.base(s), resolution: res, spare: { sku: spare.sku, name: spare.name } }, trace: [{ node: 'decide', note: `spare ${spare.sku} for ${target.candidates[0].sku}`, refs: [`pim:${spare.sku}.spare.forSkus`] }] }
  }

  /** The one write: a return order in SAP, at most once per serial, surviving a timeout after commit. */
  private async actNode(s: S): Promise<Partial<S>> {
    if (s.resolution?.kind !== 'rma' || !s.rmaKey) return {}
    const req = { idempotencyKey: s.rmaKey, serial: s.rmaSerial!, sku: s.rmaSku!, express: s.resolution.express, country: s.mail.country, customer: s.mail.from, messageId: s.mail.messageId }
    let result = await this.sap.findRma(s.rmaKey)
    const notes: string[] = []
    for (let attempt = 1; !result && attempt <= 3; attempt++) {
      try {
        result = await this.sap.createRma(req)
        notes.push(`created ${result.rmaNumber}`)
      } catch (e) {
        if (!(e instanceof SapTimeout)) throw e
        notes.push('timeout')
        result = await this.sap.findRma(s.rmaKey)
        if (result) notes.push(`found ${result.rmaNumber} committed before the timeout`)
      }
    }
    if (!result) return { ...this.human('SAP did not confirm the return order'), trace: [{ node: 'act', note: notes.join(', ') }] }
    await this.threads.remember(s.mail.threadId, result.rmaNumber)
    return { rmaNumber: result.rmaNumber, facts: { ...s.facts!, rmaNumber: result.rmaNumber }, trace: [{ node: 'act', note: notes.join(', '), refs: [`sap:${s.rmaKey}`] }] }
  }

  private async draftNode(s: S): Promise<Partial<S>> {
    const route = s.drafts === 0 ? 'draft' : 'redraft'
    const out = await draftReply(this.gw, route, s.mail.messageId, s.facts!)
    return { reply: out.reply, drafts: s.drafts + 1, trace: [{ node: 'draft', note: `${out.model} wrote draft ${s.drafts + 1}` }] }
  }

  private async verifyNode(s: S): Promise<Partial<S>> {
    if (!this.settings.verifier) return { check: null }
    const check = verifyReply(s.reply!, s.facts!, s.text)
    return { check, trace: [{ node: 'verify', note: check.ok ? 'draft matches the facts' : check.problems.join('; ') }] }
  }

  private async routeNode(s: S): Promise<Partial<S>> {
    const r = s.resolution!
    let route: Route
    let why: string
    if (r.kind === 'human') [route, why] = ['human', s.reason]
    else if (s.check && !s.check.ok) [route, why] = ['review', `draft still wrong after ${s.drafts} attempts`]
    else if (this.settings.reviewKinds.includes(r.kind)) [route, why] = ['review', `${r.kind} needs a person's approval`]
    else [route, why] = ['auto', 'sent']
    return { routed: route, reason: route === 'auto' ? s.reason : why, trace: [{ node: 'route', note: route === 'auto' ? 'sent to the customer' : `to ${route === 'review' ? 'review' : 'a person'}: ${why}` }] }
  }
}
