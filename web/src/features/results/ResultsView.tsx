import { useQuery } from '@tanstack/react-query'
import { api } from '../../shared/api'
import { cents, euros, pct } from '../../shared/format'
import type { Metrics, Results } from '../../shared/types'
import { Empty, Failed, Loading } from '../../shared/ui/States'
import s from './Results.module.css'

function Table({ title, seeds, rows }: { title: string; seeds: string[]; rows: { name: string; label: string; metrics: Metrics }[] }) {
  return (
    <section className={s.block} aria-label={title}>
      <h2>{title}</h2>
      <p className={s.meta}>
        {rows[0].metrics.tickets.toLocaleString('en-GB')} tickets per design from seeds {seeds.join(', ')}; every design saw the same messages.
      </p>
      <div className={s.scroll}>
        <table>
          <thead>
            <tr>
              <th scope="col">Design</th>
              <th scope="col">Resolved right</th>
              <th scope="col">Wrong answers sent</th>
              <th scope="col">Warranty mis-decisions</th>
              <th scope="col">Duplicate returns</th>
              <th scope="col">Sent without a person</th>
              <th scope="col">Agent minutes / ticket</th>
              <th scope="col">First reply, median</th>
              <th scope="col">Cost / ticket</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} data-ours={r.name === 'platform' || undefined}>
                <th scope="row">
                  {r.label}
                  <span className={s.meta}> {r.name}</span>
                </th>
                <td>{pct(r.metrics.right)}</td>
                <td>{pct(r.metrics.wrongSent)}</td>
                <td>{r.metrics.warrantyMisses}</td>
                <td>{r.metrics.duplicateRmas}</td>
                <td>{pct(r.metrics.auto, 0)}</td>
                <td>{r.metrics.minutesPerTicket.toFixed(1)}</td>
                <td>{r.metrics.firstResponseMedianH < 1 ? `${Math.round(r.metrics.firstResponseMedianH * 60)} min` : `${r.metrics.firstResponseMedianH.toFixed(1)} h`}</td>
                <td>{euros(r.metrics.costPerTicketCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function ResultsView() {
  const q = useQuery({ queryKey: ['results'], queryFn: () => api<Results>('/api/results') })
  if (q.isPending) return <Loading label="Loading results" />
  if (q.isError) return <Failed error={q.error} retry={() => q.refetch()} />
  const r = q.data
  if (!r.dev) return <Empty title="No results yet">Run npm run evaluate to compare the designs on the simulated maker.</Empty>
  return (
    <div className={s.view}>
      <header>
        <h1>Results</h1>
        <p className={s.lede}>Five ways to run the same support inbox, scored against the true answer for every ticket.</p>
      </header>
      {r.gate && (
        <section className={s.gate} data-pass={r.gate.pass} aria-label="Release gate">
          <h2>{r.gate.pass ? 'The release gate passes' : 'The release gate fails'}</h2>
          <ul>
            {r.gate.checks.map((c) => (
              <li key={c.name} data-pass={c.pass}>
                {c.name}: <strong>{c.value}</strong> <span className={s.meta}>({c.limit})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Table title="Development seeds" seeds={r.dev.seeds} rows={r.dev.designs} />
      {r.heldout ? <Table title="Held-out seeds, run once" seeds={r.heldout.seeds} rows={r.heldout.designs} /> : <p className={s.meta}>The held-out seeds have not been run.</p>}
      {r.bakeoff && (
        <section className={s.block} aria-label="Model routing">
          <h2>Which model where</h2>
          <div className={s.scroll}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Routing</th>
                  <th scope="col">Resolved right</th>
                  <th scope="col">Sent without a person</th>
                  <th scope="col">Model cost / ticket</th>
                  <th scope="col">Total cost / ticket</th>
                </tr>
              </thead>
              <tbody>
                {r.bakeoff.variants.map((v) => (
                  <tr key={v.routes} data-ours={v.shipped || undefined}>
                    <th scope="row">
                      {v.routes}
                      {v.shipped && <span className={s.meta}> shipped</span>}
                    </th>
                    <td>{pct(v.right)}</td>
                    <td>{pct(v.auto, 0)}</td>
                    <td>{cents(v.modelCentsPerTicket)}</td>
                    <td>{euros(v.costPerTicketCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
