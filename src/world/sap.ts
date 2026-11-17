import { Keyed } from '../keyed.ts'
import { SapTimeout, type RmaRequest, type RmaResult, type SapPort } from '../wire.ts'

/**
 * SAP as it behaves: it creates a return order on every call, and now and then it commits the order but the answer
 * never arrives. It does not deduplicate; that is the caller's job.
 */
export class SimulatedSap implements SapPort {
  readonly orders: (RmaRequest & { rmaNumber: string })[] = []
  private readonly k: Keyed
  private readonly calls = new Map<string, number>()

  constructor(
    seed: string,
    private readonly ghostTimeout: number,
  ) {
    this.k = new Keyed(`${seed}|sap`)
  }

  async createRma(req: RmaRequest): Promise<RmaResult> {
    const n = (this.calls.get(req.messageId) ?? 0) + 1
    this.calls.set(req.messageId, n)
    const rmaNumber = `RMA-${String(6_000_000 + this.orders.length + 1)}`
    this.orders.push({ ...req, rmaNumber })
    if (this.k.chance(this.ghostTimeout, req.messageId, n)) throw new SapTimeout()
    return { rmaNumber, created: true }
  }

  async findRma(idempotencyKey: string): Promise<RmaResult | null> {
    const o = this.orders.find((x) => x.idempotencyKey === idempotencyKey)
    return o ? { rmaNumber: o.rmaNumber, created: false } : null
  }

  duplicates(): number {
    const per = new Map<string, number>()
    for (const o of this.orders) per.set(o.serial, (per.get(o.serial) ?? 0) + 1)
    return [...per.values()].reduce((a, c) => a + Math.max(0, c - 1), 0)
  }
}
