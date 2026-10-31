import { layers as protomapsLayers, namedFlavor } from '@protomaps/basemaps'
import type { Feature } from 'geojson'
import type { MapOptions } from 'maplibre-gl'
import type { Theme } from '@/lib/theme'

type StyleSpecification = Exclude<MapOptions['style'], string | undefined>
type LayerSpecification = StyleSpecification['layers'][number]

/**
 * The basemap (ADR 0018). Tiles come from the centre's own tile server (Martin, in
 * fusion-shared-infra) serving an OpenStreetMap extract from disk; nothing is fetched from a
 * public CDN. Basemap tiles hold only public OpenStreetMap data, so the browser reads them
 * straight from Martin; cases and stories never become tiles and only come through the gateway.
 *
 * When the tile server is down, or has no extract yet, the map still works on a plain
 * background with Nigeria's outline, and says so.
 */
export const TILES_URL = (import.meta.env.VITE_TILES_URL ?? 'http://localhost:3010').replace(
  /\/$/,
  '',
)

/** The tile source name the fetch script gives the extract (basemap.pmtiles). */
export const BASEMAP_SOURCE = 'basemap'

export const ATTRIBUTION =
  '© OpenStreetMap contributors (ODbL) · Protomaps · Place names © GeoNames (CC BY 4.0)'

export interface TileServer {
  /** The extract is served. */
  basemap: boolean
  /** Font stacks Martin can build glyphs for, e.g. "Noto Sans Regular". */
  fonts: string[]
}

/** Asks Martin what it serves. Any failure means no basemap: the map falls back, never breaks. */
export async function probeTileServer(signal?: AbortSignal): Promise<TileServer> {
  try {
    const r = await fetch(`${TILES_URL}/catalog`, { signal })
    if (!r.ok) return { basemap: false, fonts: [] }
    const c = (await r.json()) as {
      tiles?: Record<string, unknown>
      fonts?: Record<string, unknown>
    }
    return { basemap: !!c.tiles?.[BASEMAP_SOURCE], fonts: Object.keys(c.fonts ?? {}) }
  } catch {
    return { basemap: false, fonts: [] }
  }
}

const BACKGROUND: Record<Theme, string> = { dark: '#06111a', light: '#dfe7ee' }

export function basemapStyle(server: TileServer, theme: Theme): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': BACKGROUND[theme] } },
    ],
  }
  if (!server.basemap) {
    style.sources.outline = { type: 'geojson', data: NIGERIA_OUTLINE }
    style.layers.push(
      {
        id: 'outline-fill',
        type: 'fill',
        source: 'outline',
        paint: { 'fill-color': theme === 'dark' ? '#0d2231' : '#f4f7fa' },
      },
      {
        id: 'outline-line',
        type: 'line',
        source: 'outline',
        paint: { 'line-color': theme === 'dark' ? '#2a5a78' : '#7d97ab', 'line-width': 1.2 },
      },
    )
    return style
  }

  // Martin builds glyphs from the font files it was given; use the first Noto Sans it has for every label.
  const font = server.fonts.find((f) => f.startsWith('Noto Sans')) ?? server.fonts[0]
  style.sources[BASEMAP_SOURCE] = {
    type: 'vector',
    url: `${TILES_URL}/${BASEMAP_SOURCE}`,
    attribution: ATTRIBUTION,
  }
  if (font) style.glyphs = `${TILES_URL}/font/{fontstack}/{range}`
  const base = protomapsLayers(BASEMAP_SOURCE, namedFlavor(theme), {
    lang: 'en',
  }) as LayerSpecification[]
  for (const layer of base) {
    if (layer.type !== 'symbol') {
      style.layers.push(layer)
      continue
    }
    // No sprite is served (POI icons add nothing here), and no labels without glyphs.
    if (!font || layer.layout?.['icon-image']) continue
    style.layers.push({ ...layer, layout: { ...layer.layout, 'text-font': [font] } })
  }
  return style
}

/** A simplified trace of Nigeria's borders (the same as NigeriaMap's), for the map without tiles. */
const NIGERIA_OUTLINE: Feature = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [2.69, 6.37],
        [2.72, 7.8],
        [2.75, 9.05],
        [3.1, 9.4],
        [3.6, 10.3],
        [3.65, 11.7],
        [3.6, 11.95],
        [4.1, 12.9],
        [4.25, 13.45],
        [5.3, 13.75],
        [6.1, 13.65],
        [6.8, 13.1],
        [7.8, 13.35],
        [9.0, 12.85],
        [9.6, 12.8],
        [10.6, 13.3],
        [11.5, 13.35],
        [12.3, 13.1],
        [13.1, 13.55],
        [13.6, 13.7],
        [14.1, 12.95],
        [14.2, 12.4],
        [14.6, 12.15],
        [14.55, 11.6],
        [13.95, 11.0],
        [13.7, 10.15],
        [13.25, 9.6],
        [13.15, 8.9],
        [12.8, 8.6],
        [12.2, 8.15],
        [12.0, 7.4],
        [11.6, 6.8],
        [11.1, 6.45],
        [10.6, 6.95],
        [10.15, 6.95],
        [9.75, 6.6],
        [9.45, 6.1],
        [8.85, 5.1],
        [8.5, 4.75],
        [7.95, 4.45],
        [7.0, 4.4],
        [6.4, 4.3],
        [5.85, 4.35],
        [5.45, 5.1],
        [5.0, 5.75],
        [4.5, 6.25],
        [3.75, 6.4],
        [2.69, 6.37],
      ],
    ],
  },
}

/** Nigeria with a margin: where the map opens. */
export const NIGERIA_BOUNDS: [[number, number], [number, number]] = [
  [2.2, 3.8],
  [15.2, 14.2],
]
