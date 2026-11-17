import { Keyed } from '../keyed.ts'
import type { Resolution } from '../wire.ts'
import type { PeopleConfig, Scenario } from './world.ts'

/** The support agents: they know the products well, make the odd mistake and take time. */
export class People {
  private readonly k: Keyed

  constructor(
    seed: string,
    readonly cfg: PeopleConfig,
  ) {
    this.k = new Keyed(`${seed}|people`)
  }

  private slip(s: Scenario, design: string): Resolution {
    const t = s.truth
    if (!this.k.chance(this.cfg.error[s.intent], s.messageId, design, 'slip')) return t
    switch (t.kind) {
      case 'compat':
        return { kind: 'compat', verdict: t.verdict === 'fits' ? 'does_not_fit' : 'fits', reason: 'slip' }
      case 'kb':
        return { kind: 'kb', article: t.article === 'psu-fan-idle' ? 'case-fan-hub' : 'psu-fan-idle' }
      case 'rma':
        return { kind: 'rma', express: !t.express }
      case 'deny':
        return { kind: 'rma', express: false }
      default:
        return t
    }
  }

  /** A person answers the ticket from scratch, or with the desk's research in front of them. */
  answer(s: Scenario, design: string, prepared: boolean): { resolution: Resolution; minutes: number; duplicateRma: boolean } {
    const minutes = this.cfg.minutes[s.intent] * (prepared ? this.cfg.fromPreparedFactor : 1)
    const again = s.traps.includes('followUp') || s.traps.includes('resent')
    return { resolution: this.slip(s, design), minutes, duplicateRma: again && !prepared && this.k.chance(this.cfg.duplicateRma, s.messageId, design, 'dup') }
  }

  /** A person reviews a draft: approves it, or catches what is wrong and fixes it. */
  review(s: Scenario, design: string, draft: Resolution, draftRight: boolean): { resolution: Resolution; minutes: number; fixed: boolean } {
    if (draftRight) return { resolution: draft, minutes: this.cfg.approveMinutes, fixed: false }
    if (this.k.chance(this.cfg.catchDraftError, s.messageId, design, 'catch')) return { resolution: s.truth, minutes: this.cfg.fixMinutes, fixed: true }
    return { resolution: draft, minutes: this.cfg.approveMinutes, fixed: false }
  }
}
