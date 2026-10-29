import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  ChevronsLeft,
  ChevronsRight,
  Command,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Search,
  Sun,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApprovals, useReviews } from '@/api/queries'
import { USE_MOCKS } from '@/api'
import { Kbd, IconButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { isMac, isTyping, useHotkey } from '@/lib/hooks'
import { useTheme } from '@/lib/theme'
import { useLive } from '@/realtime/LiveProvider'
import { CommandPalette } from './CommandPalette'
import { ContextRail } from './ContextRail'
import { NAV, NAV_ITEMS } from './nav'
import { useShell } from './ShellContext'
import { UserMenu } from './UserMenu'
import { NotificationBell } from '@/features/alerts/NotificationBell'
import { FusionSearchOverlay } from '@/features/search/FusionSearch'
import { ItemDrawer } from '@/features/search/ItemDrawer'

export function AppShell() {
  const shell = useShell()
  const navigate = useNavigate()

  useHotkey('mod+k', (e) => {
    e.preventDefault()
    shell.setPaletteOpen(true)
  })
  useHotkey('/', (e) => {
    e.preventDefault()
    shell.openSearch()
  })
  useHotkey(']', () => shell.setContextOpen((v) => !v))
  useHotkey('[', () => shell.setRailCollapsed((v) => !v))
  // Number keys jump between the main screens, like channel buttons on a desk.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('dialog[open]')) return
      const item = NAV_ITEMS.find((i) => i.hint === e.key)
      if (item) void navigate({ to: item.to })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only z-[2000] rounded-md bg-cyan px-3 py-2 text-void focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftRail />
        <main id="main" className="relative min-w-0 flex-1 overflow-y-auto" tabIndex={-1}>
          <Outlet />
        </main>
        {shell.contextOpen && <ContextRail />}
      </div>
      <CommandPalette />
      <FusionSearchOverlay />
      <ItemDrawer />
    </div>
  )
}

function TopBar() {
  const shell = useShell()
  const { status } = useLive()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const statusChip = {
    simulated: {
      label: 'Simulated feed',
      cls: 'text-amber ring-amber/30 bg-amber/[0.07]',
      dot: 'bg-amber',
    },
    live: { label: 'Live', cls: 'text-green ring-green/30 bg-green/[0.07]', dot: 'bg-green' },
    connecting: { label: 'Connecting', cls: 'text-ink-muted ring-tint/10', dot: 'bg-ink-muted' },
    reconnecting: { label: 'Reconnecting', cls: 'text-amber ring-amber/30', dot: 'bg-amber' },
    offline: { label: 'Hub offline', cls: 'text-red ring-red/30 bg-red/[0.07]', dot: 'bg-red' },
  }[status]

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-void/85 pr-3 pl-3 backdrop-blur-md">
      <Link
        to="/"
        className="group flex items-center gap-2.5 rounded-md pr-2"
        aria-label="Homeland Fusion Centre home"
      >
        <span className="relative grid size-7 place-items-center rounded-lg bg-gradient-to-br from-[#0f3346] to-[#08161f] ring-1 ring-cyan/30 shadow-[0_0_18px_-4px_rgb(69_215_242/.6)]">
          <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
            <circle
              cx="12"
              cy="12"
              r="7.5"
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="12" r="3" fill="var(--color-green)" />
            <path
              d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"
              stroke="var(--color-cyan)"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity=".55"
            />
          </svg>
        </span>
        <span className="hidden leading-none sm:block">
          <span className="block text-[13px] font-semibold tracking-[-0.01em] text-ink">
            Homeland Fusion Centre
          </span>
          <span className="mt-1 block text-[10px] tracking-wide text-ink-faint">
            Watch floor · Shift B
          </span>
        </span>
      </Link>

      <button
        type="button"
        onClick={() => shell.setPaletteOpen(true)}
        className="group ml-2 flex h-8 w-full max-w-[440px] min-w-0 items-center gap-2.5 rounded-lg border border-line bg-panel/70 px-3 text-left text-[12.5px] text-ink-faint transition-colors hover:border-line-strong hover:bg-panel hover:text-ink-muted"
      >
        <Search size={14} className="shrink-0 text-ink-muted" aria-hidden />
        <span className="flex-1 truncate">Jump to, search, act…</span>
        <span className="hidden items-center gap-1 md:flex">
          <Kbd>{isMac ? <Command size={10} /> : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="flex-1" />

      <span
        className={cn(
          'hidden h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium ring-1 ring-inset lg:inline-flex',
          statusChip.cls,
        )}
        title={USE_MOCKS ? 'Mock adapter: synthetic data and events' : 'SignalR hub /hubs/live'}
      >
        <span
          className={cn(
            'size-1.5 rounded-full',
            statusChip.dot,
            status !== 'offline' && 'animate-pulse-dot',
          )}
        />
        {statusChip.label}
      </span>

      <div
        className="hidden items-center gap-3 border-x border-line px-3 xl:flex"
        aria-label="Clocks"
      >
        <span className="leading-none">
          <span className="num block text-[13px] font-medium text-ink">
            {now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour12: false })}
          </span>
          <span className="eyebrow mt-0.5 block text-[8.5px]">WAT · Abuja</span>
        </span>
        <span className="leading-none">
          <span className="num block text-[13px] font-medium text-ink-2">
            {now.toLocaleTimeString('en-GB', {
              timeZone: 'UTC',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </span>
          <span className="eyebrow mt-0.5 block text-[8.5px]">UTC</span>
        </span>
      </div>

      <ThemeToggle />
      <NotificationBell />
      <IconButton
        icon={shell.contextOpen ? PanelRightClose : PanelRightOpen}
        label={shell.contextOpen ? 'Hide context rail ( ] )' : 'Show context rail ( ] )'}
        onClick={() => shell.setContextOpen((v) => !v)}
        active={shell.contextOpen}
      />
      <UserMenu />
    </header>
  )
}

/** Light for desks in daylight, dark for the watch floor; kept per browser (src/lib/theme.ts). */
function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    />
  )
}

