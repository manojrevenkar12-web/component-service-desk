import { deskConfig, deskData } from '../src/desk/build.ts'
import { publishedPolicy, worldConfig } from '../src/world/load.ts'
import { World, type WorldConfig } from '../src/world/world.ts'

export const cfg = deskConfig()
export const data = deskData(cfg)

export function smallWorld(seed: string, over: Partial<WorldConfig> = {}): World {
  return new World(publishedPolicy(), worldConfig(seed, { tickets: 120, days: 3, ...over }))
}
