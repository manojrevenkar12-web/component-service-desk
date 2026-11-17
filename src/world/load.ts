import type { Policy } from '../catalog-shape.ts'
import { readJson } from '../config.ts'
import type { WorldConfig } from './world.ts'

/** The world reads the published terms and its own file, never the desk's settings. */
export function worldConfig(seed: string, overrides: Partial<WorldConfig> = {}): WorldConfig {
  return { ...readJson<Omit<WorldConfig, 'seed'>>('config/world.json'), seed, ...overrides }
}

export function publishedPolicy(): Policy {
  return readJson<Policy>('knowledge/policy.json')
}
