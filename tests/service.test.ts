import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { makeSerial } from '../src/catalog-shape.ts'
import { buildApp } from '../src/desk/service/app.ts'
import { openDb, type Db } from '../src/desk/service/db.ts'
import { mcpServer } from '../src/desk/service/mcp.ts'
import { SimulatedModels } from '../src/world/models.ts'
import type { WorldTicket } from '../src/world/world.ts'
import { data, smallWorld } from './helpers.ts'

let db: Db
let app: FastifyInstance
let tickets: WorldTicket[]
const agent = { 'x-api-key': 'agent-demo-key' }
const viewer = { 'x-api-key': 'viewer-demo-key' }

beforeAll(async () => {
  const world = smallWorld('service', { tickets: 60 })
  tickets = await world.tickets()
  db = await openDb('', undefined)
  app = await buildApp(db, { fetch: new SimulatedModels(world, world.cfg.models).fetch as typeof fetch })
})
afterAll(async () => {
  await app.close()
  await db.close()
})

describe('the service on PGlite (PostgreSQL in WASM, with pgvector)', () => {
  test('a key is needed, and a viewer key may only read', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/tickets' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/api/messages', headers: viewer, payload: tickets[0].mail })).statusCode).toBe(403)
  })

  test('every message is taken once; a second delivery returns the first outcome', async () => {
    for (const t of tickets) {
      const r = await app.inject({ method: 'POST', url: '/api/messages', headers: agent, payload: t.mail })
      expect(r.statusCode).toBe(200)
      expect(r.json().duplicate).toBe(false)
    }
    const again = await app.inject({ method: 'POST', url: '/api/messages', headers: agent, payload: tickets[3].mail })
    expect(again.json().duplicate).toBe(true)
    const n = await db.query<{ n: number }>('select count(*)::int as n from outcomes')
    expect(n.rows[0].n).toBe(tickets.length)
  })

  test('one return order per serial, however often the claim arrives', async () => {
    const r = await db.query<{ serial: string; n: number }>('select serial, count(*)::int as n from sap_orders group by serial having count(*) > 1')
    expect(r.rows).toEqual([])
    const orders = await db.query<{ n: number }>('select count(*)::int as n from sap_orders')
    expect(orders.rows[0].n).toBeGreaterThan(0)
  })

  test('a waiting draft is approved once; a sent reply cannot be approved', async () => {
    const waiting = (await app.inject({ method: 'GET', url: '/api/tickets?status=waiting', headers: viewer })).json() as { message_id: string }[]
    const sent = (await app.inject({ method: 'GET', url: '/api/tickets?status=sent', headers: viewer })).json() as { message_id: string }[]
    expect(sent.length).toBeGreaterThan(waiting.length)
    if (waiting[0]) {
      const id = encodeURIComponent(waiting[0].message_id)
      expect((await app.inject({ method: 'POST', url: `/api/tickets/${id}/approve`, headers: agent, payload: { by: 'lena' } })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: `/api/tickets/${id}/approve`, headers: agent, payload: { by: 'lena' } })).statusCode).toBe(409)
    }
    const id = encodeURIComponent(sent[0].message_id)
    expect((await app.inject({ method: 'POST', url: `/api/tickets/${id}/approve`, headers: agent, payload: { by: 'lena' } })).statusCode).toBe(409)
    const detail = (await app.inject({ method: 'GET', url: `/api/tickets/${id}`, headers: viewer })).json()
    expect(detail.trace.map((s: { node: string }) => s.node)).toContain('route')
  })

  test('help search runs in pgvector and agrees with the in-process index', async () => {
    const r = (await app.inject({ method: 'GET', url: '/api/kb/search?q=' + encodeURIComponent('AIO pump gurgling and rattling noise, air in the loop'), headers: viewer })).json()
    expect(r.pgvector[0].id).toBe('aio-pump-noise')
    expect(r.hybrid[0].id).toBe('aio-pump-noise')
  })

  test('catalog health names the PIM gap and the stale record', async () => {
    const h = (await app.inject({ method: 'GET', url: '/api/catalog/health', headers: viewer })).json()
    expect(h.gaps).toEqual([expect.objectContaining({ sku: 'SM-HB802', missing: ['case.maxPsuMm'] })])
    expect(h.stale.map((s: { sku: string }) => s.sku)).toEqual(expect.arrayContaining(['SM-SH2', 'SM-HB802']))
  })

  test('the ledger holds every model call with its cost', async () => {
    const l = (await app.inject({ method: 'GET', url: '/api/ledger', headers: viewer })).json() as { calls: number; micros: number }[]
    expect(l.reduce((s, x) => s + x.calls, 0)).toBeGreaterThan(tickets.length)
    expect(l.every((x) => Number.isInteger(x.micros))).toBe(true)
  })
})

test('MCP: another agent asks the same rules', async () => {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = mcpServer(data)
  await server.connect(a)
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(b)
  expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual(['check_compatibility', 'check_warranty', 'search_help'])
  const fit = await client.callTool({ name: 'check_compatibility', arguments: { products: ['Hush Tower 5'], cpu: 'Core Ultra 7 265K' } })
  expect(JSON.parse((fit.content as { text: string }[])[0].text)).toMatchObject({ verdict: 'fits_with_kit', kitSku: 'SM-KIT-1851' })
  const ambiguous = await client.callTool({ name: 'check_compatibility', arguments: { products: ['Tide 850', 'Deep 14 1000'] } })
  expect(JSON.parse((ambiguous.content as { text: string }[])[0].text).answer).toBe('ask')
  const w = await client.callTool({ name: 'check_warranty', arguments: { serial: makeSerial('25', 'DQ3', 4242), purchaseDate: '2025-06-01', claimDate: '2026-10-06', country: 'FR' } })
  expect(JSON.parse((w.content as { text: string }[])[0].text).resolution).toEqual({ kind: 'rma', express: true })
  await client.close()
})
