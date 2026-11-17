import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import s from './App.module.css'
import { HealthView } from './features/health/HealthView'
import { InboxView } from './features/inbox/InboxView'
import { ResultsView } from './features/results/ResultsView'
import { ReviewView } from './features/review/ReviewView'
import { api } from './shared/api'
import type { TicketRow } from './shared/types'

type View = 'inbox' | 'review' | 'results' | 'health'

export function App() {
  const [view, setView] = useState<View>('inbox')
  const waiting = useQuery({ queryKey: ['tickets', 'waiting'], queryFn: () => api<TicketRow[]>('/api/tickets?status=waiting') })
  const nav: { id: View; label: string; count?: number }[] = [
    { id: 'inbox', label: 'Inbox' },
    { id: 'review', label: 'Review', count: waiting.data?.length },
    { id: 'results', label: 'Results' },
    { id: 'health', label: 'Catalog health' },
  ]
  return (
    <div className={s.shell}>
      <nav className={s.rail} aria-label="Views">
        <div className={s.brand}>
          <span className={s.mark} aria-hidden="true" />
          <span>
            Stillmark
            <br />
            service desk
          </span>
        </div>
        <ul>
          {nav.map((n) => (
            <li key={n.id}>
              <button type="button" className={view === n.id ? s.active : undefined} aria-current={view === n.id ? 'page' : undefined} onClick={() => setView(n.id)}>
                {n.label}
                {n.count ? <span className={s.count}>{n.count}</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className={s.note}>The model reads and words. Rules in code decide, and code checks every draft before it leaves.</p>
      </nav>
      <main className={s.main}>
        {view === 'inbox' && <InboxView />}
        {view === 'review' && <ReviewView />}
        {view === 'results' && <ResultsView />}
        {view === 'health' && <HealthView />}
      </main>
    </div>
  )
}
