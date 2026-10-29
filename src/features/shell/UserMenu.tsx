import { Check, ChevronDown, LogOut, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ROLE_LABEL, type Role } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Avatar } from '@/components/ui'
import { cn } from '@/lib/cn'

const ROLE_HINT: Record<Role, string> = {
  analyst: 'Triage, assess, request wall display',
  supervisor: 'Assign work, publish to the wall',
  reviewer: 'Approve or return submitted cases',
  centre_lead: 'Gate approvals, presets, visitor mode',
  evidence_officer: 'Second step of PI and CCTV gates, custody',
  leadership: 'Briefs, outcomes and the wall',
  admin: 'Policy flags and audit review',
}

/**
 * The active-role switcher. Users act in one role at a time, the access token's active_role;
 * choosing one gets a new token in that role from the identity provider (ADR 0008), then every
 * query refetches because the services answer by role. Only roles the token says the user
 * holds are offered.
 */
export function UserMenu() {
  const { user, activeRole, setActiveRole, switching, signOut, devMode } = useAuth()
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

  if (!user) return null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-tint/[0.04]"
      >
        <Avatar name={user.name} size={28} />
        <span className="hidden text-left leading-none md:block">
          <span className="block text-[12.5px] font-medium text-ink">
            {user.name.split(' ')[0]}
          </span>
          <span className="mt-1 block text-[10.5px] text-cyan/90">
            {switching ? `Switching to ${ROLE_LABEL[switching]}…` : ROLE_LABEL[activeRole]}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={cn('text-ink-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-2 w-72 animate-scale-in origin-top-right rounded-xl border border-line-strong bg-panel p-1.5 shadow-pop"
        >
          <div className="flex items-center gap-3 px-2.5 pt-2 pb-3">
            <Avatar name={user.name} size={36} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold">{user.name}</div>
              <div className="truncate text-[11px] text-ink-muted">{user.email}</div>
              <div className="mt-0.5 text-[10.5px] text-ink-faint">
                Device WS-FLOOR-07{devMode && ' · dev sign-in'}
              </div>
            </div>
          </div>
          <div className="eyebrow flex items-center gap-1.5 border-t border-line px-2.5 pt-2.5 pb-1.5">
            <ShieldCheck size={12} className="text-cyan" /> Active role
          </div>
          {user.roles.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === activeRole}
              disabled={switching !== null}
              onClick={() => {
                setOpen(false)
                // AuthProvider reports the outcome: switched, or refused by the identity provider.
                void setActiveRole(r)
              }}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-tint/[0.04] disabled:opacity-50',
                r === activeRole && 'bg-cyan/[0.07]',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-4 place-items-center',
                  r === activeRole ? 'text-cyan' : 'text-transparent',
                )}
              >
                <Check size={13} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-ink">{ROLE_LABEL[r]}</span>
                <span className="block text-[11px] text-ink-faint">{ROLE_HINT[r]}</span>
              </span>
            </button>
          ))}
          {!devMode && (
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="mt-1 flex w-full items-center gap-2.5 rounded-md border-t border-line px-2.5 py-2 text-[12.5px] text-ink-muted hover:bg-tint/[0.04] hover:text-ink"
            >
              <LogOut size={14} /> Sign out
            </button>
          )}
        </div>
      )}
    </div>
  )
}
