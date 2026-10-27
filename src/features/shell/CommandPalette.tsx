import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  CornerDownLeft,
  FolderOpen,
  LayoutGrid,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useActivatePreset, useCases, useWallPresets } from '@/api/queries'
import { ROLE_LABEL } from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Kbd } from '@/components/ui'
import { useToast } from '@/components/Toaster'
import { cn } from '@/lib/cn'
import { useLive } from '@/realtime/LiveProvider'
import { NAV_ITEMS } from './nav'
import { useShell } from './ShellContext'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: LucideIcon
  keywords?: string
  run: () => void
}

/**
 * ⌘K: one box to jump to a screen, open a case, activate a wall preset, switch role or search
 * the intelligence index. Anything typed that matches nothing becomes a search.
 */
export function CommandPalette() {
  const shell = useShell()
  const navigate = useNavigate()
  const { user, setActiveRole, activeRole } = useAuth()
  const toast = useToast()
  const live = useLive()
  const presets = useWallPresets()
  const activate = useActivatePreset()
  const cases = useCases('active')
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const close = () => shell.setPaletteOpen(false)

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (shell.paletteOpen && !d.open) {
      setQ('')
      setIndex(0)
      d.showModal?.()
    }
    if (!shell.paletteOpen && d.open) d.close?.()
  }, [shell.paletteOpen])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      close()
      void navigate({ to })
    }
    const list: Command[] = NAV_ITEMS.map((n) => ({
      id: `nav:${n.to}`,
      group: 'Go to',
      label: n.label,
      hint: n.hint,
      icon: n.icon,
      run: go(n.to),
    }))
    for (const c of cases.data?.items ?? [])
      list.push({
        id: `case:${c.id}`,
        group: 'Cases',
        label: `${c.ref} · ${c.title}`,
        icon: FolderOpen,
        keywords: `${c.place} ${c.category}`,
        run: () => {
          close()
          void navigate({ to: '/cases/$caseId', params: { caseId: c.id } })
        },
      })
    for (const p of presets.data ?? [])
      list.push({
        id: `preset:${p.key}`,
        group: 'Wall',
        label: `Activate preset · ${p.name}`,
        icon: LayoutGrid,
        keywords: 'wall layout preset',
        run: () => {
          close()
          activate.mutate(p.key, {
            onSuccess: () =>
              toast({
                title: `${p.name} preset activated`,
                detail: 'Wall layout updated',
                tone: 'success',
              }),
            onError: (e) =>
              toast({ title: 'Preset not activated', detail: e.message, tone: 'error' }),
          })
        },
      })
    if (live.client.simulate)
      list.push({
        id: 'sim',
        group: 'Actions',
        label: 'Generate synthetic signal',
        icon: Sparkles,
        keywords: 'simulate signal alert story',
        run: () => {
          close()
          live.client.simulate?.()
          toast({
            title: 'Synthetic signal processed',
            detail: 'Alerts and feed updated',
            tone: 'info',
          })
        },
      })
    for (const r of user?.roles ?? [])
      if (r !== activeRole)
        list.push({
          id: `role:${r}`,
          group: 'Switch role',
          label: `Act as ${ROLE_LABEL[r]}`,
          icon: ShieldCheck,
          keywords: 'role switch',
          run: () => {
            close()
            setActiveRole(r)
            toast({ title: `Acting as ${ROLE_LABEL[r]}`, tone: 'success' })
          },
        })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps -- close/toast are stable enough for a menu
  }, [cases.data, presets.data, user, activeRole, live.client])

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
    const matched = terms.length
      ? commands.filter((c) =>
          terms.every((t) => `${c.label} ${c.group} ${c.keywords ?? ''}`.toLowerCase().includes(t)),
        )
      : commands.filter((c) => c.group !== 'Cases' || commands.indexOf(c) < 20)
    const searchCmd: Command = {
      id: 'search',
      group: 'Search',
      label: q ? `Search intelligence for “${q}”` : 'Open intelligence search',
      icon: Search,
      run: () => shell.openSearch(q),
    }
    return q ? [...matched.slice(0, 14), searchCmd] : [searchCmd, ...matched]
  }, [q, commands, shell])

  const safeIndex = Math.min(index, filtered.length - 1)

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${safeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [safeIndex])

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[safeIndex]?.run()
    }
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="mx-auto mt-[12vh] w-[min(640px,94vw)] overflow-hidden rounded-xl border border-line-strong bg-panel/95 p-0 text-ink shadow-pop backdrop-blur-xl backdrop:bg-void/60 backdrop:backdrop-blur-[2px] open:animate-scale-in"
      aria-label="Command palette"
    >
      {shell.paletteOpen && (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search size={16} className="text-cyan" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setIndex(0)
              }}
              placeholder="Jump to a screen, open a case, run an action…"
              className="h-13 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
              role="combobox"
              aria-expanded="true"
              aria-controls="palette-list"
              aria-activedescendant={`palette-${safeIndex}`}
            />
            <Kbd>Esc</Kbd>
          </div>
          <ul
            id="palette-list"
            ref={listRef}
            role="listbox"
            className="max-h-[52vh] overflow-y-auto p-1.5"
          >
            {filtered.map((c, i) => {
              const header = c.group !== filtered[i - 1]?.group ? c.group : null
              return (
                <li key={c.id} role="presentation">
                  {header && (
                    <div className="eyebrow px-2.5 pt-2.5 pb-1 text-[9.5px] text-ink-faint">
                      {header}
                    </div>
                  )}
                  <div
                    id={`palette-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === safeIndex}
                    onMouseMove={() => setIndex(i)}
                    onClick={c.run}
                    className={cn(
                      'flex h-9 cursor-pointer items-center gap-3 rounded-md px-2.5 text-[13px]',
                      i === safeIndex ? 'bg-cyan/[0.1] text-ink' : 'text-ink-2',
                    )}
                  >
                    <c.icon
                      size={15}
                      className={i === safeIndex ? 'text-cyan' : 'text-ink-faint'}
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <Kbd>{c.hint}</Kbd>}
                    {i === safeIndex &&
                      (c.id === 'search' ? (
                        <CornerDownLeft size={13} className="text-ink-muted" />
                      ) : (
                        <ArrowRight size={13} className="text-ink-muted" />
                      ))}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-4 border-t border-line bg-canvas/60 px-4 py-2 text-[11px] text-ink-faint">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd> run
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>/</Kbd> search
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>[</Kbd>
              <Kbd>]</Kbd> rails
            </span>
            <span className="ml-auto">Fusion · {ROLE_LABEL[activeRole]}</span>
          </div>
        </div>
      )}
    </dialog>
  )
}
