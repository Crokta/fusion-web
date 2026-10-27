import { Check, EyeOff, Layers } from 'lucide-react'
import {
  memo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import type { WallContentKey, WallGroup, WallState } from '@/api/types'
import { MarkingTag } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  boundingCells,
  cellOf,
  groupFor,
  layoutTiles,
  screenLabel,
  type Rect,
} from '@/lib/wall-model'
import { CATALOGUE, isWithheld } from './catalogue'
import { ScreenContent } from './ScreenContent'

export interface WallGridProps {
  state: WallState
  selection: number[]
  onSelectionChange: (cells: number[]) => void
  onFocus: (index: number, el: HTMLElement) => void
  onSwap: (from: number, to: number) => void
  statusOverlay: boolean
  /** Presentation mode: no selection chrome, larger type. */
  presentation?: boolean
  flashKeys?: Set<string>
}

/**
 * The live wall preview. Each tile is one physical screen or one merged canvas.
 *
 * Interaction model, mirroring a physical wall controller:
 * click selects a screen (a merged canvas selects as a whole), shift-click selects the
 * rectangle from the last anchor, ⌘/Ctrl-click toggles, double-click or Enter opens focus,
 * drag one screen onto another to swap them, arrow keys move between screens.
 */
export function WallGrid({
  state,
  selection,
  onSelectionChange,
  onFocus,
  onSwap,
  statusOverlay,
  presentation,
  flashKeys,
}: WallGridProps) {
  const tiles = layoutTiles(state)
  const anchor = useRef<number | null>(null)
  const [cursor, setCursor] = useState(0)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropOn, setDropOn] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const cursorTile = tiles.find((t) => (t.group?.cells ?? [t.index]).includes(cursor))?.index ?? 0

  const expand = (cells: number[]) => {
    const out = new Set(cells)
    for (const g of state.groups)
      if (g.cells.some((c) => out.has(c))) g.cells.forEach((c) => out.add(c))
    return [...out].sort((a, b) => a - b)
  }

  const select = (index: number, mode: 'replace' | 'toggle' | 'range') => {
    const own = expand([index])
    if (mode === 'toggle') {
      const has = own.every((c) => selection.includes(c))
      onSelectionChange(
        has ? selection.filter((c) => !own.includes(c)) : expand([...selection, ...own]),
      )
      anchor.current = index
    } else if (mode === 'range' && anchor.current !== null) {
      onSelectionChange(expand(boundingCells([anchor.current, index], state.cols)))
    } else {
      const same = own.length === selection.length && own.every((c) => selection.includes(c))
      onSelectionChange(same ? [] : own)
      anchor.current = index
    }
  }

  const focusTile = (index: number) => {
    const g = groupFor(state, index)
    const target = g ? Math.min(...g.cells) : index
    setCursor(target)
    gridRef.current?.querySelector<HTMLElement>(`[data-anchor="${target}"]`)?.focus()
  }

  const onKeyDown = (e: ReactKeyboardEvent, index: number) => {
    const { row, col } = cellOf(index, state.cols)
    const g = groupFor(state, index)
    const rect = g ? (tiles.find((t) => t.group?.id === g.id)?.rect ?? null) : null
    const moves: Record<string, [number, number]> = {
      ArrowRight: [0, rect ? rect.colSpan : 1],
      ArrowLeft: [0, -1],
      ArrowDown: [rect ? rect.rowSpan : 1, 0],
      ArrowUp: [-1, 0],
    }
    const mv = moves[e.key]
    if (mv) {
      e.preventDefault()
      const r = Math.max(0, Math.min(state.rows - 1, row + mv[0]))
      const c = Math.max(0, Math.min(state.cols - 1, col + mv[1]))
      const next = r * state.cols + c
      focusTile(next)
      if (e.shiftKey) {
        anchor.current ??= index
        onSelectionChange(expand(boundingCells([anchor.current, next], state.cols)))
      }
    } else if (e.key === ' ') {
      e.preventDefault()
      select(index, e.shiftKey ? 'range' : 'toggle')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onFocus(index, e.currentTarget as HTMLElement)
    }
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={`Wall preview, ${state.rows} by ${state.cols} screens`}
      aria-multiselectable
      className="grid h-full w-full gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${state.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${state.rows}, minmax(0, 1fr))`,
      }}
    >
      {tiles.map((t) => {
        const cells = t.group?.cells ?? [t.index]
        const selected = cells.every((c) => selection.includes(c)) && selection.length > 0
        const s = state.screens[t.index]
        return (
          <WallTile
            key={t.key}
            index={t.index}
            rect={t.rect}
            content={t.content}
            group={t.group}
            contextRef={s?.contextRef}
            selected={!presentation && selected}
            withheld={isWithheld(t.content, state.visitorMode)}
            statusOverlay={statusOverlay}
            presentation={presentation}
            tabbable={t.index === cursorTile}
            flash={flashKeys?.has(`${t.key}:${t.content}`)}
            dragging={dragFrom === t.index}
            dropTarget={dropOn === t.index && dragFrom !== t.index}
            onClick={(e) => {
              if (presentation) return
              setCursor(t.index)
              select(t.index, e.shiftKey ? 'range' : e.metaKey || e.ctrlKey ? 'toggle' : 'replace')
            }}
            onDoubleClick={(e) => onFocus(t.index, e.currentTarget)}
            onKeyDown={(e) => onKeyDown(e, t.index)}
            draggable={!presentation && !t.group}
            onDragStart={(e) => {
              setDragFrom(t.index)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(t.index))
            }}
            onDragEnd={() => {
              setDragFrom(null)
              setDropOn(null)
            }}
            onDragOver={(e) => {
              if (dragFrom === null || t.group) return
              e.preventDefault()
              setDropOn(t.index)
            }}
            onDragLeave={() => setDropOn((d) => (d === t.index ? null : d))}
            onDrop={(e) => {
              e.preventDefault()
              if (dragFrom !== null && !t.group) onSwap(dragFrom, t.index)
              setDragFrom(null)
              setDropOn(null)
            }}
          />
        )
      })}
    </div>
  )
}

