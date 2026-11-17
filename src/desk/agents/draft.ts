import { z } from 'zod'
import { readText } from '../../config.ts'
import type { Lang } from '../../wire.ts'
import type { Gateway } from '../llm/gateway.ts'

/** Everything the drafting model may say. Code fills it from the decision; the model only words it. */
export interface DraftFacts {
  lang: Lang
  customer: string
  resolution: { kind: string; verdict?: string; reason?: string; express?: boolean; missing?: string[]; article?: string; sku?: string }
  items?: string[]
  numbers?: { key: string; value: number; unit: string }[]
  kitSku?: string
  rmaNumber?: string
  product?: string
  purchaseDate?: string
  warrantyUntil?: string
  warrantyYears?: number
  country?: string
  options?: string[]
  article?: { title: string; summary: string; url: string }
  spare?: { sku: string; name: string }
  genA?: string
  genB?: string
  socket?: string
}

const Draft = z.object({ reply: z.string().min(20) })
const SYSTEM = readText('prompts/draft.md')

export async function draftReply(gw: Gateway, route: 'draft' | 'redraft', messageId: string, facts: DraftFacts): Promise<{ reply: string; model: string }> {
  const out = await gw.json(route, SYSTEM, JSON.stringify({ messageId, facts }), Draft)
  return { reply: out.value.reply, model: out.model }
}
