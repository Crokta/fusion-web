import { describe, expect, it } from 'vitest'
import { stateFromPreset, wallPresets } from '@/api/mock/fixtures'
import {
  assignContent,
  boundingCells,
  isRectangle,
  layoutTiles,
  mergeScreens,
  splitScreens,
  swapScreens,
} from '@/lib/wall-model'

const standing = () => stateFromPreset(wallPresets[0]!, 1, 'test')

describe('wall model', () => {
  it('recognises complete rectangles only', () => {
    expect(isRectangle([0, 1, 4, 5], 4)).toBe(true)
    expect(isRectangle([0, 1, 2], 4)).toBe(true)
    expect(isRectangle([0, 5], 4)).toBe(false) // diagonal corners, not filled
    expect(isRectangle([3, 4], 4)).toBe(false) // wraps a row boundary
    expect(isRectangle([7], 4)).toBe(false)
    expect(boundingCells([0, 5], 4)).toEqual([0, 1, 4, 5])
  })

  it('merges a rectangle into one logical screen and renders a single tile for it', () => {
    const res = mergeScreens(standing(), [0, 1, 4, 5], 'map-ng')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.state.groups).toHaveLength(1)
    expect(res.state.preset).toBe('custom')
    const tiles = layoutTiles(res.state)
    expect(tiles).toHaveLength(13)
    const merged = tiles.find((t) => t.group)
    expect(merged?.rect).toEqual({ row: 0, col: 0, rowSpan: 2, colSpan: 2 })
    expect(merged?.content).toBe('map-ng')
  })

  it('refuses a merge that is not a rectangle', () => {
    const res = mergeScreens(standing(), [0, 5])
    expect(res).toEqual({ ok: false, reason: 'Selection must form a complete rectangle.' })
  })

  it('absorbs an existing group when the new selection overlaps it', () => {
    const first = mergeScreens(standing(), [0, 1])
    if (!first.ok) throw new Error('setup')
    const second = mergeScreens(first.state, [1, 2])
    expect(second.ok).toBe(true)
    if (second.ok) expect(second.state.groups.map((g) => g.cells)).toEqual([[0, 1, 2]])
  })

  it('splits only the groups touched by the selection', () => {
    const preset = stateFromPreset(
      wallPresets.find((p) => p.key === 'verification')!,
      1,
      'test',
    )
    expect(preset.groups).toHaveLength(2)
    const next = splitScreens(preset, [9])
    expect(next.groups.map((g) => g.cells)).toEqual([[0, 1, 4, 5]])
    expect(splitScreens(next, [15])).toBe(next)
  })

  it('assigns content to a whole merged canvas when one of its cells is targeted', () => {
    const res = mergeScreens(standing(), [10, 11])
    if (!res.ok) throw new Error('setup')
    const next = assignContent(res.state, [11], 'video', 'INV-0263')
    expect(next.groups[0]!.content).toBe('video')
    expect(next.screens[10]!.content).toBe('video')
    expect(next.screens[10]!.contextRef).toBe('INV-0263')
  })

  it('swaps two ungrouped screens and leaves grouped ones alone', () => {
    const s = standing()
    const swapped = swapScreens(s, 0, 15)
    expect(swapped.screens[0]!.content).toBe('live-feeds')
    expect(swapped.screens[15]!.content).toBe('news')
    const res = mergeScreens(s, [0, 1])
    if (!res.ok) throw new Error('setup')
    expect(swapScreens(res.state, 0, 15)).toBe(res.state)
  })
})
