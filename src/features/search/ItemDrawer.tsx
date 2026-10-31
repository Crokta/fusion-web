import { useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Fingerprint, MonitorUp, Send } from 'lucide-react'
import { useState } from 'react'
import { useItem, useRequestPublication } from '@/api/queries'
import type { ItemDetail, WallContentKey } from '@/api/types'
import { Drawer } from '@/components/Overlay'
import { NigeriaMap } from '@/components/NigeriaMap'
import { useToast } from '@/components/Toaster'
import { Badge, Button, MarkingTag, Meter, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime } from '@/lib/format'
import { useShell } from '@/features/shell/ShellContext'
import { KIND_META } from './FusionSearch'
import { LocationsPanel } from '@/features/geo/LocationsPanel'

const TABS = ['Overview', 'Images', 'Similarity', 'Metadata', 'Entities', 'Locations'] as const
type Tab = (typeof TABS)[number]

const wallContentFor = (kind: ItemDetail['kind']): WallContentKey =>
  kind === 'location'
    ? 'map-ng'
    : kind === 'media'
      ? 'video'
      : kind === 'case'
        ? 'cases'
        : kind === 'alert'
          ? 'alerts'
          : kind === 'social'
            ? 'social'
            : 'news'

/** The item modal: one record with its images, similarity, metadata, entities and places. */
export function ItemDrawer() {
  const { itemId, closeItem, closeSearch, openItem, select } = useShell()
  const item = useItem(itemId)
  const [tab, setTab] = useState<Tab>('Overview')
  const navigate = useNavigate()
  const toast = useToast()
  const request = useRequestPublication()
  const d = item.data

  const close = () => {
    closeItem()
    setTab('Overview')
  }

  return (
    <Drawer
      open={!!itemId}
      onClose={close}
      title={d?.title ?? 'Loading record…'}
      eyebrow={
        d && (
          <>
            <Badge tone="cyan">{KIND_META[d.kind].label.replace(/s$/, '')}</Badge>
            <span className="font-mono text-[11px] text-ink-faint">{d.id}</span>
            <MarkingTag marking={d.marking} />
            <span className="text-[11px] text-ink-faint">Synthetic record · {dateTime(d.at)}</span>
          </>
        )
      }
    >
      {!d ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Record sections"
            className="sticky -top-5 z-10 -mx-6 mb-5 flex gap-1 overflow-x-auto border-b border-line bg-panel/95 px-6 backdrop-blur"
          >
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  'relative h-10 px-2.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
                  tab === t ? 'text-ink' : 'text-ink-muted hover:text-ink-2',
                )}
              >
                {t}
                {tab === t && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cyan shadow-[0_0_8px_rgb(69_215_242/.8)]" />
                )}
              </button>
            ))}
          </div>

          <div key={tab} className="animate-fade-in" role="tabpanel">
            {tab === 'Overview' && (
              <div className="space-y-5">
                <p className="text-[13.5px] leading-relaxed text-ink-2">{d.summary}</p>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    ['Related sources', d.related.length],
                    ['Similar items', d.similar.length],
                    ['Review status', 'Open'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-line bg-canvas/60 px-3 py-2.5">
                      <div className="num text-xl font-semibold text-cyan">{v}</div>
                      <div className="eyebrow mt-0.5 text-[9.5px]">{k}</div>
                    </div>
                  ))}
                </div>
                <section className="rounded-lg border border-line bg-canvas/40 p-4">
                  <h3 className="eyebrow mb-2 text-cyan/80">Evidence & provenance</h3>
                  <p className="text-[12.5px] leading-relaxed text-ink-muted">{d.detail}</p>
                  <ul className="mt-3 divide-y divide-line-soft text-[12.5px]">
                    {[
                      'Source trail · collection record available',
                      'Verification · human review pending',
                      `Timeline · first observed ${dateTime(d.at)}`,
                      `Case link · ${d.caseRef ?? 'none'}`,
                    ].map((x) => (
                      <li key={x} className="py-2 text-ink-2">
                        {x}
                      </li>
                    ))}
                  </ul>
                </section>
                {d.related.length > 0 && (
                  <section>
                    <h3 className="eyebrow mb-2">Connected intelligence · {d.related.length}</h3>
                    <ul className="space-y-1">
                      {d.related.map((r) => {
                        const M = KIND_META[r.kind]
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onClick={() => openItem(r.id)}
                              className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-tint/[0.035]"
                            >
                              <M.icon size={14} className={M.tone} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12.5px] text-ink">
                                  {r.title}
                                </span>
                                <span className="block text-[11px] text-ink-faint">
                                  {M.label} · {r.id}
                                </span>
                              </span>
                              <ArrowUpRight size={13} className="text-ink-faint" />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {tab === 'Images' && (
              <div className="grid grid-cols-2 gap-3">
                {d.images.map((img, i) => (
                  <figure
                    key={img.id}
                    className="group overflow-hidden rounded-lg border border-line bg-canvas"
                  >
                    <div
                      className="relative aspect-video"
                      style={{
                        background: `linear-gradient(140deg, hsl(${img.hue} 32% 28%), hsl(${img.hue + 35} 40% 10%))`,
                      }}
                    >
                      <div className="absolute inset-0 scanlines opacity-70" />
                      <div className="absolute inset-[18%] rounded border border-tint/15" />
                      {i === 2 && (
                        <span className="absolute top-2 right-2 rounded bg-amber px-1.5 py-0.5 text-[10px] font-bold text-void">
                          ARCHIVE 0.91
                        </span>
                      )}
                    </div>
                    <figcaption className="flex items-center justify-between px-3 py-2 text-[11.5px] text-ink-muted">
                      {img.caption}
                      <Fingerprint size={12} className="text-ink-faint" />
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}

            {tab === 'Similarity' && (
              <ul className="space-y-2">
                {d.similar.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line bg-canvas/50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {s.title}
                      </span>
                      <span
                        className={cn(
                          'num text-[13px] font-semibold',
                          s.score > 0.85
                            ? 'text-amber'
                            : s.score > 0.6
                              ? 'text-cyan'
                              : 'text-ink-muted',
                        )}
                      >
                        {s.score.toFixed(2)}
                      </span>
                    </div>
                    <Meter
                      value={s.score}
                      tone={s.score > 0.85 ? 'amber' : 'cyan'}
                      className="mt-2"
                    />
                    <div className="mt-1.5 text-[11px] text-ink-faint">
                      First seen {dateTime(s.firstSeen)}
                    </div>
                  </li>
                ))}
                <p className="pt-2 text-[11.5px] text-ink-faint">
                  Similarity is an indicator from media-sim 2.3.1. A high score does not prove
                  recycling.
                </p>
              </ul>
            )}

            {tab === 'Metadata' && (
              <dl className="divide-y divide-line-soft rounded-lg border border-line">
                {d.metadata.map((m) => (
                  <div
                    key={m.key}
                    className="grid grid-cols-[140px_1fr] gap-3 px-4 py-2.5 text-[12.5px]"
                  >
                    <dt className="text-ink-faint">{m.key}</dt>
                    <dd className="font-mono text-[12px] break-all text-ink-2">{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {tab === 'Entities' && (
              <ul className="grid grid-cols-2 gap-2.5">
                {d.entities.map((e) => (
                  <li
                    key={e.name}
                    className="rounded-lg border border-line bg-canvas/50 px-3.5 py-3"
                  >
                    <Badge
                      tone={
                        e.type === 'person'
                          ? 'violet'
                          : e.type === 'location'
                            ? 'green'
                            : e.type === 'event'
                              ? 'red'
                              : 'cyan'
                      }
                    >
                      {e.type}
                    </Badge>
                    <div className="mt-2 text-[13px] font-medium text-ink">{e.name}</div>
                    <div className="num text-[11px] text-ink-faint">{e.mentions} mentions</div>
                  </li>
                ))}
              </ul>
            )}

            {tab === 'Locations' && (d.recordType === 'story' || d.recordType === 'case') && (
              // A real story or case is placed on the map in search's geo module (E32, ADR 0018).
              <LocationsPanel subjectType={d.recordType} subjectId={d.id} />
            )}
            {tab === 'Locations' && d.recordType !== 'story' && d.recordType !== 'case' && (
              <div className="space-y-3">
                <div className="h-64 rounded-lg border border-line bg-canvas/60 p-2">
                  <NigeriaMap
                    events={d.locations.map((l, i) => ({
                      id: `l${i}`,
                      title: l.name,
                      place: l.name,
                      lat: l.lat,
                      lon: l.lon,
                      priority: 'medium',
                      precision: l.precision,
                    }))}
                    selectedId="l0"
                    dense
                  />
                </div>
                {d.locations.map((l) => (
                  <div
                    key={l.name}
                    className="flex items-center gap-3 rounded-md border border-line px-3.5 py-2.5 text-[12.5px]"
                  >
                    <span className="flex-1 text-ink">{l.name}</span>
                    <span className="num font-mono text-[11px] text-ink-faint">
                      {l.lat.toFixed(3)}, {l.lon.toFixed(3)}
                    </span>
                    <Badge tone={l.precision === 'confirmed' ? 'green' : 'amber'}>
                      {l.precision}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sticky -bottom-5 -mx-6 mt-6 flex flex-wrap gap-2 border-t border-line bg-panel/95 px-6 py-3.5 backdrop-blur">
            {d.caseRef && (
              <Button
                variant="primary"
                icon={ArrowUpRight}
                onClick={() => {
                  close()
                  closeSearch()
                  select({
                    kind: 'signal',
                    title: d.title,
                    caseRef: d.caseRef,
                    source: d.source,
                    place: d.place,
                    raisedAt: d.at,
                  })
                  void navigate({
                    to: '/cases/$caseId',
                    params: { caseId: d.caseRef!.toLowerCase() },
                  })
                }}
              >
                Open investigation
              </Button>
            )}
            <Button
              icon={Send}
              onClick={() =>
                toast({
                  title: 'Assignment created',
                  detail: `${d.caseRef ?? d.id} sent to Amaka Nwosu with evidence context`,
                  tone: 'success',
                })
              }
            >
              Send to analyst
            </Button>
            <Button
              icon={MonitorUp}
              loading={request.isPending}
              onClick={() =>
                request.mutate(
                  {
                    content: wallContentFor(d.kind),
                    targets: [0],
                    contextRef: d.caseRef,
                    note: d.title,
                  },
                  {
                    onSuccess: (p) =>
                      toast({
                        title: `${p.ref} queued for wall approval`,
                        detail: 'A supervisor will approve or reject it.',
                        tone: 'success',
                      }),
                    onError: (e) =>
                      toast({ title: 'Request failed', detail: e.message, tone: 'error' }),
                  },
                )
              }
            >
              Request wall display
            </Button>
          </div>
        </>
      )}
    </Drawer>
  )
}
