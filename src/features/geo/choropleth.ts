import type { FeatureCollection, Geometry } from 'geojson'
import type { MapArea, MapBoundaries } from '@/api/types'

/** The choropleth's single hue: magnitude is one hue, light to dark (no rainbow). */
export const CHOROPLETH_HUE = '#45d7f2'

/** Fill opacity per class, lightest first: the hue's steps against the basemap. */
export const CHOROPLETH_STEPS = [0.16, 0.3, 0.46, 0.62, 0.8] as const

export interface CountProperties {
  code: string
  name: string
  parentName?: string | null
  cases: number
  stories: number
  total: number
}

/**
 * Class breaks for counts: up to five classes, each starting at a whole number. Small counts
 * get one class per value, so 1, 2 and 3 read as different; larger ranges split evenly.
 */
export function choroplethBreaks(max: number): number[] {
  if (max <= 0) return []
  if (max <= CHOROPLETH_STEPS.length) return Array.from({ length: max }, (_, i) => i + 1)
  const breaks = [1]
  for (let i = 1; i < CHOROPLETH_STEPS.length; i++) {
    const b = Math.max(
      breaks[i - 1]! + 1,
      Math.round(1 + ((max - 1) * i) / CHOROPLETH_STEPS.length),
    )
    breaks.push(b)
  }
  return breaks
}

/** The legend's labels for the breaks: "1", "2–3", "8+". */
export function breakLabels(breaks: number[], max: number): string[] {
  return breaks.map((b, i) => {
    const next = breaks[i + 1]
    const end = next === undefined ? max : next - 1
    return end <= b ? String(b) : next === undefined ? `${b}+` : `${b}–${end}`
  })
}

/** Polygons with their counts joined on P-code; a polygon with nothing placed counts 0. */
export function withCounts(
  boundaries: MapBoundaries,
  areas: MapArea[],
): FeatureCollection<Geometry, CountProperties> {
  const byCode = new Map(areas.filter((a) => a.code).map((a) => [a.code!, a]))
  return {
    type: 'FeatureCollection',
    features: boundaries.features.map((f) => {
      const a = byCode.get(f.properties.code)
      const cases = a?.cases ?? 0
      const stories = a?.stories ?? 0
      return {
        type: 'Feature',
        id: f.id,
        geometry: f.geometry as Geometry,
        properties: {
          code: f.properties.code,
          name: f.properties.name,
          parentName: f.properties.parentName,
          cases,
          stories,
          total: cases + stories,
        },
      }
    }),
  }
}

/** MapLibre's fill-opacity: transparent at 0, then one step per class. */
export function opacityExpression(breaks: number[]): unknown[] {
  if (breaks.length === 0) return ['literal', 0]
  const expr: unknown[] = ['step', ['get', 'total'], 0]
  breaks.forEach((b, i) => expr.push(b, CHOROPLETH_STEPS[stepIndex(i, breaks.length)]))
  return expr
}

/** Fewer classes than steps spread across the ramp, so one class is mid-tone, not the darkest. */
export function stepIndex(i: number, classes: number): number {
  const last = CHOROPLETH_STEPS.length - 1
  return classes <= 1 ? Math.floor(last / 2) : Math.round((i * last) / (classes - 1))
}