interface TileProps {
  index: number
  rect: Rect
  content: WallContentKey
  group?: WallGroup
  contextRef?: string
  selected: boolean
  withheld: boolean
  statusOverlay: boolean
  presentation?: boolean
  tabbable: boolean
  flash?: boolean
  dragging: boolean
  dropTarget: boolean
  draggable: boolean
  onClick: (e: ReactMouseEvent<HTMLElement>) => void
  onDoubleClick: (e: ReactMouseEvent<HTMLElement>) => void
  onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => void
  onDragStart: (e: ReactDragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (e: ReactDragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (e: ReactDragEvent<HTMLElement>) => void
}

const WallTile = memo(function WallTile(p: TileProps) {
  const def = CATALOGUE[p.content]
  const Icon = def.icon
  const span = p.group ? p.group.cells.length : 1
  return (
    <div
      role="gridcell"
      aria-selected={p.selected}
      aria-label={`Screen ${screenLabel(p.index)}${p.group ? ` to ${screenLabel(Math.max(...p.group.cells))}, merged` : ''}: ${def.title}${p.withheld ? ', withheld in visitor mode' : ''}`}
      tabIndex={p.tabbable ? 0 : -1}
      data-anchor={p.index}
      draggable={p.draggable}
      onClick={p.onClick}
      onDoubleClick={p.onDoubleClick}
      onKeyDown={p.onKeyDown}
      onDragStart={p.onDragStart}
      onDragEnd={p.onDragEnd}
      onDragOver={p.onDragOver}
      onDragLeave={p.onDragLeave}
      onDrop={p.onDrop}
      className={cn(
        'group/tile relative flex min-h-0 min-w-0 flex-col overflow-hidden outline-none select-none',
        'bg-[linear-gradient(165deg,#0d1b26,#08121a_75%)] ring-1 ring-inset transition-[box-shadow,opacity,transform] duration-200',
        p.selected
          ? 'z-10 shadow-glow-cyan ring-2 ring-cyan'
          : p.group
            ? 'ring-teal/40'
            : 'ring-white/[0.07]',
        !p.presentation && !p.selected && 'cursor-pointer hover:ring-cyan/40',
        p.dragging && 'scale-[0.97] opacity-40',
        p.dropTarget &&
          'ring-2 ring-cyan ring-offset-0 [background-image:repeating-linear-gradient(45deg,rgb(69_215_242/.08)_0_6px,transparent_6px_12px)]',
        'focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-cyan',
        p.flash && 'animate-flash',
      )}
      style={{
        gridRow: `${p.rect.row + 1} / span ${p.rect.rowSpan}`,
        gridColumn: `${p.rect.col + 1} / span ${p.rect.colSpan}`,
      }}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-1.5 border-b border-white/[0.05] bg-black/25',
          p.presentation ? 'h-8 px-3' : 'h-[22px] px-2',
        )}
      >
        {p.statusOverlay && (
          <span
            className={cn(
              'num font-mono text-ink-faint',
              p.presentation ? 'text-[11px]' : 'text-[9px]',
            )}
          >
            {screenLabel(p.index)}
          </span>
        )}
        <Icon size={p.presentation ? 13 : 10} className="shrink-0 text-cyan/80" aria-hidden />
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-semibold tracking-[0.08em] text-ink-2 uppercase',
            p.presentation ? 'text-[11.5px]' : 'text-[8.5px]',
          )}
        >
          {span > 1 || p.presentation ? def.title : def.short}
        </span>
        {p.group && !p.presentation && (
          <span
            className="hidden items-center gap-0.5 rounded-full bg-teal/15 px-1.5 text-[8px] font-semibold text-teal sm:inline-flex"
            title={`${span} physical panels form one logical screen`}
          >
            <Layers size={8} /> {span}
          </span>
        )}
        {p.statusOverlay && (
          <span
            className={cn('rounded-full bg-green', p.presentation ? 'size-1.5' : 'size-[5px]')}
            title="Output live"
          />
        )}
      </div>

