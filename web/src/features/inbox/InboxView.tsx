import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../shared/api'
import { intentText, resolutionText, senderName, statusText, tone, when } from '../../shared/format'
import type { Status, TicketRow } from '../../shared/types'
import { Empty, Failed, Loading } from '../../shared/ui/States'
import s from './Inbox.module.css'
import { TicketDetailPane } from './TicketDetail'

const FILTERS: { id: Status | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'sent', label: 'Sent' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'with_person', label: 'With a person' },
  { id: 'approved', label: 'Approved' },
]

export function InboxView() {
  const [filter, setFilter] = useState<Status | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['tickets', filter], queryFn: () => api<TicketRow[]>(filter === 'all' ? '/api/tickets' : `/api/tickets?status=${filter}`) })
  return (
    <section className={s.view} aria-labelledby="inbox-title">
      <header className={s.head}>
        <h1 id="inbox-title">Inbox</h1>
        <div className={s.filters} role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </header>
      <div className={s.split}>
        <div className={s.list}>
          {q.isPending && <Loading label="Loading tickets" />}
          {q.isError && <Failed error={q.error} retry={() => q.refetch()} />}
          {q.data && q.data.length === 0 && <Empty title="Nothing here">No ticket has this status yet. Messages appear as soon as the mailbox delivers them.</Empty>}
          {q.data && q.data.length > 0 && (
            <ol>
              {q.data.map((t) => (
                <li key={t.message_id}>
                  <button type="button" className={s.row} aria-current={open === t.message_id || undefined} onClick={() => setOpen(t.message_id)}>
                    <span className={s.who}>
                      {senderName(t.sender)} <span className={s.meta}>{t.country}</span>
                    </span>
                    <span className={s.meta}>{when(t.received_at)}</span>
                    <span className={s.intent}>{intentText[t.intent] ?? t.intent}</span>
                    <span className={s.res} data-tone={tone(t.resolution)}>
                      {resolutionText(t.resolution)}
                    </span>
                    <span className={s.status} data-status={t.status}>
                      {statusText[t.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className={s.detail}>{open ? <TicketDetailPane id={open} /> : <Empty title="Pick a ticket">Its message, the decision, the facts behind it and the reply that went out appear here.</Empty>}</div>
      </div>
    </section>
  )
}
