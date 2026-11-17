import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { deskConfig, deskData, type DeskData } from '../build.ts'
import { Catalog } from '../domain/catalog.ts'
import { answerable, checkCompat, type Item } from '../domain/compat.ts'
import { decideWarranty } from '../domain/warranty.ts'

/**
 * The desk's rules as MCP tools, so an agent in another host (Copilot Studio, Claude, an internal assistant) asks the
 * same code the desk asks. No model runs here: the tools only look up and compute.
 */
export function mcpServer(data: DeskData = deskData()): McpServer {
  const catalog = new Catalog(data.pim, data.parts)
  const server = new McpServer({ name: 'component-service-desk', version: '1.0.0' })
  const text = (x: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(x, null, 2) }] })

  server.registerTool(
    'check_compatibility',
    {
      description: 'Check whether Stillmark products (names, article numbers or serials) and third-party CPUs or GPUs work together, by the published rules.',
      inputSchema: { products: z.array(z.string()).describe('Stillmark product names, SM- article numbers or serial numbers'), cpu: z.string().optional(), gpu: z.string().optional() },
    },
    async ({ products, cpu, gpu }) => {
      const own = products.map((p) => catalog.own(p))
      const unknown = own.filter((o) => o.candidates.length !== 1)
      if (unknown.length) return text({ answer: 'ask', reason: 'a product name is unknown or names several products', candidates: unknown.map((o) => ({ quote: o.quote, matches: o.candidates.map((c) => c.sku) })) })
      const items: Item[] = own.map((o) => ({ own: o.candidates[0] }))
      for (const [q, kind] of [[cpu, 'cpu'], [gpu, 'gpu']] as const) {
        if (!q) continue
        const m = catalog.part(q, kind)
        if (!m.part) return text({ answer: 'unknown', reason: `${q} is not in the parts database` })
        items.push({ part: m.part })
      }
      if (!answerable(items)) return text({ answer: 'unknown', reason: 'these items do not make a compatibility question' })
      return text(checkCompat(data.policy, catalog, items))
    },
  )

  server.registerTool(
    'check_warranty',
    {
      description: 'Decide a warranty claim from the serial number, the purchase date on the invoice, the date of the claim and the country.',
      inputSchema: { serial: z.string(), purchaseDate: z.string().describe('ISO date from the invoice'), claimDate: z.string().describe('ISO date'), country: z.string().length(2) },
    },
    async ({ serial, purchaseDate, claimDate, country }) => {
      const product = catalog.bySerial(serial)
      if (!product) return text({ answer: 'ask', reason: 'not a valid Stillmark serial number' })
      if (!data.policy.servedCountries.includes(country)) return text({ answer: 'deny', reason: 'country' })
      return text({ product: product.sku, ...decideWarranty(data.policy, product, purchaseDate, claimDate, country) })
    },
  )

  server.registerTool(
    'search_help',
    { description: 'Search the help articles for a problem described in English.', inputSchema: { problem: z.string() } },
    async ({ problem }) => text(data.kb.search(problem, 3).map((h) => ({ id: h.id, title: h.title, agreed: h.agreed }))),
  )
  return server
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void deskConfig()
  await mcpServer().connect(new StdioServerTransport())
}
