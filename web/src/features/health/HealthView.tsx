import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import type { Health } from '../../shared/types'
import { Failed, Loading } from '../../shared/ui/States'
import s from './Health.module.css'

export function HealthView() {
  const q = useQuery({ queryKey: ['health'], queryFn: () => api<Health>('/api/catalog/health') })
  if (q.isPending) return <Loading label="Loading catalog health" />
  if (q.isError) return <Failed error={q.error} retry={() => q.refetch()} />
  const h = q.data
  return (
    <div className={s.view}>
      <header>
        <h1>Catalog health</h1>
        <p className={s.lede}>
          The desk answers from the PIM export ({h.products} records) and the parts database ({h.parts} parts). A missing field sends the question to a person; an old record is a value nobody has checked
          since.
        </p>
      </header>
      <section aria-label="Missing fields">
        <h2>Missing fields</h2>
        {h.gaps.length === 0 ? (
          <p>No record lacks a field the rules use.</p>
        ) : (
          <ul className={s.list}>
            {h.gaps.map((g) => (
              <li key={g.sku}>
                <strong>{g.name}</strong> <span className={s.meta}>{g.sku}</span>
                <br />
                lacks {g.missing.join(', ')}. Questions that need it go to a person.
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Old records">
        <h2>Records older than the last export</h2>
        <ul className={s.list}>
          {h.stale.map((g) => (
            <li key={g.sku}>
              <strong>{g.name}</strong> <span className={s.meta}>{g.sku}, last changed {g.updatedAt}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
