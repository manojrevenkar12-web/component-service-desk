import { expect, test } from 'vitest'
import { loadGolden, replayGolden } from '../src/eval/golden.ts'
import { cfg, data } from './helpers.ts'

test('every golden case replays to its expected resolution, without the world', async () => {
  const cases = loadGolden()
  expect(cases.length).toBeGreaterThanOrEqual(40)
  const failed = (await replayGolden(cases, cfg, data)).filter((r) => !r.pass)
  expect(failed).toEqual([])
})
