import {
  Download,
  Eye,
  EyeOff,
  Grid2x2,
  Maximize2,
  MonitorPlay,
  MonitorUp,
  SquareSplitHorizontal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { USE_MOCKS } from '@/api'
import { simulateShareRequest } from '@/api/mock/adapter'
import {
  useActivatePreset,
  useDecidePublication,
  useRequestPublication,
  useUpdateWall,
  useWallPresets,
  useWallPublications,
  useWallState,
} from '@/api/queries'
import { describeError } from '@/api/problem'
import type { WallContentKey, WallPresetKey, WallState } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import { Badge, Button, ErrorNotice, Kbd, PageHeader, Skeleton } from '@/components/ui'
import { relative } from '@/lib/format'
import { useHotkey, useNow } from '@/lib/hooks'
import {
  assignContent,
  groupFor,
  layoutTiles,
  mergeScreens,
  screenLabel,
  splitScreens,
  swapScreens,
} from '@/lib/wall-model'
import { useLive } from '@/realtime/LiveProvider'
import { CATALOGUE } from './catalogue'
import { OperationsPanel, RequestsPanel, SimulatorPanel, SupervisorConsole } from './ConsolePanels'
import { FocusView, type FocusTarget } from './FocusView'
import { PresentationView } from './PresentationView'
import { PresetBar } from './PresetBar'
import { SendContentModal, type SendInput } from './SendContentModal'
import { WallGrid } from './WallGrid'

/**
 * The command wall planner: what is on each of the 16 physical screens, and the controls a
 * supervisor uses to change it. Edits are optimistic and versioned (If-Match on the revision),
 * so two supervisors moving screens at once get a clean conflict rather than a silent overwrite.
 */
export function WallPage() {
  const wall = useWallState()
  const presets = useWallPresets()
  const publications = useWallPublications()
  const update = useUpdateWall()
  const activate = useActivatePreset()
  const request = useRequestPublication()
  const decide = useDecidePublication()
  const { activeRole } = useAuth()
  const live = useLive()
  const toast = useToast()
  const now = useNow()

  const [selection, setSelection] = useState<number[]>([])
  const [statusOverlay, setStatusOverlay] = useState(true)
  const [sendOpen, setSendOpen] = useState<{ content?: WallContentKey; key: number } | null>(null)
  const [focus, setFocus] = useState<FocusTarget | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [decidingId, setDecidingId] = useState<string>()
  const flash = useFlash(wall.data)
  const frameRef = useRef<HTMLDivElement>(null)

  const state = wall.data
  const canPublish = can.publishToWall(activeRole)
  const pendingCount = publications.data?.filter((p) => p.status === 'pending').length ?? 0

  const commit = useCallback(
    (next: WallState, message: string, detail?: string) => {
      update.mutate(next, {
        onSuccess: () => toast({ title: message, detail, tone: 'success' }),
        onError: (e) =>
          toast({ title: 'Wall not updated', detail: describeError(e), tone: 'error' }),
      })
    },
    [update, toast],
  )

  const guardPublish = () => {
    if (canPublish) return true
    toast({
      title: 'Publishing needs a supervisor',
      detail: 'Use “Send content” to file a request, or switch role.',
      tone: 'warning',
    })
    return false
  }

  const merge = () => {
    if (!state || !guardPublish()) return
    const res = mergeScreens(state, selection)
    if (!res.ok) return toast({ title: 'Cannot merge', detail: res.reason, tone: 'warning' })
    const g = res.state.groups[res.state.groups.length - 1]!
    setSelection(g.cells)
    commit(
      res.state,
      `${g.cells.length} physical panels now form one logical screen`,
      `Screens ${screenLabel(g.cells[0]!)}–${screenLabel(g.cells[g.cells.length - 1]!)}`,
    )
  }

  const split = () => {
    if (!state || !guardPublish()) return
    const next = splitScreens(state, selection)
    if (next === state)
      return toast({
        title: 'Nothing to split',
        detail: 'Select a merged canvas first.',
        tone: 'info',
      })
    commit(next, 'Screen group split into individual panels')
  }

  const openFocus = (index: number, el?: HTMLElement | null) => {
    if (!state) return
    const g = groupFor(state, index)
    const anchor = g ? Math.min(...g.cells) : index
    const tileEl = el ?? frameRef.current?.querySelector<HTMLElement>(`[data-anchor="${anchor}"]`)
    setFocus({
      index: anchor,
      span: g?.cells ?? [index],
      content: g?.content ?? state.screens[index]!.content,
      contextRef: state.screens[anchor]?.contextRef,
      from: tileEl?.getBoundingClientRect() ?? null,
    })
  }

  const send = (v: SendInput, mode: 'publish' | 'request') => {
    if (!state) return
    const targets = selection.length ? selection : [0]
    setSendOpen(null)
    if (mode === 'publish') {
      commit(
        assignContent(state, targets, v.content, v.contextRef),
        `${CATALOGUE[v.content].title} published`,
        `${targets.length > 1 ? `${targets.length} screens` : `Screen ${screenLabel(targets[0]!)}`}${v.contextRef ? ` · ${v.contextRef}` : ''}`,
      )
    } else {
      request.mutate(
        { content: v.content, targets, contextRef: v.contextRef, note: v.note },
        {
          onSuccess: (p) =>
            toast({
              title: `${p.ref} added to the wall approval queue`,
              detail: CATALOGUE[v.content].title,
              tone: 'success',
            }),
          onError: (e) =>
            toast({ title: 'Request failed', detail: describeError(e), tone: 'error' }),
        },
      )
    }
  }

  const activatePreset = (key: WallPresetKey) => {
    if (!guardPublish()) return
    setSelection([])
    activate.mutate(key, {
      onSuccess: (s) =>
        toast({
          title: `${presets.data?.find((p) => p.key === key)?.name ?? key} activated`,
          detail: `Revision ${s.revision}`,
          tone: 'success',
        }),
      onError: (e) =>
        toast({ title: 'Preset not activated', detail: describeError(e), tone: 'error' }),
    })
  }

  const toggleVisitor = () => {
    if (!state) return
    if (!can.publishToWall(activeRole))
      return toast({ title: 'Visitor mode is a supervisor control', tone: 'warning' })
    commit(
      { ...state, visitorMode: !state.visitorMode },
      state.visitorMode ? 'Visitor mode off' : 'Visitor mode on',
      state.visitorMode ? 'Share inputs restored' : 'Sensitive zones withheld · share inputs muted',
    )
  }

  const exportState = () => {
    if (!state) return
    const blob = new Blob(
      [
        JSON.stringify(
          { exportedAt: new Date().toISOString(), state, requests: publications.data ?? [] },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fusion-wall-rev${state.revision}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast({ title: 'Wall state exported', detail: a.download, tone: 'success' })
  }

  const sendToAnalyst = () =>
    toast({
      title: 'Assignment created',
      detail: 'TASK-312 · INV-0264 sent to Amaka Nwosu with evidence context',
      tone: 'success',
    })

  const anyDialog = !!sendOpen || !!focus || presenting
  useHotkey('m', merge, !anyDialog && selection.length > 1)
  useHotkey('u', split, !anyDialog && selection.length > 0)
  useHotkey('f', () => selection[0] !== undefined && openFocus(selection[0]), !anyDialog)
  useHotkey('e', () => setSendOpen({ key: Date.now() }), !anyDialog && !!state)
  useHotkey('p', () => setPresenting(true), !anyDialog && !!state)
  useHotkey('escape', () => setSelection([]), !anyDialog && selection.length > 0)

  const selectionLabel = useMemo(() => {
    if (!state || selection.length === 0) return ''
    const g = groupFor(state, selection[0]!)
    if (g && g.cells.length === selection.length) return `Merged canvas · ${g.cells.length} panels`
    return selection.length === 1
      ? `Screen ${screenLabel(selection[0]!)}`
      : `${selection.length} screens`
  }, [state, selection])

  if (wall.isError) return <ErrorNotice error={wall.error} onRetry={() => wall.refetch()} />

  return (
    <div className="mx-auto max-w-[1840px] px-6 py-6">
      <PageHeader
        eyebrow="Command wall · 4 × 4 · 16 × FHD · 7680 × 4320"
        title={
          <span className="flex items-center gap-3">
            Homeland Fusion Centre Wall
            {state && (
              <Badge tone={state.preset === 'custom' ? 'amber' : 'cyan'} className="translate-y-px">
                {state.preset === 'custom'
                  ? 'Custom layout'
                  : presets.data?.find((p) => p.key === state.preset)?.name}
              </Badge>
            )}
          </span>
        }
        description={
          state
            ? `Revision ${state.revision} · changed by ${state.updatedBy} ${relative(state.updatedAt, now)} · controller ${state.controller}`
            : 'Loading wall state…'
        }
        actions={
          <>
            <Button
              icon={state?.visitorMode ? EyeOff : Eye}
              variant={state?.visitorMode ? 'danger' : 'secondary'}
              onClick={toggleVisitor}
              aria-pressed={state?.visitorMode}
            >
              Visitor mode {state?.visitorMode ? 'on' : 'off'}
            </Button>
            <Button icon={Download} onClick={exportState} disabled={!state}>
              Export
            </Button>
            <Button
              variant="primary"
              icon={MonitorPlay}
              onClick={() => setPresenting(true)}
              disabled={!state}
            >
              Presentation <Kbd className="ml-0.5 border-void/20 bg-void/10 text-void/70">P</Kbd>
            </Button>
          </>
        }
      />

      <PresetBar
        presets={presets.data}
        state={state}
        pendingKey={activate.isPending ? activate.variables : undefined}
        onActivate={activatePreset}
      />

      <div className="mt-4 grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_336px]">
        <section aria-label="Wall planner" className="min-w-0">
          <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="eyebrow flex items-center gap-2 text-ink-2">
              <span className="relative inline-flex size-2">
                <span className="absolute inset-0 animate-ping-slow rounded-full bg-red/70" />
                <span className="relative size-2 rounded-full bg-red" />
              </span>
              Live preview
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-muted">
              <input
                type="checkbox"
                checked={statusOverlay}
                onChange={(e) => setStatusOverlay(e.target.checked)}
                className="size-3.5 accent-cyan"
              />
              Status overlay
            </label>
            <span className="ml-auto hidden items-center gap-3 text-[11px] text-ink-faint lg:flex">
              <span>
                Click · <Kbd>⇧</Kbd> range · <Kbd>⌘</Kbd> toggle
              </span>
              <span>
                Double-click or <Kbd>F</Kbd> focus
              </span>
              <span>Drag to swap</span>
              <span>
                <Kbd>M</Kbd> merge · <Kbd>U</Kbd> split · <Kbd>E</Kbd> send
              </span>
            </span>
          </div>

          <div
            ref={frameRef}
            className="relative rounded-xl border border-line-strong bg-[#020507] p-2 shadow-[0_40px_90px_-40px_rgb(0_0_0/.95),inset_0_1px_0_rgb(255_255_255/.03)]"
          >
            <div className="pointer-events-none absolute -inset-px rounded-xl bg-[radial-gradient(800px_200px_at_50%_0%,rgb(69_215_242/.08),transparent)]" />
            <div className="relative aspect-video">
              {state ? (
                <WallGrid
                  state={state}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onFocus={openFocus}
                  onSwap={(a, b) =>
                    canPublish
                      ? commit(
                          swapScreens(state, a, b),
                          `Screens ${screenLabel(a)} and ${screenLabel(b)} swapped`,
                        )
                      : guardPublish()
                  }
                  statusOverlay={statusOverlay}
                  flashKeys={flash}
                />
              ) : (
                <div className="grid h-full grid-cols-4 grid-rows-4 gap-[3px]">
                  {Array.from({ length: 16 }, (_, i) => (
                    <Skeleton key={i} className="h-full rounded-none" />
                  ))}
                </div>
              )}
              {state?.visitorMode && (
                <div className="pointer-events-none absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber/40 bg-void/85 px-3 py-1 text-[11px] font-semibold text-amber shadow-lg backdrop-blur">
                  <EyeOff size={11} className="mr-1.5 inline -translate-y-px" />
                  Visitor mode · sensitive zones withheld · share inputs muted
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 px-1 pt-2 text-[10.5px] text-ink-faint">
              <span className="font-semibold tracking-[0.16em] uppercase">
                Wall controller · {state?.controller ?? '—'}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-line-strong to-transparent" />
              {state && (
                <span className="num">{layoutTiles(state).length} logical / 16 physical</span>
              )}
            </div>

            {selection.length > 0 && state && (
              <div
                className="absolute bottom-9 left-1/2 z-40 flex -translate-x-1/2 animate-rise-in items-center gap-1 rounded-xl border border-cyan/30 bg-panel/95 p-1.5 pl-3.5 shadow-[0_20px_50px_-12px_rgb(0_0_0/.9),0_0_0_1px_rgb(69_215_242/.1)] backdrop-blur-md"
                role="toolbar"
                aria-label="Selection actions"
              >
                <span className="mr-2 text-[12px] font-semibold whitespace-nowrap text-ink">
                  {selectionLabel}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  icon={MonitorUp}
                  onClick={() => setSendOpen({ key: Date.now() })}
                >
                  Send content
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Grid2x2}
                  onClick={merge}
                  disabled={selection.length < 2}
                >
                  Merge
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={SquareSplitHorizontal}
                  onClick={split}
                  disabled={!selection.some((c) => groupFor(state, c))}
                >
                  Split
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={Maximize2}
                  onClick={() => openFocus(selection[0]!)}
                >
                  Focus
                </Button>
                <span className="mx-1 h-5 w-px bg-line-strong" />
                <button
                  type="button"
                  onClick={() => setSelection([])}
                  className="grid size-7 place-items-center rounded-md text-ink-muted hover:bg-tint/5 hover:text-ink"
                  aria-label="Clear selection"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </section>

        {state && (
          <div className="grid grid-cols-1 content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
            <SupervisorConsole
              state={state}
              selection={selection}
              pendingRequests={pendingCount}
              onSelectScreen={(i) => {
                const g = groupFor(state, i)
                setSelection(g?.cells ?? [i])
              }}
              onReplace={(content) =>
                guardPublish() &&
                commit(
                  assignContent(state, selection, content),
                  'Panel content replaced',
                  CATALOGUE[content].title,
                )
              }
              onFocusSelected={() => selection[0] !== undefined && openFocus(selection[0])}
              onSendToAnalyst={sendToAnalyst}
            />
            <RequestsPanel
              state={state}
              requests={publications.data}
              canDecide={can.decideWallRequest(activeRole)}
              pendingId={decidingId}
              onPreview={setSelection}
              onDecide={(id, decision) => {
                setDecidingId(id)
                decide.mutate(
                  { id, decision },
                  {
                    onSuccess: (p) => {
                      toast({
                        title:
                          decision === 'approve'
                            ? `${p.ref} approved and on the wall`
                            : `${p.ref} rejected`,
                        tone: decision === 'approve' ? 'success' : 'info',
                      })
                      if (decision === 'approve') setSelection(p.targets)
                    },
                    onError: (e) =>
                      toast({ title: 'Decision failed', detail: describeError(e), tone: 'error' }),
                    onSettled: () => setDecidingId(undefined),
                  },
                )
              }}
            />
            <SimulatorPanel
              available={USE_MOCKS && !!live.client.simulate}
              onSignal={() => {
                live.client.simulate?.()
                toast({
                  title: 'New synthetic signal processed',
                  detail: 'Alerts and events updated on the wall',
                  tone: 'info',
                })
              }}
              onShareRequest={() => {
                simulateShareRequest()
                toast({ title: 'New analyst request received', tone: 'info' })
              }}
              onRestore={() => activatePreset('standing')}
            />
            <OperationsPanel
              state={state}
              onExport={exportState}
              onPresent={() => setPresenting(true)}
            />
          </div>
        )}
      </div>

      {state && sendOpen && (
        <SendContentModal
          key={sendOpen.key}
          open
          onClose={() => setSendOpen(null)}
          state={state}
          targets={selection.length ? selection : [0]}
          initialContent={
            sendOpen.content ??
            (selection[0] !== undefined
              ? (groupFor(state, selection[0])?.content ?? state.screens[selection[0]]?.content)
              : undefined)
          }
          canPublish={canPublish}
          visitorMode={state.visitorMode}
          onPublish={(v) => send(v, 'publish')}
          onRequest={(v) => send(v, 'request')}
        />
      )}
      <FocusView
        target={focus}
        visitorMode={!!state?.visitorMode}
        onClose={() => setFocus(null)}
        onSendToWall={(content) => {
          setFocus(null)
          setSendOpen({ content, key: Date.now() })
        }}
        onSendToAnalyst={() => {
          setFocus(null)
          sendToAnalyst()
        }}
      />
      {state && (
        <PresentationView state={state} open={presenting} onClose={() => setPresenting(false)} />
      )}
    </div>
  )
}

/** Tiles whose content changed in the last update flash once, so a remote change is noticed. */
function useFlash(state?: WallState) {
  const [prev, setPrev] = useState(state)
  const [keys, setKeys] = useState<Set<string>>(() => new Set())
  // Compare during render (React's "storing information from previous renders" pattern).
  if (state !== prev) {
    setPrev(state)
    if (prev && state) {
      const before = new Map(layoutTiles(prev).map((t) => [t.key, t.content as string]))
      const changed = new Set<string>()
      for (const t of layoutTiles(state))
        if (before.get(t.key) !== t.content) changed.add(`${t.key}:${t.content}`)
      if (changed.size) setKeys(changed)
    }
  }
  useEffect(() => {
    if (keys.size === 0) return
    const t = setTimeout(() => setKeys(new Set()), 1500)
    return () => clearTimeout(t)
  }, [keys])
  return keys
}
