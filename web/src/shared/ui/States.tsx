import type { ReactNode } from 'react'
import s from './States.module.css'

export function Loading({ label }: { label: string }) {
  return (
    <div className={s.loading} role="status" aria-label={label}>
      <span className={s.bar} />
      <span className={s.bar} />
      <span className={s.bar} />
    </div>
  )
}

export function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  const message = error instanceof Error ? error.message : 'The desk did not answer.'
  return (
    <div className={s.failed} role="alert">
      <p>{message}</p>
      <p className={s.hint}>Check that the desk is running on port 8790, then try again.</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  )
}
