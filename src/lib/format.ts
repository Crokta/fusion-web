const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto', style: 'short' })

/** "4 min ago", "in 2 hr" — relative to `now` so a ticking clock can re-render it. */
export function relative(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return diff < 0 ? 'just now' : 'in a moment'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

/** `relative` for something that already happened: a server clock a little ahead never makes it "in a moment". */
export const since = (iso: string, now = Date.now()) =>
  relative(iso, Math.max(now, new Date(iso).getTime()))

export const clock = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

export const clockSeconds = (d: Date) =>
  d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Minutes until a deadline, formatted for an SLA chip. */
export function countdown(
  iso: string,
  now = Date.now(),
): { label: string; overdue: boolean; soon: boolean } {
  const mins = Math.round((new Date(iso).getTime() - now) / 60000)
  const overdue = mins < 0
  const a = Math.abs(mins)
  const label =
    a < 60 ? `${a}m` : a < 1440 ? `${Math.floor(a / 60)}h ${a % 60}m` : `${Math.floor(a / 1440)}d`
  return { label: overdue ? `${label} over` : label, overdue, soon: !overdue && mins < 120 }
}

export const compact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