      <div
        className={cn('relative min-h-0 flex-1 overflow-hidden', p.presentation ? 'p-4' : 'p-1.5')}
        style={{ maskImage: 'linear-gradient(to bottom, black 78%, transparent)' }}
      >
        {p.withheld ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <EyeOff size={p.presentation ? 28 : 14} className="mx-auto text-ink-faint" />
              <div
                className={cn(
                  'mt-1 font-medium text-ink-muted',
                  p.presentation ? 'text-sm' : 'text-[8.5px]',
                )}
              >
                Withheld · Visitor mode
              </div>
            </div>
          </div>
        ) : (
          <ScreenContent
            content={p.content}
            big={p.presentation && span >= 4}
            contextRef={p.contextRef}
          />
        )}
      </div>

      {p.statusOverlay && !p.withheld && (def.marking !== 'OFFICIAL' || p.contextRef) && (
        <div className="pointer-events-none absolute right-1 bottom-1 flex items-center gap-1">
          {p.contextRef && (
            <span className="rounded-[3px] bg-void/80 px-1 font-mono text-[8px] text-cyan ring-1 ring-cyan/30">
              {p.contextRef}
            </span>
          )}
          {def.marking !== 'OFFICIAL' && (
            <MarkingTag marking={def.marking} className="h-3.5 bg-void/80 px-1 text-[7px]" />
          )}
        </div>
      )}

      {p.selected && (
        <span className="absolute top-1 right-1 grid size-4 animate-scale-in place-items-center rounded-full bg-cyan text-void shadow-[0_0_10px_var(--color-cyan)]">
          <Check size={10} strokeWidth={3} />
        </span>
      )}
      {p.selected && <span className="pointer-events-none absolute inset-0 bg-cyan/[0.06]" />}
    </div>
  )
})
