import Fastify from 'fastify'
import { publishedPolicy, worldConfig } from './load.ts'
import { SimulatedModels } from './models.ts'
import { World } from './world.ts'

/**
 * The simulated world as a process: an OpenAI-compatible model endpoint for its messages, and a mailbox that can
 * deliver those messages to a running desk. Used by CI and the local demo; the desk only sees HTTP.
 */
const seed = process.env.WORLD_SEED ?? 'live'
const world = new World(publishedPolicy(), worldConfig(seed, { tickets: Number(process.env.WORLD_TICKETS ?? 40), days: 2 }))
const tickets = await world.tickets()
const models = new SimulatedModels(world, world.cfg.models)
const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 })
app.post('/v1/chat/completions', async (req, reply) => {
  const res = await models.fetch('http://world/v1/chat/completions', { method: 'POST', body: JSON.stringify(req.body) })
  return reply.code(res.status).type('application/json').send(await res.text())
})
app.get('/healthz', async () => ({ ok: true, messages: tickets.length }))
const port = Number(process.env.WORLD_PORT ?? 8792)
await app.listen({ port, host: '0.0.0.0' })
console.log(`world on :${port} with ${tickets.length} messages`)

const desk = process.argv[process.argv.indexOf('--post') + 1]
if (process.argv.includes('--post') && desk) {
  let sent = 0
  for (const t of tickets) {
    const twice = sent % 10 === 0
    for (let i = 0; i < (twice ? 2 : 1); i++) {
      const r = await fetch(`${desk}/api/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.DESK_KEY ?? 'agent-demo-key' }, body: JSON.stringify(t.mail) })
      if (!r.ok) throw new Error(`desk answered ${r.status}: ${await r.text()}`)
    }
    sent++
  }
  console.log(`delivered ${sent} messages (every tenth twice)`)
  await app.close()
}
