import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'

/**
 * Cross-screen UI state: the selection shown in the context rail, and the global overlays
 * (command palette, intelligence search, item drawer) that any screen can open.
 */

export interface ContextSelection {
  kind: 'signal' | 'case' | 'alert' | 'story'
  title: string
  caseRef?: string
  source?: string
  priority?: 'high' | 'medium' | 'low'
  raisedAt?: string
  state?: string
  place?: string
}

interface ShellState {
  selection: ContextSelection
  select: (s: ContextSelection) => void
  contextOpen: boolean
  setContextOpen: (v: boolean | ((p: boolean) => boolean)) => void
  railCollapsed: boolean
  setRailCollapsed: (v: boolean | ((p: boolean) => boolean)) => void
  paletteOpen: boolean
  setPaletteOpen: (v: boolean) => void
  searchQuery: string | null
  openSearch: (q?: string) => void
  closeSearch: () => void
  itemId: string | null
  openItem: (id: string) => void
  closeItem: () => void
}

const ShellContext = createContext<ShellState | null>(null)

const DEFAULT_SELECTION: ContextSelection = {
  kind: 'signal',
  title: 'Kaduna · Emerging public-source event',
  caseRef: 'INV-0264',
  source: 'News + social',
  priority: 'high',
  state: 'Unverified',
  place: 'Kaduna, Nigeria',
  raisedAt: new Date(Date.now() - 68 * 60_000).toISOString(),
}

const wide = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1600px)').matches

export function ShellProvider({ children }: { children: ReactNode }) {
  const [selection, select] = useState<ContextSelection>(DEFAULT_SELECTION)
  const [contextOpen, setContextOpen] = useState<boolean>(() => !!wide())
  const [railCollapsed, setRailCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1180px)').matches,
  )
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState<string | null>(null)
  const [itemId, setItemId] = useState<string | null>(null)

  const openSearch = useCallback((q?: string) => {
    setPaletteOpen(false)
    setSearchQuery(q ?? '')
  }, [])
  const closeSearch = useCallback(() => setSearchQuery(null), [])
  const openItem = useCallback((id: string) => setItemId(id), [])
  const closeItem = useCallback(() => setItemId(null), [])

  const value = useMemo(
    () => ({
      selection,
      select,
      contextOpen,
      setContextOpen,
      railCollapsed,
      setRailCollapsed,
      paletteOpen,
      setPaletteOpen,
      searchQuery,
      openSearch,
      closeSearch,
      itemId,
      openItem,
      closeItem,
    }),
    [
      selection,
      contextOpen,
      railCollapsed,
      paletteOpen,
      searchQuery,
      openSearch,
      closeSearch,
      itemId,
      openItem,
      closeItem,
    ],
  )
  return <ShellContext value={value}>{children}</ShellContext>
}

export function useShell() {
  const ctx = use(ShellContext)
  if (!ctx) throw new Error('useShell must be used inside <ShellProvider>')
  return ctx
}
