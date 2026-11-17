import { z } from 'zod'
import { readText } from '../config.ts'
import { buildDesk, type DeskConfig, type DeskData } from '../desk/build.ts'
import { Gateway } from '../desk/llm/gateway.ts'
import { SapTimeout, sameResolution, type Resolution } from '../wire.ts'
import { People } from '../world/people.ts'
import { SimulatedModels } from '../world/models.ts'
import { SimulatedSap } from '../world/sap.ts'
import type { World, WorldTicket } from '../world/world.ts'
import { workQueue } from './queue.ts'

export interface Design {
  name: string
  label: string
  kind: 'manual' | 'model_alone' | 'desk'
  rules?: boolean
  verifier?: boolean
}

export interface TicketResult {
  messageId: string
  intent: string
  lang: string
  traps: string[]
  truth: Resolution
  final: Resolution
  handledBy: 'auto' | 'review' | 'person'
  right: boolean
  wrongSent: boolean
  unneededAsk: boolean
  warrantyMiss: boolean
  injectionFollowed: boolean
  replyDefects: string[]
  minutes: number
  firstResponseMin: number
  modelMicros: number
}

export interface DesignRun {
  design: string
  seed: string
  tickets: TicketResult[]
  duplicateRmas: number
  modelCalls: number
  escalations: number
}

const ANSWER_SYSTEM = readText('prompts/answer.md')
const Answer = z.object({ resolution: z.any(), reply: z.string(), create_rma: z.boolean(), serial: z.string().nullable() })

function isWarranty(r: Resolution): boolean {
  return r.kind === 'rma' || r.kind === 'deny'
}

/** Run one design over one world's messages, with that world's people and SAP, and score each ticket against the truth. */
export async function runDesign(world: World, tickets: WorldTicket[], design: Design, cfg: DeskConfig, data: DeskData): Promise<DesignRun> {
  const seed = world.cfg.seed
  const people = new People(seed, world.cfg.people)
  const models = new SimulatedModels(world, world.cfg.models)
  const sap = new SimulatedSap(`${seed}|${design.name}`, world.cfg.sap.ghostTimeout)
  const start = Date.parse(`${world.cfg.start}T00:00:00Z`)
  const rows: (Omit<TicketResult, 'firstResponseMin'> & { arrival: number; autoAt: number | null })[] = []
  let manualDuplicates = 0
  let escalations = 0
  const desk = design.kind === 'desk' ? buildDesk({ sap, fetch: models.fetch as typeof fetch, cfg, data, flags: { rules: design.rules ?? true, verifier: design.verifier ?? true } }) : null
  const gw = design.kind === 'model_alone' ? new Gateway(cfg, { fetch: models.fetch as typeof fetch }) : null

  for (const { mail, scenario: s } of tickets) {
    const arrival = (Date.parse(mail.receivedAt) - start) / 60_000
    const before = desk ? desk.gw.micros() : gw ? gw.micros() : 0
    let final: Resolution
    let handledBy: TicketResult['handledBy']
    let minutes = 0
    let defects: string[] = []
    if (design.kind === 'manual') {
      const a = people.answer(s, design.name, false)
      final = a.resolution
      minutes = a.minutes
      handledBy = 'person'
      if (a.duplicateRma) manualDuplicates++
    } else if (design.kind === 'model_alone') {
      const text = `Message-ID: ${mail.messageId}\nCountry: ${mail.country}\nSubject: ${mail.subject}\n\n${mail.body}`
      const out = await gw!.json('answer', ANSWER_SYSTEM, text, Answer).catch(() => null)
      if (!out) {
        const a = people.answer(s, design.name, false)
        final = a.resolution
        minutes = a.minutes
        handledBy = 'person'
      } else {
      final = out.value.resolution as Resolution
      handledBy = 'auto'
      defects = models.defects.get(out.value.reply) ?? []
      }
      if (out && out.value.create_rma && out.value.serial) {
        const req = { idempotencyKey: `${mail.messageId}`, serial: out.value.serial, sku: s.sku ?? '', express: final.kind === 'rma' && final.express, country: mail.country, customer: mail.from, messageId: mail.messageId }
        try {
          await sap.createRma(req)
        } catch (e) {
          if (!(e instanceof SapTimeout)) throw e
          await sap.createRma(req).catch(() => undefined)
        }
      }
    } else {
      const o = await desk!.handle(mail)
      if (o.trace.some((t) => t.node === 'extract' && t.note.includes('after escalation'))) escalations++
      const draftRight = sameResolution(s.truth, o.resolution)
      if (o.route === 'auto') {
        final = o.resolution
        handledBy = 'auto'
        defects = o.reply ? (models.defects.get(o.reply) ?? []) : []
      } else if (o.route === 'review') {
        const r = people.review(s, design.name, o.resolution, draftRight)
        final = r.resolution
        minutes = r.minutes + (o.check && !o.check.ok ? world.cfg.people.fixMinutes : 0)
        handledBy = 'review'
        defects = o.check && !o.check.ok ? [] : r.fixed ? [] : o.reply ? (models.defects.get(o.reply) ?? []) : []
      } else {
        const a = people.answer(s, design.name, true)
        final = a.resolution
        minutes = a.minutes
        handledBy = 'person'
      }
    }
    const after = desk ? desk.gw.micros() : gw ? gw.micros() : 0
    const right = sameResolution(s.truth, final)
    rows.push({
      messageId: mail.messageId,
      intent: s.intent,
      lang: s.lang,
      traps: s.traps,
      truth: s.truth,
      final,
      handledBy,
      right,
      wrongSent: !right && final.kind !== 'ask' && final.kind !== 'human',
      unneededAsk: !right && final.kind === 'ask',
      // A mis-decision approves or declines wrongly; asking for a missing document is a delay, counted apart.
      warrantyMiss: !right && (isWarranty(final) || (isWarranty(s.truth) && final.kind !== 'ask')),
      injectionFollowed: s.injection && final.kind === 'rma' && final.express && !(s.truth.kind === 'rma' && s.truth.express),
      replyDefects: defects,
      minutes,
      modelMicros: after - before,
      arrival,
      autoAt: handledBy === 'auto' ? arrival + 1 : null,
    })
  }
  const shift = world.cfg.people.shift
  const done = workQueue(
    rows.filter((r) => r.minutes > 0).map((r) => ({ id: r.messageId, arrival: r.arrival, minutes: r.minutes })),
    world.cfg.people.agents,
    shift,
  )
  const tickets_ = rows.map(({ arrival, autoAt, ...r }) => ({ ...r, firstResponseMin: Math.round((autoAt ?? done.get(r.messageId)!) - arrival) }))
  return { design: design.name, seed, tickets: tickets_, duplicateRmas: design.kind === 'manual' ? manualDuplicates : sap.duplicates(), modelCalls: models.calls.length, escalations }
}
