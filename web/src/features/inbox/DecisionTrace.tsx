import { motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '../../shared/tokens'
import type { TraceStep } from '../../shared/types'
import s from './Inbox.module.css'

const NODE: Record<string, string> = {
  read: 'Read',
  extract: 'Extract',
  resolve: 'Resolve',
  retrieve: 'Retrieve',
  decide: 'Decide',
  act: 'SAP',
  draft: 'Draft',
  verify: 'Check',
  route: 'Route',
  gateway: 'Models',
}

/** The workflow as it ran for this ticket. The spine draws once, step by step, when a ticket opens. */
export function DecisionTrace({ steps }: { steps: TraceStep[] }) {
  const still = useReducedMotion()
  return (
    <ol className={s.trace}>
      {steps.map((st, i) => (
        <motion.li
          key={`${st.node}-${i}`}
          className={s.step}
          data-node={st.node}
          initial={still ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: motionTokens.traceStep, delay: i * motionTokens.traceStagger, ease: motionTokens.ease }}
        >
          <span className={s.node}>{NODE[st.node] ?? st.node}</span>
          <span className={s.note}>{st.note}</span>
          {st.refs && st.refs.length > 0 && (
            <span className={s.refs}>
              {st.refs.map((r) => (
                <code key={r}>{r}</code>
              ))}
            </span>
          )}
        </motion.li>
      ))}
    </ol>
  )
}
