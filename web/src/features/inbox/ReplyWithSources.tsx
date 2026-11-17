import type { TraceStep } from '../../shared/types'
import s from './Inbox.module.css'

/** Where each number in the reply came from: the PIM field, the invoice, the policy or SAP. */
export function sourcesOf(trace: TraceStep[]): Map<string, string> {
  const m = new Map<string, string>()
  for (const st of trace) {
    for (const ref of st.refs ?? []) {
      const eq = ref.lastIndexOf('=')
      if (eq > 0) {
        const v = ref.slice(eq + 1)
        m.set(v, ref)
        const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (iso) {
          m.set(`${iso[3]}.${iso[2]}.${iso[1]}`, ref)
          m.set(`${iso[3]}/${iso[2]}/${iso[1]}`, ref)
        }
      }
      if (ref.startsWith('kb:')) m.set(ref.slice(3), ref)
    }
    for (const rma of st.note.match(/RMA-\d+/g) ?? []) m.set(rma, `sap:${st.note}`)
    const until = st.note.match(/covered until (\d{4})-(\d{2})-(\d{2})/)
    if (until) {
      m.set(`${until[3]}.${until[2]}.${until[1]}`, 'policy: purchase date + warranty years')
      m.set(`${until[3]}/${until[2]}/${until[1]}`, 'policy: purchase date + warranty years')
    }
  }
  return m
}

export function ReplyWithSources({ reply, trace }: { reply: string; trace: TraceStep[] }) {
  const sources = sourcesOf(trace)
  const keys = [...sources.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
  const parts = keys.length ? reply.split(new RegExp(`(${keys.join('|')})`)) : [reply]
  return (
    <p className={s.reply}>
      {parts.map((p, i) =>
        sources.has(p) ? (
          <mark key={i} className={s.sourced} title={sources.get(p)} tabIndex={0}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  )
}
