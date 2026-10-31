import { BookOpen, MapPin, Search, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useGazetteerDatasets, usePlaces } from '@/api/queries'
import type { Place, PlaceKind } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  Badge,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  Segmented,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { useDebounced } from './useDebounced'
import { cn } from '@/lib/cn'
import { ATTRIBUTION } from './basemap'
import { GeoMap } from './LazyGeoMap'
import { formatPoint, kindLabel, placeContext } from './parts'

type KindFilter = PlaceKind | 'any'

/**
 * The gazetteer (architecture §7.1, ADR 0018): Nigeria's states, LGAs, towns and villages, and the
 * rest of West Africa and the Sahel down to towns of 5,000, from GeoNames. It is what analysts
 * place cases and stories with, and what E20's place extraction will resolve names against.
 */
export function GazetteerPage() {
  const { activeRole } = useAuth()
  const [text, setText] = useState('')
  const [kind, setKind] = useState<KindFilter>('any')
  const q = useDebounced(text.trim(), 250)
  const places = usePlaces(q, kind === 'any' ? undefined : kind)
  const datasets = useGazetteerDatasets()
  const [selected, setSelected] = useState<Place>()

  if (!can.readMap(activeRole))
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader eyebrow="Analysis" title="Gazetteer" />
        <Panel>
          <EmptyState icon={ShieldAlert} title="Your active role cannot read the gazetteer" />
        </Panel>
      </div>
    )

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Analysis"
        title="Gazetteer"
        description="Place names, other spellings and where they are, for Nigeria and the region. Search by any name a report might use."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Find a place" icon={Search}>
            <input
              className={inputClass}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Maiduguri, Gwoza, Sambisa"
              aria-label="Place name"
              autoFocus
            />
            <Segmented
              className="mt-3"
              label="Kind of place"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'any', label: 'All' },
                { value: 'admin1', label: 'States' },
                { value: 'admin2', label: 'LGAs' },
                { value: 'place', label: 'Towns' },
                { value: 'feature', label: 'Features' },
              ]}
            />
          </Panel>
          <Panel title="Places" icon={MapPin} bodyClassName="p-0">
            {q.length < 2 ? (
              <EmptyState icon={Search} title="Type at least two letters" />
            ) : places.error ? (
              <ErrorNotice error={places.error} onRetry={() => places.refetch()} />
            ) : !places.data ? (
              <SkeletonRows rows={5} />
            ) : places.data.length === 0 ? (
              <EmptyState icon={MapPin} title="No place by that name" />
            ) : (
              <ul className="max-h-[560px] divide-y divide-line-soft overflow-y-auto">
                {places.data.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-tint/[0.03]',
                        p.id === selected?.id && 'bg-cyan/[0.06]',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{p.name}</span>
                        <span className="block truncate text-[11px] text-ink-muted">
                          {placeContext(p)}
                        </span>
                      </span>
                      <Badge>{kindLabel(p.kind, p.country)}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <GeoMap
            className="h-[420px]"
            marker={
              selected && { lat: selected.lat, lon: selected.lon, zoom: zoomFor(selected.kind) }
            }
          />
          {selected && <PlaceDetail place={selected} />}
          <Panel title="Source and licence" icon={BookOpen}>
            {datasets.error ? (
              <ErrorNotice error={datasets.error} />
            ) : (
              datasets.data?.map((d) => (
                <div key={d.key} className="space-y-1 text-xs text-ink-2">
                  <p>{d.attribution}.</p>
                  <p className="text-ink-muted">
                    {d.source}. {d.placeCount.toLocaleString('en-GB')} places, loaded{' '}
                    {new Date(d.loadedAt).toLocaleDateString('en-GB')}.
                  </p>
                </div>
              ))
            )}
            <p className="mt-2 text-[11px] text-ink-faint">Basemap: {ATTRIBUTION}.</p>
          </Panel>
        </div>
      </div>
    </div>
  )
}

const zoomFor = (k: PlaceKind) =>
  k === 'country' ? 5 : k === 'admin1' ? 7 : k === 'admin2' ? 9 : 11

function PlaceDetail({ place: p }: { place: Place }) {
  return (
    <Panel title={p.name} icon={MapPin} actions={<Badge>{kindLabel(p.kind, p.country)}</Badge>}>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-ink-muted">Where</dt>
        <dd className="text-ink-2">{placeContext(p)}</dd>
        <dt className="text-ink-muted">Point</dt>
        <dd className="font-mono text-ink-2">{formatPoint(p.lat, p.lon)}</dd>
        {p.population > 0 && (
          <>
            <dt className="text-ink-muted">Population</dt>
            <dd className="text-ink-2">{p.population.toLocaleString('en-GB')}</dd>
          </>
        )}
        <dt className="text-ink-muted">Other names</dt>
        <dd className="text-ink-2">{p.aliases.length ? p.aliases.join(' · ') : 'None recorded'}</dd>
        <dt className="text-ink-muted">Gazetteer id</dt>
        <dd className="font-mono text-ink-faint">{p.id}</dd>
      </dl>
    </Panel>
  )
}
