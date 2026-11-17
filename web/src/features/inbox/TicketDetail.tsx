import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { intentText, resolutionText, senderName, statusText, tone, when } from '../../shared/format'
import type { TicketDetail } from '../../shared/types'
import { Failed, Loading } from '../../shared/ui/States'
import { DecisionTrace } from './DecisionTrace'
import s from './Inbox.module.css'
import { ReplyWithSources } from './ReplyWithSources'

export function TicketDetailPane({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['ticket', id], queryFn: () => api<TicketDetail>(`/api/tickets/${encodeURIComponent(id)}`) })
  if (q.isPending) return <Loading label="Loading the ticket" />
  if (q.isError) return <Failed error={q.error} retry={() => q.refetch()} />
  const t = q.data
  return (
    <article className={s.ticket} aria-label={`Ticket from ${senderName(t.sender)}`}>
      <header className={s.ticketHead}>
        <div>
          <h2>{t.subject}</h2>
          <p className={s.meta}>
            {senderName(t.sender)}, {t.country}, {when(t.received_at)}, {intentText[t.intent] ?? t.intent}
          </p>
        </div>
        <div className={s.verdict} data-tone={tone(t.resolution)}>
          <strong>{resolutionText(t.resolution)}</strong>
          <span>{statusText[t.status]}{t.decided_by ? ` by ${t.decided_by}` : ''}</span>
        </div>
      </header>
      <div className={s.columns}>
        <section aria-label="Customer message">
          <h3 className={s.label}>Message</h3>
          <pre className={s.message}>{t.body}</pre>
          {t.attachments.length > 0 && (
            <ul className={s.files}>
              {t.attachments.map((a) => (
                <li key={a.filename}>
                  {a.filename} <span className={s.meta}>{Math.ceil(a.bytes / 1024)} KB</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="How it was decided">
          <h3 className={s.label}>How it was decided</h3>
          <DecisionTrace steps={t.trace} />
        </section>
      </div>
      <section aria-label="Reply" className={s.replyBox}>
        <h3 className={s.label}>{t.status === 'sent' || t.status === 'approved' ? 'Reply sent' : t.reply ? 'Draft' : 'Reply'}</h3>
        {t.reply ? <ReplyWithSources reply={t.reply} trace={t.trace} /> : <p className={s.meta}>No draft: {t.reason}. A person writes this one.</p>}
        {t.checks && !t.checks.ok && <p className={s.problem}>The check stopped the draft: {t.checks.problems.join('; ')}</p>}
      </section>
    </article>
  )
}
