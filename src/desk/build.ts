import { join } from 'node:path'
import type { PartRecord, PimRecord, Policy } from '../catalog-shape.ts'
import { readJson, ROOT } from '../config.ts'
import type { SapPort } from '../wire.ts'
import { Desk, MemoryThreads, type DeskSettings, type Threads } from './desk.ts'
import { Gateway, type GatewaySettings } from './llm/gateway.ts'
import { KnowledgeBase, loadArticles } from './rag/kb.ts'

export type DeskConfig = GatewaySettings & Omit<DeskSettings, 'rules' | 'verifier'> & { kb: DeskSettings['kb'] & { dims: number; rrfK: number } }

export function deskConfig(): DeskConfig {
  return readJson<DeskConfig>('config/desk.json')
}

export interface DeskData {
  policy: Policy
  pim: PimRecord[]
  parts: PartRecord[]
  kb: KnowledgeBase
}

/** What the desk knows: the published terms, the PIM export, the parts database and the help articles. */
export function deskData(cfg = deskConfig()): DeskData {
  return {
    policy: readJson<Policy>('knowledge/policy.json'),
    pim: readJson<PimRecord[]>('knowledge/pim.json'),
    parts: readJson<PartRecord[]>('knowledge/parts.json'),
    kb: new KnowledgeBase(loadArticles(join(ROOT, 'knowledge/kb')), cfg.kb),
  }
}

export function buildDesk(opts: { sap: SapPort; fetch?: typeof fetch; apiKey?: string; baseURL?: string; threads?: Threads; flags?: { rules: boolean; verifier: boolean }; data?: DeskData; cfg?: DeskConfig }): Desk {
  const cfg = opts.cfg ?? deskConfig()
  const data = opts.data ?? deskData(cfg)
  const gw = new Gateway({ ...cfg, baseURL: opts.baseURL ?? cfg.baseURL }, { fetch: opts.fetch, apiKey: opts.apiKey })
  return new Desk(data.policy, data.pim, data.parts, data.kb, gw, opts.sap, opts.threads ?? new MemoryThreads(), {
    kb: cfg.kb,
    reviewKinds: cfg.reviewKinds,
    maxRedrafts: cfg.maxRedrafts,
    rules: opts.flags?.rules ?? true,
    verifier: opts.flags?.verifier ?? true,
  })
}
