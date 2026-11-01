import type { FeatureCollection, Geometry } from 'geojson'
import type { FilterSpecification, GeoJSONSource } from 'maplibre-gl'
import {
  Map as MapLibre,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './geo.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useEffect, useRef, useState } from 'react'
import type { MapArea, MapFeature } from '@/api/types'
import { cn } from '@/lib/cn'
import { useTheme } from '@/lib/theme'
import { NIGERIA_BOUNDS, basemapStyle, probeTileServer, type TileServer } from './basemap'
import { CHOROPLETH_HUE, opacityExpression, type CountProperties } from './choropleth'
import { LAYER_COLOUR } from './parts'

export interface GeoMapProps {
  features?: MapFeature[]
  /** Counts by state: drawn as circles sized by count instead of the points. */
  areas?: MapArea[]
  /** Counts joined to state or LGA polygons (ADR 0022): drawn as a choropleth instead of circles. */
  choropleth?: { data: FeatureCollection<Geometry, CountProperties>; breaks: number[] }
  selectedId?: string
  onSelect?: (feature: MapFeature | undefined) => void
  /** west, south, east, north; called when the view settles. */
  onBoundsChange?: (bbox: [number, number, number, number]) => void
  /** A click on empty map: placing a pin. */
  onPick?: (lat: number, lon: number) => void
  /** A single marker, e.g. the place being looked at or the pin being placed. */
  marker?: { lat: number; lon: number; zoom?: number }
  className?: string
}

// MapLibre finds its worker next to its own module, which Vite moves; point at the bundled copy.
setWorkerUrl(workerUrl)

/**
 * A slippy map on the centre's own tiles (ADR 0018). Points come from search's /geo/events as
 * GeoJSON; the basemap from Martin. It never reaches outside the centre.
 */
export function GeoMap({
  features = [],
  areas,
  choropleth,
  selectedId,
  onSelect,
  onBoundsChange,
  onPick,
  marker,
  className,
}: GeoMapProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibre | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const { theme } = useTheme()
  const [server, setServer] = useState<TileServer | null>(null)
  const [ready, setReady] = useState(0)
  // Handlers change every render; the map's listeners read the latest through refs.
  const handlers = useRef({ onSelect, onBoundsChange, onPick, features })
  useEffect(() => {
    handlers.current = { onSelect, onBoundsChange, onPick, features }
  })

  useEffect(() => {
    const ctrl = new AbortController()
    probeTileServer(ctrl.signal).then(setServer)
    return () => ctrl.abort()
  }, [])

  // One map per server answer and theme: the style is rebuilt, then the data layers re-added.
  useEffect(() => {
    if (!container.current || !server) return
    const m = new MapLibre({
      container: container.current,
      style: basemapStyle(server, theme),
      bounds: NIGERIA_BOUNDS,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    })
    m.touchZoomRotate.disableRotation()
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    map.current = m

    m.on('load', () => {
      m.addSource('features', { type: 'geojson', data: empty })
      m.addSource('areas', { type: 'geojson', data: empty })
      m.addSource('boundaries', { type: 'geojson', data: empty })
      // Under the circles and points, over the basemap: polygons filled by count, with thin outlines.
      m.addLayer({
        id: 'boundaries-fill',
        type: 'fill',
        source: 'boundaries',
        paint: { 'fill-color': CHOROPLETH_HUE, 'fill-opacity': 0 },
      })
      m.addLayer({
        id: 'boundaries-line',
        type: 'line',
        source: 'boundaries',
        paint: { 'line-color': CHOROPLETH_HUE, 'line-opacity': 0.35, 'line-width': 0.6 },
      })
      m.addLayer({
        id: 'boundaries-hover',
        type: 'line',
        source: 'boundaries',
        filter: ['==', ['get', 'code'], ''],
        paint: { 'line-color': '#ffffff', 'line-width': 2 },
      })
      m.addLayer({
        id: 'areas',
        type: 'circle',
        source: 'areas',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 1, 10, 10, 38],
          'circle-color': '#45d7f2',
          'circle-opacity': 0.22,
          'circle-stroke-color': '#45d7f2',
          'circle-stroke-width': 1.2,
        },
      })
      m.addLayer({
        id: 'features',
        type: 'circle',
        source: 'features',
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 9, 6],
          'circle-color': ['get', 'colour'],
          'circle-opacity': ['case', ['==', ['get', 'precision'], 'confirmed'], 0.9, 0.12],
          'circle-stroke-color': [
            'case',
            ['boolean', ['get', 'selected'], false],
            '#ffffff',
            ['get', 'colour'],
          ],
          'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 2.5, 1.6],
        },
      })
      setReady((n) => n + 1)
    })

    m.on('click', 'features', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string | undefined
      handlers.current.onSelect?.(handlers.current.features.find((f) => f.id === id))
    })
    m.on('click', (e: MapMouseEvent) => {
      if (m.queryRenderedFeatures(e.point, { layers: ['features'] }).length > 0) return
      if (handlers.current.onPick) handlers.current.onPick(e.lngLat.lat, e.lngLat.lng)
      else handlers.current.onSelect?.(undefined)
    })
    // The choropleth's hover: outline the area and say what it counts.
    const popup = new Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
      className: 'geo-tip',
    })
    const noHover: FilterSpecification = ['==', ['get', 'code'], '']
    m.on('mousemove', 'boundaries-fill', (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as CountProperties | undefined
      if (!p) return
      m.setFilter('boundaries-hover', ['==', ['get', 'code'], p.code])
      popup.setLngLat(e.lngLat).setDOMContent(tooltip(p)).addTo(m)
    })
    m.on('mouseleave', 'boundaries-fill', () => {
      m.setFilter('boundaries-hover', noHover)
      popup.remove()
    })
    m.on('mouseenter', 'features', () => (m.getCanvas().style.cursor = 'pointer'))
    m.on('mouseleave', 'features', () => (m.getCanvas().style.cursor = ''))
    const report = () => {
      const b = m.getBounds()
      handlers.current.onBoundsChange?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
    }
    m.on('moveend', report)
    m.once('load', report)

    return () => {
      m.remove()
      map.current = null
      markerRef.current = null
    }
  }, [server, theme])

  // Data into the sources whenever it, the selection or the map changes.
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    m.getSource<GeoJSONSource>('features')?.setData(
      areas
        ? empty
        : {
            type: 'FeatureCollection',
            features: features.map((f) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
              properties: {
                id: f.id,
                precision: f.precision,
                colour: LAYER_COLOUR[f.layer],
                selected: f.id === selectedId,
              },
            })),
          },
    )
    m.getSource<GeoJSONSource>('boundaries')?.setData(choropleth?.data ?? empty)
    m.setPaintProperty(
      'boundaries-fill',
      'fill-opacity',
      choropleth ? (opacityExpression(choropleth.breaks) as never) : 0,
    )
    m.setPaintProperty('boundaries-line', 'line-opacity', choropleth ? 0.35 : 0)
    m.getSource<GeoJSONSource>('areas')?.setData(
      areas && !choropleth
        ? {
            type: 'FeatureCollection',
            features: areas.map((a) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
              properties: { id: a.placeId, total: a.cases + a.stories },
            })),
          }
        : empty,
    )
  }, [features, areas, choropleth, selectedId, ready])

  // By value, so a parent passing a fresh object each render does not re-centre the map.
  const [mLat, mLon, mZoom] = [marker?.lat, marker?.lon, marker?.zoom]
  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    markerRef.current?.remove()
    markerRef.current = null
    if (mLat === undefined || mLon === undefined) return
    markerRef.current = new Marker({ color: '#ffb95a' }).setLngLat([mLon, mLat]).addTo(m)
    if (mZoom) m.easeTo({ center: [mLon, mLat], zoom: mZoom, duration: 600 })
  }, [mLat, mLon, mZoom, ready])

  return (
    <div className={cn('relative overflow-hidden rounded-md border border-line', className)}>
      {/* Inline, because MapLibre's stylesheet makes its container position: relative. */}
      <div ref={container} style={{ position: 'absolute', inset: 0 }} data-testid="geo-map" />
      {server && !server.basemap && (
        <div className="absolute bottom-2 left-2 rounded-sm bg-void/80 px-2 py-1 text-[11px] text-ink-muted">
          Basemap tiles are not available: showing Nigeria's outline only.
        </div>
      )}
    </div>
  )
}

const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Built as DOM, not HTML, so a place name can never inject markup. */
function tooltip(p: CountProperties): HTMLElement {
  const el = document.createElement('div')
  const title = document.createElement('div')
  title.className = 'font-medium text-ink'
  title.textContent = p.parentName ? `${p.name}, ${p.parentName}` : p.name
  const counts = document.createElement('div')
  counts.className = 'text-ink-muted'
  counts.textContent =
    p.total === 0
      ? 'Nothing placed'
      : `${p.cases} ${p.cases === 1 ? 'case' : 'cases'} · ${p.stories} ${p.stories === 1 ? 'story' : 'stories'}`
  el.append(title, counts)
  return el
}

export default GeoMap
