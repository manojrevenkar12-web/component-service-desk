/** The desk's HTTP API. The demo key is an agent's; a deployment injects its own at build time. */
const KEY = import.meta.env.VITE_DESK_KEY ?? 'agent-demo-key'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'x-api-key': KEY, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? `The desk answered ${res.status}.`)
  }
  return (await res.json()) as T
}
