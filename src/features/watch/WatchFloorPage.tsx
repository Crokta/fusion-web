import { Link, useNavigate } from '@tanstack/react-router'
import {
  Activity,
  ArrowUpRight,
  BellRing,
  Check,
  Gauge,
  Map as MapIcon,
  MonitorPlay,
  Newspaper,
  Radio,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useAcknowledgeAlert, useAlerts, useCases, useFeed, useWatchFloor } from '@/api/queries'
import { ROLE_LABEL, type Alert, type Kpi, type MapEvent } from '@/api/types'
import { NigeriaMap } from '@/components/NigeriaMap'
import { useToast } from '@/components/Toaster'
import {
  Avatar,
  Badge,
  Button,
  CaseLink,
  CaseStateBadge,
  EmptyState,
  ErrorNotice,
  LiveDot,
  PageHeader,
  Panel,
  Skeleton,
  SkeletonRows,
  Sparkline,
  priorityTone,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { countdown, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useShell } from '@/features/shell/ShellContext'
import { useLive, useLiveEvent } from '@/realtime/LiveProvider'

export function WatchFloorPage() {
  const floor = useWatchFloor()
  const live = useLive()
  const toast = useToast()

  useLiveEvent('alert.raised', (a) =>
    toast({ title: a.title, detail: a.detail, tone: a.severity === 'high' ? 'warning' : 'info' }),
  )

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <LiveDot tone="green" /> Operations · Shift B · 14:00–22:00 WAT
          </span>
        }
        title="Watch Floor"
        description="Live picture of public-source reporting, alerts and casework across Nigeria and the region."
        actions={
          <>
            {live.client.simulate && (
              <Button
                icon={Sparkles}
                onClick={() => {
                  live.client.simulate?.()
                }}
              >
                Generate signal
              </Button>
            )}
            <Link
              to="/wall"
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-cyan/90 px-2.5 text-xs font-semibold text-void shadow-[0_6px_20px_-6px_rgb(69_215_242/.55)] hover:bg-cyan"
            >
              <MonitorPlay size={14} /> Command wall
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {floor.isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[104px] rounded-lg" />
            ))
          : floor.data?.kpis.map((k, i) => <KpiCard key={k.key} kpi={k} index={i} />)}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
        <SituationPanel events={floor.data?.events} loading={floor.isPending} />
        <AlertsPanel />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(280px,0.8fr)]">
        <LiveFeedPanel />
        <CasesPanel />
        <div className="flex flex-col gap-3">
          <Panel title="Source health" icon={Radio} bodyClassName="px-4 py-2">
            {floor.data?.sources.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2.5 border-b border-line-soft py-2 text-[12.5px] last:border-0"
              >
                <span
                  className={cn(
                    'size-2 rounded-full',
                    s.status === 'healthy'
                      ? 'bg-green'
                      : s.status === 'degraded'
                        ? 'bg-amber'
                        : 'bg-red',
                  )}
                />
                <span className="flex-1 text-ink-2">{s.name}</span>
                <span
                  className={cn(
                    'num text-[11.5px]',
                    s.lagSeconds > 300 ? 'text-amber' : 'text-ink-faint',
                  )}
                >
                  {s.lagSeconds < 60 ? `${s.lagSeconds}s` : `${Math.round(s.lagSeconds / 60)}m`} lag
                </span>
              </div>
            ))}
          </Panel>
          <Panel title="On duty" icon={Users} bodyClassName="px-4 py-2.5">
            <ul className="space-y-2">
              {floor.data?.onDuty.map((p) => (
                <li key={p.name} className="flex items-center gap-2.5 text-[12.5px]">
                  <Avatar name={p.name} size={24} />
                  <span className="flex-1 truncate text-ink-2">{p.name}</span>
                  <span className="text-[11px] text-ink-faint">{p.desk}</span>
                  <span className="hidden w-20 text-right text-[11px] text-cyan/80 2xl:inline">
                    {ROLE_LABEL[p.role]}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
      {floor.isError && <ErrorNotice error={floor.error} onRetry={() => floor.refetch()} />}
    </div>
  )
}

const kpiIcon = { stories: Newspaper, alerts: BellRing, cases: Activity, ack: Timer } as Record<
  string,
  typeof Gauge
>

function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const Icon = kpiIcon[kpi.key] ?? Gauge
  const good = kpi.key === 'ack' ? (kpi.delta ?? 0) < 0 : (kpi.delta ?? 0) <= 0
  const color = { cyan: 'text-cyan', green: 'text-green', amber: 'text-amber', red: 'text-red' }[
    kpi.tone
  ]
  const glow = { cyan: 'bg-cyan', green: 'bg-green', amber: 'bg-amber', red: 'bg-red' }[kpi.tone]
  return (
    <div
      className="surface group relative overflow-hidden rounded-lg px-4 pt-3.5 pb-3 animate-rise-in"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={cn(
          'pointer-events-none absolute -top-12 -right-10 size-32 rounded-full opacity-[0.08] blur-2xl',
          glow,
        )}
      />
      <div className="flex items-center gap-2">
        <Icon size={14} className={color} aria-hidden />
        <span className="eyebrow flex-1">{kpi.label}</span>
        {kpi.delta !== undefined && (
          <span className={cn('num text-[11px] font-semibold', good ? 'text-green' : 'text-amber')}>
            {kpi.delta > 0 ? '+' : ''}
            {kpi.delta}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-end gap-4">
        <div className="num text-[30px] leading-none font-semibold tracking-[-0.03em] text-ink">
          {kpi.value}
          {kpi.unit && <span className="ml-1 text-sm font-medium text-ink-muted">{kpi.unit}</span>}
        </div>
        <Sparkline data={kpi.trend} tone={kpi.tone} className="mb-0.5 flex-1" height={30} />
      </div>
    </div>
  )
}

function SituationPanel({ events, loading }: { events?: MapEvent[]; loading: boolean }) {
  const { select, selection } = useShell()
  const navigate = useNavigate()
  const [hover, setHover] = useState<MapEvent | null>(null)
  const selected = events?.find(
    (e) => e.caseRef === selection.caseRef && e.title === selection.title,
  )
  const onSelect = (e: MapEvent) =>
    select({
      kind: 'signal',
      title: `${e.place} · ${e.title}`,
      caseRef: e.caseRef,
      priority: e.priority,
      source: 'Geospatial',
      place: `${e.place}, Nigeria`,
      state: e.precision === 'confirmed' ? 'Location confirmed' : 'Location estimated',
    })

  return (
    <Panel
      title="Situation map — Nigeria"
      icon={MapIcon}
      actions={
        <>
          <span className="hidden items-center gap-3 text-[11px] text-ink-faint sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red" /> High
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-amber" /> Medium
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-teal" /> Low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border border-dashed border-ink-muted" />{' '}
              Estimated
            </span>
          </span>
        </>
      }
      bodyClassName="p-0"
    >
      <div className="grid min-h-[380px] grid-cols-1 md:grid-cols-[1fr_250px]">
        <div className="relative p-4 grid-texture" onMouseLeave={() => setHover(null)}>
          {loading ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <NigeriaMap events={events ?? []} selectedId={selected?.id} onSelect={onSelect} />
          )}
          <div className="pointer-events-none absolute bottom-3 left-4 text-[10.5px] text-ink-faint">
            Cases and stories placed in the last 7 days · the full map is under Map
          </div>
          {hover && (
            <div className="absolute top-3 left-4 rounded-md border border-line-strong bg-void/85 px-2.5 py-1.5 text-xs backdrop-blur">
              {hover.title}
            </div>
          )}
        </div>
        <ul className="max-h-[420px] overflow-y-auto border-t border-line-soft p-2 md:border-t-0 md:border-l">
          {events?.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onMouseEnter={() => setHover(e)}
                onClick={() => onSelect(e)}
                onDoubleClick={() =>
                  e.caseRef &&
                  navigate({ to: '/cases/$caseId', params: { caseId: e.caseRef.toLowerCase() } })
                }
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-tint/[0.035]',
                  selected?.id === e.id && 'bg-cyan/[0.07] ring-1 ring-cyan/25 ring-inset',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    e.priority === 'high'
                      ? 'bg-red shadow-[0_0_8px_var(--color-red)]'
                      : e.priority === 'medium'
                        ? 'bg-amber'
                        : 'bg-teal',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {e.title}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {e.place} · {e.precision}
                    {e.caseRef && (
                      <>
                        {' '}
                        · <span className="font-mono text-cyan/80">{e.caseRef}</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

function AlertsPanel() {
  const alerts = useAlerts()
  const ack = useAcknowledgeAlert()
  const toast = useToast()
  const now = useNow(1000)
  const { select } = useShell()
  const items = (alerts.data?.items ?? []).filter((a) => a.status !== 'resolved')
  const open = items.filter((a) => a.status === 'open' || a.status === 'escalated').length

  return (
    <Panel
      id="alerts"
      title="Alerts"
      icon={BellRing}
      actions={<Badge tone={open ? 'red' : 'green'}>{open} need acknowledgement</Badge>}
      bodyClassName="p-0"
      className="max-h-[464px]"
    >
      {alerts.isPending ? (
        <SkeletonRows rows={5} />
      ) : items.length === 0 ? (
        <EmptyState icon={Check} title="All clear">
          No open alerts on this shift.
        </EmptyState>
      ) : (
        <ul className="h-full overflow-y-auto">
          {items.map((a) => (
            <AlertRow
              key={a.id}
              alert={a}
              now={now}
              onAck={() =>
                ack.mutate(a.id, {
                  onSuccess: () =>
                    toast({
                      title: 'Alert acknowledged',
                      detail: 'Escalation timer stopped',
                      tone: 'success',
                    }),
                })
              }
              onSelect={() =>
                select({
                  kind: 'alert',
                  title: a.title,
                  caseRef: a.caseRef,
                  priority: a.severity,
                  source: a.rule,
                  raisedAt: a.raisedAt,
                  state: a.status,
                })
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AlertRow({
  alert: a,
  now,
  onAck,
  onSelect,
}: {
  alert: Alert
  now: number
  onAck: () => void
  onSelect: () => void
}) {
  const needsAck = a.status === 'open' || a.status === 'escalated'
  const timer = a.escalatesAt ? countdown(a.escalatesAt, now) : null
  return (
    <li
      className={cn(
        'group relative flex animate-rise-in gap-3 border-b border-line-soft px-4 py-3 transition-colors last:border-0 hover:bg-tint/[0.02]',
        a.status === 'escalated' && 'bg-red/[0.035]',
      )}
    >
      {needsAck && a.severity === 'high' && (
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-red shadow-[0_0_10px_var(--color-red)]" />
      )}
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <Badge tone={priorityTone[a.severity]} className="uppercase">
            {a.severity}
          </Badge>
          {a.status === 'escalated' && <Badge tone="red">Escalated · L{a.escalationLevel}</Badge>}
          {a.status === 'acknowledged' && (
            <span className="text-[11px] text-green">✓ {a.acknowledgedBy}</span>
          )}
          <span className="num ml-auto text-[11px] text-ink-faint">
            {relative(a.raisedAt, now)}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug font-medium text-ink">{a.title}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-muted">{a.detail}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-faint">
          <span className="font-mono">{a.rule}</span>
          {a.caseRef && <CaseLink caseRef={a.caseRef} />}
          <Link
            to="/alerts/$alertId"
            params={{ alertId: a.id }}
            onClick={(e) => e.stopPropagation()}
            className="ml-auto text-cyan/90 hover:text-ink hover:underline"
          >
            Deliveries →
          </Link>
        </div>
      </button>
      {needsAck && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button size="xs" variant="success" icon={Check} onClick={onAck}>
            Ack
          </Button>
          {timer && (
            <span
              className={cn(
                'num text-[10.5px]',
                timer.overdue ? 'text-red' : timer.soon ? 'text-amber' : 'text-ink-faint',
              )}
              title="Escalates to the next tier if not acknowledged"
            >
              ↑ {timer.label}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

function LiveFeedPanel() {
  const feed = useFeed()
  const now = useNow()
  const { select } = useShell()
  return (
    <Panel
      title="Live feed"
      icon={Newspaper}
      actions={
        <Link
          to="/feed"
          className="inline-flex items-center gap-1 text-[11.5px] text-ink-muted hover:text-cyan"
        >
          All story groups <ArrowUpRight size={12} />
        </Link>
      }
      bodyClassName="p-0"
    >
      {feed.isPending ? (
        <SkeletonRows rows={6} />
      ) : (
        <ul className="max-h-[360px] overflow-y-auto">
          {feed.data?.items.slice(0, 8).map((g) => (
            <li key={g.id} className="animate-rise-in border-b border-line-soft last:border-0">
              <button
                type="button"
                onClick={() =>
                  select({
                    kind: 'story',
                    title: g.headline,
                    caseRef: g.caseRef,
                    priority: g.priority,
                    source: `${g.independentOutlets} independent outlets`,
                    raisedAt: g.firstSeen,
                    place: `${g.place}, Nigeria`,
                    state: g.caseRef ? 'Linked to case' : 'Untriaged',
                  })
                }
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-tint/[0.02]"
              >
                <span
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    g.priority === 'high'
                      ? 'bg-red'
                      : g.priority === 'medium'
                        ? 'bg-amber'
                        : 'bg-teal',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-snug font-medium text-ink">
                    {g.headline}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-faint">
                    {g.place} · {g.independentOutlets} outlets · {g.channel.replace('-', ' ')}
                  </span>
                </span>
                <span className="num shrink-0 text-[11px] text-ink-faint">
                  {relative(g.lastUpdated, now)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function CasesPanel() {
  const cases = useCases('active')
  const now = useNow()
  return (
    <Panel
      title="Active cases"
      icon={Activity}
      actions={
        <Link
          to="/cases"
          className="inline-flex items-center gap-1 text-[11.5px] text-ink-muted hover:text-cyan"
        >
          Case board <ArrowUpRight size={12} />
        </Link>
      }
      bodyClassName="p-0"
    >
      {cases.isPending ? (
        <SkeletonRows rows={6} />
      ) : (
        <ul className="max-h-[360px] overflow-y-auto">
          {cases.data?.items.slice(0, 7).map((c) => {
            const sla = countdown(c.deadline, now)
            return (
              <li key={c.id} className="border-b border-line-soft last:border-0">
                <Link
                  to="/cases/$caseId"
                  params={{ caseId: c.id }}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-tint/[0.02]"
                >
                  <span className="w-[66px] shrink-0 font-mono text-[11px] font-medium text-cyan">
                    {c.ref}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{c.title}</span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <CaseStateBadge state={c.state} />
                      <span className="truncate text-[11px] text-ink-faint">{c.owner.name}</span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      'num shrink-0 text-[11px]',
                      sla.overdue ? 'text-red' : sla.soon ? 'text-amber' : 'text-ink-faint',
                    )}
                  >
                    {sla.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
