import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { api } from '../../shared/api'
import { resolutionText, senderName, when } from '../../shared/format'
import { motionTokens } from '../../shared/tokens'
import type { TicketDetail, TicketRow } from '../../shared/types'
import { Empty, Failed, Loading } from '../../shared/ui/States'
import s from './Review.module.css'

function Draft({ row }: { row: TicketRow }) {
  const client = useQueryClient()
  const still = useReducedMotion()
  const detail = useQuery({ queryKey: ['ticket', row.message_id], queryFn: () => api<TicketDetail>(`/api/tickets/${encodeURIComponent(row.message_id)}`) })
  const decide = useMutation({
    mutationFn: (to: 'approve' | 'reject') => api(`/api/tickets/${encodeURIComponent(row.message_id)}/${to}`, { method: 'POST', body: JSON.stringify({ by: 'demo agent' }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['tickets'] }),
  })
  return (
    <motion.li layout={!still} exit={still ? undefined : { opacity: 0, x: 24 }} transition={{ duration: motionTokens.chipSwap }} className={s.card}>
      <header>
        <strong>{senderName(row.sender)}</strong> <span className={s.meta}>{row.country}, {when(row.received_at)}</span>
        <p className={s.why}>
          {resolutionText(row.resolution)}. {row.reason}.
        </p>
      </header>
      {detail.isPending && <Loading label="Loading the draft" />}
      {detail.isError && <Failed error={detail.error} retry={() => detail.refetch()} />}
      {detail.data?.reply && <p className={s.draft}>{detail.data.reply}</p>}
      {decide.isError && <p className={s.error}>{(decide.error as Error).message}</p>}
      <div className={s.actions}>
        <button type="button" className={s.approve} disabled={decide.isPending} onClick={() => decide.mutate('approve')}>
          Approve and send
        </button>
        <button type="button" disabled={decide.isPending} onClick={() => decide.mutate('reject')}>
          Reject and write it myself
        </button>
      </div>
    </motion.li>
  )
}

export function ReviewView() {
  const q = useQuery({ queryKey: ['tickets', 'waiting'], queryFn: () => api<TicketRow[]>('/api/tickets?status=waiting') })
  return (
    <section className={s.view} aria-labelledby="review-title">
      <header className={s.head}>
        <h1 id="review-title">Review</h1>
        <p>Declined claims and drafts the check stopped wait here. Nothing in this list has reached the customer.</p>
      </header>
      {q.isPending && <Loading label="Loading drafts" />}
      {q.isError && <Failed error={q.error} retry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && <Empty title="No drafts waiting">Everything that came in was answered or is with a person.</Empty>}
      {q.data && q.data.length > 0 && (
        <ul className={s.cards}>
          <AnimatePresence initial={false}>
            {q.data.map((r) => (
              <Draft key={r.message_id} row={r} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}