function LeftRail() {
  const shell = useShell()
  const collapsed = shell.railCollapsed
  const path = useRouterState({ select: (s) => s.location.pathname })
  const reviews = useReviews()
  const approvals = useApprovals()
  const counts: Record<string, number | undefined> = {
    '/review': reviews.data?.items.length,
    '/approvals': approvals.data?.items.filter((a) => a.status === 'pending').length,
  }

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'relative z-20 flex shrink-0 flex-col border-r border-line bg-void/60 transition-[width] duration-300 ease-[var(--ease-snappy)]',
        collapsed ? 'w-[60px]' : 'w-[212px]',
      )}
    >
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-2 pt-3 pb-2">
        {NAV.map((group) => (
          <div key={group.label} className="mb-3">
            <div
              className={cn(
                'eyebrow mb-1 h-5 px-2.5 text-[9.5px] text-ink-faint transition-opacity',
                collapsed && 'opacity-0',
              )}
            >
              {group.label}
            </div>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active =
                  item.to === '/'
                    ? path === '/'
                    : path === item.to || path.startsWith(`${item.to}/`)
                const count = counts[item.to]
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
                        active
                          ? 'bg-cyan/[0.09] text-ink'
                          : 'text-ink-muted hover:bg-tint/[0.035] hover:text-ink-2',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-r-full bg-cyan shadow-[0_0_10px_rgb(69_215_242/.8)]"
                          aria-hidden
                        />
                      )}
                      <item.icon
                        size={16}
                        strokeWidth={1.85}
                        className={cn(
                          'shrink-0',
                          active ? 'text-cyan' : 'text-ink-faint group-hover:text-ink-muted',
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          'flex-1 truncate transition-opacity',
                          collapsed && 'opacity-0',
                        )}
                      >
                        {item.label}
                      </span>
                      {!collapsed && item.soon && (
                        <span className="text-[9px] font-semibold tracking-wider text-ink-faint/70 uppercase">
                          soon
                        </span>
                      )}
                      {!!count && (
                        <span
                          className={cn(
                            'num grid h-4 min-w-4 place-items-center rounded-full bg-amber/15 px-1 text-[9.5px] font-bold text-amber',
                            collapsed && 'absolute top-0.5 right-0.5',
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-2">
        {!collapsed && (
          <div className="mb-2 rounded-md border border-line-soft bg-panel/60 px-2.5 py-2 text-[10.5px] leading-snug text-ink-faint">
            <span className="font-semibold text-ink-muted">Synthetic workspace.</span> All events,
            people and metrics are fictional.
          </div>
        )}
        <button
          type="button"
          onClick={() => shell.setRailCollapsed((v) => !v)}
          className="flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-[11.5px] text-ink-faint hover:bg-tint/[0.04] hover:text-ink-muted"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Collapse</span>
              <Kbd>[</Kbd>
            </>
          )}
        </button>
      </div>
    </nav>
  )
}
