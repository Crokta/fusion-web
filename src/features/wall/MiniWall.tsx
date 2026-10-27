import type { WallContentKey, WallGroup } from '@/api/types'
import { cn } from '@/lib/cn'
import { boundingRect, cellOf } from '@/lib/wall-model'
import { CATALOGUE } from './catalogue'

/**
 * A thumbnail of the 4 × 4 wall: presets, request targets and the send dialog all use it so a
 * supervisor always sees *where* something will land before it lands.
 */
export function MiniWall({
  screens,
  groups = [],
  highlight = [],
  cols = 4,
  rows = 4,
  showIcons = false,
  className,
  onCellClick,
}: {
  screens?: WallContentKey[]
  groups?: Pick<WallGroup, 'cells' | 'content'>[]
  highlight?: number[]
  cols?: number
  rows?: number
  showIcons?: boolean
  className?: string
  onCellClick?: (index: number) => void
}) {
  const grouped = new Set(groups.flatMap((g) => g.cells))
  const cells: {
    key: string
    row: number
    col: number
    rowSpan: number
    colSpan: number
    content?: WallContentKey
    indexes: number[]
  }[] = []
  for (const g of groups) {
    const r = boundingRect(g.cells, cols)
    cells.push({ key: `g${g.cells.join('-')}`, ...r, content: g.content, indexes: g.cells })
  }
  for (let i = 0; i < rows * cols; i++) {
    if (grouped.has(i)) continue
    const { row, col } = cellOf(i, cols)
    cells.push({
      key: `c${i}`,
      row,
      col,
      rowSpan: 1,
      colSpan: 1,
      content: screens?.[i],
      indexes: [i],
    })
  }

  return (
    <div
      className={cn(
        'grid aspect-video gap-[2px] rounded-[4px] bg-black/60 p-[2px] ring-1 ring-white/[0.06]',
        className,
      )}
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
      aria-hidden={!onCellClick}
    >
      {cells.map((c) => {
        const lit = c.indexes.some((i) => highlight.includes(i))
        const Icon = c.content ? CATALOGUE[c.content].icon : null
        const Tag = onCellClick ? 'button' : 'div'
        return (
          <Tag
            key={c.key}
            type={onCellClick ? 'button' : undefined}
            onClick={onCellClick ? () => onCellClick(c.indexes[0]!) : undefined}
            aria-pressed={onCellClick ? lit : undefined}
            aria-label={onCellClick ? `Screen ${c.indexes[0]! + 1}` : undefined}
            className={cn(
              'grid min-h-0 place-items-center rounded-[2px] transition-colors',
              lit
                ? 'bg-cyan/35 ring-1 ring-cyan'
                : c.indexes.length > 1
                  ? 'bg-teal/[0.18] ring-1 ring-teal/40'
                  : 'bg-white/[0.07]',
              onCellClick && 'hover:bg-cyan/20',
            )}
            style={{
              gridRow: `${c.row + 1} / span ${c.rowSpan}`,
              gridColumn: `${c.col + 1} / span ${c.colSpan}`,
            }}
          >
            {showIcons && Icon && (
              <Icon
                size={c.indexes.length > 1 ? 12 : 9}
                className={lit ? 'text-white' : 'text-ink-muted'}
                strokeWidth={2}
              />
            )}
          </Tag>
        )
      })}
    </div>
  )
}
