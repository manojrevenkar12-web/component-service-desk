/** One support queue, first come first served, worked by a few agents during office hours. */

export interface Task {
  id: string
  /** Minutes since the start of the period. */
  arrival: number
  minutes: number
}

export interface Shift {
  from: number
  to: number
  weekdays: number[]
}

/** The next minute an agent may start work, given the period starts on a Monday at 00:00. */
function nextOpen(t: number, shift: Shift): number {
  for (let day = Math.floor(t / 1440); ; day++) {
    const weekday = ((day % 7) + 7) % 7 + 1
    if (!shift.weekdays.includes(weekday)) continue
    const open = day * 1440 + shift.from * 60
    const close = day * 1440 + shift.to * 60
    if (t < close) return Math.max(t, open)
  }
}

/** The minute each task is finished. */
export function workQueue(tasks: Task[], agents: number, shift: Shift): Map<string, number> {
  const free = new Array<number>(agents).fill(0)
  const done = new Map<string, number>()
  for (const t of [...tasks].sort((a, b) => a.arrival - b.arrival || a.id.localeCompare(b.id))) {
    let best = 0
    for (let i = 1; i < agents; i++) if (free[i] < free[best]) best = i
    const start = nextOpen(Math.max(t.arrival, free[best]), shift)
    const end = start + t.minutes
    free[best] = end
    done.set(t.id, end)
  }
  return done
}
