import {
  Check,
  Download,
  Inbox,
  Maximize2,
  MonitorPlay,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react'
import type { WallContentKey, WallPublication, WallState } from '@/api/types'
import { Avatar, Badge, Button, EmptyState, Panel, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { groupFor, screenLabel } from '@/lib/wall-model'
import { CATALOGUE, CATALOGUE_LIST } from './catalogue'
import { MiniWall } from './MiniWall'

export function SupervisorConsole({
  state,
  selection,
  pendingRequests,
  onReplace,
  onFocusSelected,
  onSendToAnalyst,
  onSelectScreen,
}: {
  state: WallState
  selection: number[]
  pendingRequests: number
  onReplace: (content: WallContentKey) => void
  onFocusSelected: () => void
  onSendToAnalyst: () => void
  onSelectScreen: (index: number) => void
}) {
  const primary = selection[0]
  const group = primary !== undefined ? groupFor(state, primary) : undefined
  const current =
    primary !== undefined ? (group?.content ?? state.screens[primary]?.content) : undefined
  const logical = state.screens.length - state.groups.reduce((n, g) => n + g.cells.length - 1, 0)

  return (
    <Panel title="Supervisor console" icon={SlidersHorizontal} bodyClassName="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[
          [logical, 'Logical screens', 'text-cyan'],
          [8, 'Analysts', 'text-ink'],
          [pendingRequests, 'Requests', pendingRequests ? 'text-amber' : 'text-ink'],
        ].map(([v, k, c]) => (
          <div
            key={k as string}
            className="rounded-md border border-line-soft bg-canvas/70 px-2.5 py-2"
          >
            <div className={cn('num text-[19px] leading-none font-semibold', c as string)}>
              {String(v).padStart(2, '0')}
            </div>
            <div className="eyebrow mt-1 text-[8.5px]">{k}</div>
          </div>
        ))}
      </div>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Selected screen</span>
        <select
          value={primary ?? ''}
          onChange={(e) => onSelectScreen(Number(e.target.value))}
          className={cn(inputClass, 'appearance-none')}
        >
          {primary === undefined && <option value="">None selected</option>}
          {state.screens.map((s) => {
            const g = groupFor(state, s.index)
            if (g && Math.min(...g.cells) !== s.index) return null
            const key = g?.content ?? s.content
            return (
              <option key={s.index} value={s.index}>
                {screenLabel(s.index)}
                {g ? `–${screenLabel(Math.max(...g.cells))}` : ''} · {CATALOGUE[key].title}
              </option>
            )
          })}
        </select>
      </label>

      <label className="block">
        <span className="eyebrow mb-1.5 block">Replace content with</span>
        <select
          value={current ?? ''}
          disabled={primary === undefined}
          onChange={(e) => onReplace(e.target.value as WallContentKey)}
          className={cn(inputClass, 'appearance-none disabled:opacity-50')}
        >
          {primary === undefined && <option value="">Select a screen first</option>}
          {CATALOGUE_LIST.map((c) => (
            <option key={c.key} value={c.key}>
              {c.title}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <Button icon={Maximize2} disabled={primary === undefined} onClick={onFocusSelected}>
          Focus screen
        </Button>
        <Button icon={UserPlus} onClick={onSendToAnalyst}>
          Send to analyst
        </Button>
      </div>
    </Panel>
  )
}

export function RequestsPanel({
  state,
  requests,
  canDecide,
  pendingId,
  onDecide,
  onPreview,
}: {
  state: WallState
  requests?: WallPublication[]
  canDecide: boolean
  pendingId?: string
  onDecide: (id: string, decision: 'approve' | 'reject') => void
  onPreview: (targets: number[]) => void
}) {
  const now = useNow()
  const pending = requests?.filter((r) => r.status === 'pending') ?? []
  return (
    <Panel
      title="Incoming wall requests"
      icon={Inbox}
      actions={pending.length > 0 && <Badge tone="amber">{pending.length} pending</Badge>}
      bodyClassName="p-0"
    >
      {pending.length === 0 ? (
        <EmptyState icon={Check} title="Queue is clear" className="py-8">
          New analyst requests appear here for approval.
        </EmptyState>
      ) : (
        <ul className="max-h-[340px] overflow-y-auto">
          {pending.map((r) => {
            const def = CATALOGUE[r.content]
            return (
              <li
                key={r.id}
                className="animate-rise-in border-b border-line-soft px-4 py-3 last:border-0"
              >
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => onPreview(r.targets)}
                    className="shrink-0"
                    aria-label={`Show target screens for ${r.ref}`}
                    title="Highlight target screens"
                  >
                    <MiniWall
                      screens={state.screens.map((s) => s.content)}
                      groups={state.groups}
                      highlight={r.targets}
                      className="w-[64px]"
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-ink-faint">{r.ref}</span>
                      <span className="num ml-auto text-[10.5px] text-ink-faint">
                        {relative(r.requestedAt, now)}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] font-medium text-ink">
                      <def.icon size={13} className="shrink-0 text-cyan" /> {def.title}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <Avatar name={r.requestedBy} size={14} /> {r.requestedBy}
                      {r.contextRef && (
                        <span className="font-mono text-cyan/80">· {r.contextRef}</span>
                      )}
                    </p>
                    {r.note && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-ink-faint">“{r.note}”</p>
                    )}
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 pl-[76px]">
                  <Button
                    size="xs"
                    variant="success"
                    icon={Check}
                    disabled={!canDecide}
                    loading={pendingId === r.id}
                    onClick={() => onDecide(r.id, 'approve')}
                  >
                    Approve & show
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={X}
                    disabled={!canDecide}
                    onClick={() => onDecide(r.id, 'reject')}
                  >
                    Reject
                  </Button>
                  {!canDecide && (
                    <span className="ml-auto text-[10.5px] text-ink-faint">Supervisor decides</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function SimulatorPanel({
  available,
  onSignal,
  onShareRequest,
  onRestore,
}: {
  available: boolean
  onSignal: () => void
  onShareRequest: () => void
  onRestore: () => void
}) {
  return (
    <Panel title="Intelligence feed simulator" icon={Sparkles} bodyClassName="p-4">
      <p className="mb-3 text-[12px] leading-relaxed text-ink-muted">
        {available
          ? 'Generate a synthetic signal and watch it propagate into alerts, the feed and the wall.'
          : 'Connected to the live hub. The simulator runs only with the mock adapter.'}
      </p>
      <div className="grid gap-1.5">
        <Button
          variant="primary"
          icon={Sparkles}
          disabled={!available}
          onClick={onSignal}
          className="justify-start"
        >
          Generate signal
        </Button>
        <Button
          icon={Send}
          disabled={!available}
          onClick={onShareRequest}
          className="justify-start"
        >
          Analyst share request
        </Button>
        <Button icon={RotateCcw} onClick={onRestore} className="justify-start">
          Restore standing layout
        </Button>
      </div>
    </Panel>
  )
}

export function OperationsPanel({
  state,
  onExport,
  onPresent,
}: {
  state: WallState
  onExport: () => void
  onPresent: () => void
}) {
  return (
    <Panel title="Wall operations" icon={Wrench} bodyClassName="p-4">
      <div className="mb-3 flex items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-2 text-ink-2">
          <span
            className={cn(
              'size-2 rounded-full',
              state.controller === 'offline' ? 'bg-red' : 'bg-green',
            )}
          />
          {state.controller === 'offline' ? 'Controller offline' : 'All outputs online'}
        </span>
        <span className="num text-ink-faint">16 × FHD</span>
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-y-1 text-[11.5px]">
        <dt className="text-ink-faint">Canvas</dt>
        <dd className="num text-right text-ink-2">7680 × 4320</dd>
        <dt className="text-ink-faint">Controller</dt>
        <dd className="text-right text-ink-2 capitalize">{state.controller}</dd>
        <dt className="text-ink-faint">Revision</dt>
        <dd className="num text-right text-ink-2">{state.revision}</dd>
        <dt className="text-ink-faint">Last change</dt>
        <dd className="truncate text-right text-ink-2">{state.updatedBy}</dd>
      </dl>
      <div className="grid grid-cols-2 gap-1.5">
        <Button icon={Download} onClick={onExport}>
          Export state
        </Button>
        <Button icon={MonitorPlay} onClick={onPresent}>
          Presentation
        </Button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        Layout changes go through the reporting service's controller adapter. In development the
        adapter is a simulator; no hardware is driven.
      </p>
    </Panel>
  )
}
