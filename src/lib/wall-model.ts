import type { WallContentKey, WallGroup, WallState } from '@/api/types'

/**
 * Pure wall-layout operations. The planner, the mock gateway and the tests share these, so a
 * merge that the planner allows is exactly a merge the server-side model accepts.
 *
 * Screens are addressed row-major: index = row * cols + col.
 */

export interface Rect {
  row: number
  col: number
  rowSpan: number
  colSpan: number
}

export function cellOf(index: number, cols: number) {
  return { row: Math.floor(index / cols), col: index % cols }
}

/** All cell indexes in the bounding rectangle of `cells`. */
export function boundingCells(cells: number[], cols: number): number[] {
  if (cells.length === 0) return []
  const rect = boundingRect(cells, cols)
  const out: number[] = []
  for (let r = rect.row; r < rect.row + rect.rowSpan; r++)
    for (let c = rect.col; c < rect.col + rect.colSpan; c++) out.push(r * cols + c)
  return out
}

export function boundingRect(cells: number[], cols: number): Rect {
  const rows = cells.map((i) => Math.floor(i / cols))
  const cs = cells.map((i) => i % cols)
  const row = Math.min(...rows)
  const col = Math.min(...cs)
  return {
    row,
    col,
    rowSpan: Math.max(...rows) - row + 1,
    colSpan: Math.max(...cs) - col + 1,
  }
}

/** True when `cells` exactly fills its bounding rectangle — the only shape a merge may take. */
export function isRectangle(cells: number[], cols: number): boolean {
  const unique = [...new Set(cells)]
  if (unique.length < 2) return false
  const expected = boundingCells(unique, cols)
  return expected.length === unique.length && expected.every((c) => unique.includes(c))
}

export function groupFor(state: Pick<WallState, 'groups'>, index: number): WallGroup | undefined {
  return state.groups.find((g) => g.cells.includes(index))
}

/** The top-left cell of a group is its anchor: the one tile that is rendered. */
export function anchorOf(group: WallGroup): number {
  return Math.min(...group.cells)
}

export type MergeResult = { ok: true; state: WallState } | { ok: false; reason: string }

export function mergeScreens(
  state: WallState,
  selection: number[],
  content?: WallContentKey,
): MergeResult {
  // Selecting any cell of an existing group selects the whole group.
  const expanded = new Set(selection)
  for (const g of state.groups)
    if (g.cells.some((c) => expanded.has(c))) g.cells.forEach((c) => expanded.add(c))
  const cells = [...expanded].sort((a, b) => a - b)

  if (cells.length < 2) return { ok: false, reason: 'Select two or more screens to merge.' }
  if (!isRectangle(cells, state.cols))
    return { ok: false, reason: 'Selection must form a complete rectangle.' }

  const anchor = cells[0]!
  const chosen = content ?? state.screens[anchor]?.content ?? 'map-ng'
  const groups = state.groups.filter((g) => !g.cells.some((c) => expanded.has(c)))
  groups.push({ id: `grp-${cells.join('-')}`, cells, content: chosen })
  const screens = state.screens.map((s) =>
    cells.includes(s.index) ? { ...s, content: chosen } : s,
  )
  return { ok: true, state: { ...state, groups, screens, preset: 'custom' } }
}

export function splitScreens(state: WallState, selection: number[]): WallState {
  const groups = state.groups.filter((g) => !g.cells.some((c) => selection.includes(c)))
  if (groups.length === state.groups.length) return state
  return { ...state, groups, preset: 'custom' }
}

/** Puts `content` on every selected screen; a merged group receives it as one canvas. */
export function assignContent(
  state: WallState,
  selection: number[],
  content: WallContentKey,
  contextRef?: string,
): WallState {
  const targets = new Set(selection)
  const groups = state.groups.map((g) => {
    if (!g.cells.some((c) => targets.has(c))) return g
    g.cells.forEach((c) => targets.add(c))
    return { ...g, content }
  })
  const screens = state.screens.map((s) =>
    targets.has(s.index) ? { ...s, content, contextRef: contextRef || undefined } : s,
  )
  return { ...state, screens, groups, preset: 'custom' }
}

/** Drag-and-drop between two ungrouped screens swaps their content. */
export function swapScreens(state: WallState, from: number, to: number): WallState {
  if (from === to) return state
  if (groupFor(state, from) || groupFor(state, to)) return state
  const a = state.screens[from]
  const b = state.screens[to]
  if (!a || !b) return state
  const screens = state.screens.map((s) => {
    if (s.index === from) return { ...s, content: b.content, contextRef: b.contextRef }
    if (s.index === to) return { ...s, content: a.content, contextRef: a.contextRef }
    return s
  })
  return { ...state, screens, preset: 'custom' }
}

/** Tiles to render: one per ungrouped screen and one per group, with their grid placement. */
export function layoutTiles(state: WallState) {
  const tiles: {
    key: string
    index: number
    rect: Rect
    content: WallContentKey
    group?: WallGroup
  }[] = []
  for (const s of state.screens) {
    const g = groupFor(state, s.index)
    if (g) {
      if (anchorOf(g) !== s.index) continue
      tiles.push({
        key: g.id,
        index: s.index,
        rect: boundingRect(g.cells, state.cols),
        content: g.content,
        group: g,
      })
    } else {
      const { row, col } = cellOf(s.index, state.cols)
      tiles.push({
        key: `s${s.index}`,
        index: s.index,
        rect: { row, col, rowSpan: 1, colSpan: 1 },
        content: s.content,
      })
    }
  }
  return tiles
}

export const screenLabel = (index: number) => String(index + 1).padStart(2, '0')
