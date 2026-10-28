import { Link, useNavigate } from '@tanstack/react-router'
import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAlerts, useMarkNotificationRead, useNotifications } from '@/api/queries'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'

/**
 * The top bar's bell: the notices sent to me (in-app delivery of the alerts routed to my tier),
 * unread ones counted. Opening one marks it read and goes to the alert.
 */
export function NotificationBell() {
  const notices = useNotifications()
  const read = useMarkNotificationRead()
  const alerts = useAlerts()
  const navigate = useNavigate()
  const now = useNow(30_000)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items = notices.data ?? []
  const unread = items.filter((n) => !n.readAt)
  const openAlerts =
    alerts.data?.items.filter((a) => a.status === 'open' || a.status === 'escalated').length ?? 0

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${unread.length} unread notifications`}
        title="Notifications"
        className={cn(
          'relative inline-grid size-8 place-items-center rounded-md text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink',
          open && 'bg-white/[0.05] text-ink',
        )}
      >
        <Bell size={16} strokeWidth={1.9} />
        {unread.length > 0 && (
          <span className="num absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red px-1 text-[9.5px] font-bold text-white shadow-[0_0_10px_rgb(255_92_114/.6)]">
            {unread.length > 99 ? '99+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] animate-scale-in origin-top-right rounded-xl border border-line-strong bg-panel shadow-pop"
        >
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
            <span className="text-[13px] font-semibold text-ink">Notifications</span>
            <span className="text-[11px] text-ink-faint">{unread.length} unread</span>
            {unread.length > 0 && (
              <button
                type="button"
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-cyan hover:underline"
                onClick={() => unread.forEach((n) => read.mutate(n.id))}
              >
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center text-[12px] text-ink-muted">
              <BellOff size={18} className="text-ink-faint" />
              Nothing sent to you yet. Alerts reach whoever is on the duty roster at their tier.
            </div>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto py-1">
              {items.slice(0, 30).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (!n.readAt) read.mutate(n.id)
                      setOpen(false)
                      void navigate({ to: '/alerts/$alertId', params: { alertId: n.alertId } })
                    }}
                    className="flex w-full gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                  >
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        n.readAt ? 'bg-transparent' : 'bg-cyan shadow-[0_0_6px_var(--color-cyan)]',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[12.5px] leading-snug',
                          n.readAt ? 'text-ink-muted' : 'font-medium text-ink',
                        )}
                      >
                        {n.subject}
                      </span>
                      <span className="mt-0.5 flex gap-2 text-[11px] text-ink-faint">
                        <span className="font-mono">{n.reference}</span>
                        <span>{n.level > 0 ? `escalated · L${n.level}` : 'on duty'}</span>
                        <span className="num ml-auto">{relative(n.createdAt, now)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[11.5px]">
            <Link
              to="/"
              hash="alerts"
              onClick={() => setOpen(false)}
              className="text-cyan hover:underline"
            >
              Open alerts ({openAlerts})
            </Link>
            <Link
              to="/roster"
              onClick={() => setOpen(false)}
              className="ml-auto text-ink-muted hover:text-ink"
            >
              Duty roster
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
