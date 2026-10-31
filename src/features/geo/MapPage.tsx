import { Link } from '@tanstack/react-router'
import { ExternalLink, Layers, Map as MapIcon, MapPin, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useMapAreas, useMapFeatures, useMapLayers } from '@/api/queries'
import type { LocationPrecision, MapFeature, MapLayerKey, MapQuery } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  Segmented,
  SkeletonRows,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'
import { ATTRIBUTION } from './basemap'
import { GeoMap } from './LazyGeoMap'
import { LAYER_COLOUR, OriginBadge, PrecisionBadge } from './parts'

type Window = '24h' | '7d' | '30d' | 'all'
type View = 'points' | 'areas'

const WINDOW_HOURS: Record<Exclude<Window, 'all'>, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
}

const startOf = (w: Window) =>
  w === 'all' ? undefined : new Date(Date.now() - WINDOW_HOURS[w] * 3_600_000).toISOString()

/**
 * The map (architecture §7.1, ADR 0018): cases and stories where they happened, as layers. Each
 * layer shows only what the active role reads at its owner; points are filled when confirmed and
 * hollow when estimated. "By state" counts them per state instead.
 */
export function MapPage() {
  const { activeRole } = useAuth()
  const layers = useMapLayers(can.readMap(activeRole))
  const [hidden, setHidden] = useState<MapLayerKey[]>([])
  const [period, setPeriod] = useState<Window>('30d')
  // The window's start is fixed when chosen, so the query key does not change on every render.
  const [from, setFrom] = useState<string | undefined>(() => startOf('30d'))
  const [precision, setPrecision] = useState<LocationPrecision | 'any'>('any')
  const [view, setView] = useState<View>('points')
  const [bbox, setBbox] = useState<MapQuery['bbox']>()
  const [selected, setSelected] = useState<MapFeature>()

  const shown = (layers.data ?? []).map((l) => l.key).filter((k) => !hidden.includes(k))
  const filters = {
    from,
    layers: shown,
    precision: precision === 'any' ? undefined : precision,
  }
  const ready = !!layers.data && shown.length > 0
  const features = useMapFeatures({ ...filters, bbox }, ready && view === 'points' && !!bbox)
  const areas = useMapAreas(filters, ready && view === 'areas')

  if (!can.readMap(activeRole))
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader eyebrow="Analysis" title="Map" />
        <Panel>
          <EmptyState icon={ShieldAlert} title="Your active role cannot read the map">
            The map shows cases and stories, so it needs a role that reads one of them.
          </EmptyState>
        </Panel>
      </div>
    )

  const inView = features.data?.features ?? []

  return (
    <div className="mx-auto flex h-full max-w-[1600px] flex-col">
      <PageHeader
        eyebrow="Analysis"
        title="Map"
        description="Cases and stories where they happened. Filled points are confirmed locations; hollow ones are estimated. Analysts place cases and stories from their own pages."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {layers.data?.map((l) => {
          const on = !hidden.includes(l.key)
          return (
            <button
              key={l.key}
              type="button"
              aria-pressed={on}
              onClick={() => setHidden(on ? [...hidden, l.key] : hidden.filter((k) => k !== l.key))}
              className={cn(
                'inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs',
                on ? 'border-line-strong bg-raised/70 text-ink' : 'border-line text-ink-faint',
              )}
            >
              <span
                className="size-2.5 rounded-full"
                style={{
                  background: on ? LAYER_COLOUR[l.key] : 'transparent',
                  border: `1.5px solid ${LAYER_COLOUR[l.key]}`,
                }}
              />
              {l.label}
              <span className="font-mono text-[11px] text-ink-muted">
                {l.confirmed + l.estimated}
              </span>
            </button>
          )
        })}
        <Segmented
          label="Time window"
          value={period}
          onChange={(p) => {
            setPeriod(p)
            setFrom(startOf(p))
          }}
          options={[
            { value: '24h', label: '24 h' },
            { value: '7d', label: '7 days' },
            { value: '30d', label: '30 days' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Segmented
          label="Precision"
          value={precision}
          onChange={setPrecision}
          options={[
            { value: 'any', label: 'All' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'estimated', label: 'Estimated' },
          ]}
        />
        <Segmented
          label="View"
          value={view}
          onChange={(v) => {
            setView(v)
            setSelected(undefined)
          }}
          options={[
            { value: 'points', label: 'Points' },
            { value: 'areas', label: 'By state' },
          ]}
        />
      </div>
      {layers.error && <ErrorNotice error={layers.error} onRetry={() => layers.refetch()} />}
      <div className="grid min-h-[560px] flex-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex min-h-[480px] flex-col">
          <GeoMap
            className="min-h-[480px] flex-1"
            features={inView}
            areas={view === 'areas' ? (areas.data ?? []) : undefined}
            selectedId={selected?.id}
            onSelect={setSelected}
            onBoundsChange={setBbox}
          />
          <p className="mt-1.5 text-[10.5px] text-ink-faint">{ATTRIBUTION}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {selected && <Selected feature={selected} />}
          {view === 'points' ? (
            <Panel
              title="In view"
              icon={Layers}
              actions={
                features.data && (
                  <span className="font-mono text-[11px] text-ink-muted">
                    {inView.length}
                    {features.data.truncated && '+'}
                  </span>
                )
              }
              bodyClassName="p-0"
            >
              {features.error ? (
                <ErrorNotice error={features.error} onRetry={() => features.refetch()} />
              ) : !features.data ? (
                <SkeletonRows rows={4} />
              ) : inView.length === 0 ? (
                <EmptyState icon={MapPin} title="Nothing placed here">
                  Zoom out, widen the time window, or place a case from its page.
                </EmptyState>
              ) : (
                <ul className="max-h-[520px] divide-y divide-line-soft overflow-y-auto">
                  {inView.slice(0, 100).map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(f)}
                        className={cn(
                          'flex w-full items-start gap-2.5 px-4 py-2.5 text-left hover:bg-tint/[0.03]',
                          f.id === selected?.id && 'bg-cyan/[0.06]',
                        )}
                      >
                        <span
                          className="mt-1 size-2.5 shrink-0 rounded-full"
                          style={{
                            background:
                              f.precision === 'confirmed' ? LAYER_COLOUR[f.layer] : 'transparent',
                            border: `1.5px solid ${LAYER_COLOUR[f.layer]}`,
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ink">{f.title}</span>
                          <span className="block truncate text-[11px] text-ink-muted">
                            {f.label} · {relative(f.at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : (
            <Panel title="By state" icon={MapIcon} bodyClassName="p-0">
              {areas.error ? (
                <ErrorNotice error={areas.error} onRetry={() => areas.refetch()} />
              ) : !areas.data ? (
                <SkeletonRows rows={4} />
              ) : areas.data.length === 0 ? (
                <EmptyState icon={MapPin} title="Nothing placed in this window" />
              ) : (
                <table className="w-full text-[12px]">
                  <thead className="text-left text-[10.5px] text-ink-faint uppercase">
                    <tr>
                      <th className="px-4 py-2 font-medium">State</th>
                      <th className="px-2 py-2 text-right font-medium">Cases</th>
                      <th className="px-2 py-2 text-right font-medium">Stories</th>
                      <th className="px-4 py-2 text-right font-medium">Estimated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {areas.data.map((a) => (
                      <tr key={a.placeId}>
                        <td className="px-4 py-2 text-ink">{a.name}</td>
                        <td className="px-2 py-2 text-right font-mono">{a.cases}</td>
                        <td className="px-2 py-2 text-right font-mono">{a.stories}</td>
                        <td className="px-4 py-2 text-right font-mono text-ink-muted">
                          {a.estimated}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function Selected({ feature: f }: { feature: MapFeature }) {
  return (
    <Panel title={f.subjectType === 'case' ? 'Case' : 'Story'} icon={MapPin}>
      <p className="text-[13px] font-medium text-ink">{f.title}</p>
      <p className="mt-1 text-xs text-ink-muted">
        {f.label} · {relative(f.at)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <PrecisionBadge precision={f.precision} />
        <OriginBadge origin={f.origin} />
      </div>
      <div className="mt-3 text-xs">
        {f.caseId ? (
          <Link
            to="/cases/$caseId"
            params={{ caseId: f.caseId }}
            className="inline-flex items-center gap-1 text-cyan hover:underline"
          >
            Open the case <ExternalLink size={12} aria-hidden />
          </Link>
        ) : (
          <Link
            to="/search"
            search={{ q: f.title }}
            className="inline-flex items-center gap-1 text-cyan hover:underline"
          >
            Find the story in search <ExternalLink size={12} aria-hidden />
          </Link>
        )}
      </div>
    </Panel>
  )
}
