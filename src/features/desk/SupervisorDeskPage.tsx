import { Link } from '@tanstack/react-router'
import {
  AlarmClock,
  ArrowUpRight,
  BellRing,
  ClipboardCheck,
  FileText,
  Map as MapIcon,
  MonitorPlay,
  ShieldAlert,
  Stamp,
  UserRound,
  Users,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import {
  useAlerts,
  useApprovals,
  useBriefsAwaitingRelease,
  useCases,
  useOnDutyNow,
  useReviews,
  useWallPublications,
} from '@/api/queries'
import { TIER_LABEL } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  Avatar,
  Badge,
  CaseStateBadge,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  PriorityBadge,
  SkeletonRows,
  caseStateLabel,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { countdown, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { WORKED_STATES, atRisk, workload } from './workload'

/**
 * The supervisor desk (E34; architecture §1): the team's workload, cases by state and owner,
 * alerts and who is on duty, and everything waiting on a decision. It composes reads the
 * services already serve; each panel shows only what the active role may read.
 */
export function SupervisorDeskPage() {
  const { activeRole } = useAuth()
  if (!can.viewDesk(activeRole))
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <PageHeader eyebrow="Operations" title="Supervisor desk" />
        <Panel>
          <EmptyState icon={ShieldAlert} title="For supervisors and the centre lead">
            Switch to Supervisor or Centre lead in the user menu to see the team&rsquo;s workload.
          </EmptyState>
        </Panel>
      </div>
    )
  return <Desk />
}

function Desk() {
  const { activeRole } = useAuth()
  const now = useNow()
  const cases = useCases('active')
  const alerts = useAlerts()
  const onDuty = useOnDutyNow()
  const approvals = useApprovals()
  const reviews = useReviews()
  const wall = useWallPublications()
  const briefs = useBriefsAwaitingRelease(can.readBriefs(activeRole))

  const active = useMemo(() => cases.data?.items ?? [], [cases.data])
  const load = useMemo(() => workload(active, now), [active, now])
  const risky = useMemo(() => atRisk(active, now), [active, now])
  const openAlerts = (alerts.data?.items ?? []).filter(
    (a) => a.status === 'open' || a.status === 'escalated',
  )
  const pendingApprovals = (approvals.data?.items ?? []).filter((a) => a.status === 'pending')
  const wallWaiting = (wall.data ?? []).filter((p) => p.status === 'pending')
  const byState = WORKED_STATES.map((s) => ({
    state: s,
    count: active.filter((c) => c.state === s).length,
  }))
  const busiest = Math.max(1, ...load.map((l) => l.total))

  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <PageHeader
        eyebrow="Operations · Supervision"
        title="Supervisor desk"
        description="The team's workload, cases at risk of missing their deadline, alerts and who is on duty, and every decision waiting on you."
      />

      <dl className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Active cases" value={active.length} loading={cases.isPending} />
        <Kpi
          label="Overdue"
          value={risky.filter((c) => new Date(c.deadline).getTime() < now).length}
          tone="red"
          loading={cases.isPending}
        />
        <Kpi
          label="Waiting for review"
          value={reviews.data?.items.length ?? 0}
          loading={reviews.isPending}
        />
        <Kpi
          label="Open alerts"
          value={openAlerts.length}
          tone="amber"
          loading={alerts.isPending}
        />
        <Kpi
          label="Approvals waiting on you"
          value={pendingApprovals.length}
          loading={approvals.isPending}
        />
        <Kpi label="Wall requests" value={wallWaiting.length} loading={wall.isPending} />
      </dl>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <Panel
            title="Workload by analyst"
            icon={Users}
            actions={
              <span className="flex flex-wrap gap-1.5">
                {byState.map((s) => (
                  <span key={s.state} className="text-[11px] text-ink-faint">
                    {caseStateLabel(s.state)} <span className="num text-ink-2">{s.count}</span>
                  </span>
                ))}
              </span>
            }
            bodyClassName="p-0"
          >
            {cases.isPending ? (
              <SkeletonRows rows={4} />
            ) : cases.isError ? (
              <ErrorNotice error={cases.error} onRetry={() => cases.refetch()} />
            ) : load.length === 0 ? (
              <EmptyState icon={Users} title="No active cases">
                Cases appear here once they leave triage.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <caption className="sr-only">Active cases by owner and state</caption>
                  <thead>
                    <tr className="border-b border-line-soft text-left text-[11px] text-ink-faint">
                      <th scope="col" className="px-4 py-2 font-medium">
                        Owner
                      </th>
                      {WORKED_STATES.map((s) => (
                        <th key={s} scope="col" className="px-2 py-2 text-right font-medium">
                          {caseStateLabel(s)}
                        </th>
                      ))}
                      <th scope="col" className="px-2 py-2 text-right font-medium">
                        Late
                      </th>
                      <th scope="col" className="w-40 px-4 py-2 font-medium">
                        Load
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {load.map((row) => (
                      <tr key={row.owner.id}>
                        <th scope="row" className="px-4 py-2 text-left font-normal">
                          <span className="flex items-center gap-2">
                            <Avatar name={row.owner.name} size={20} />
                            <span className="truncate text-ink">{row.owner.name}</span>
                          </span>
                        </th>
                        {WORKED_STATES.map((s) => (
                          <td key={s} className="num px-2 py-2 text-right text-ink-2">
                            {row.byState[s] ?? <span className="text-ink-faint">·</span>}
                          </td>
                        ))}
                        <td
                          className={cn(
                            'num px-2 py-2 text-right',
                            row.overdue ? 'font-semibold text-red' : 'text-ink-faint',
                          )}
                        >
                          {row.overdue || '·'}
                          {row.dueSoon > 0 && (
                            <span className="ml-1 text-amber" title="Due within 24 hours">
                              +{row.dueSoon}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div
                            className="h-1.5 rounded-full bg-tint/[0.06]"
                            role="img"
                            aria-label={`${row.total} active cases`}
                          >
                            <div
                              className="h-full rounded-full bg-cyan"
                              style={{ width: `${(row.total / busiest) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="At risk: overdue or due within a day"
            icon={AlarmClock}
            actions={
              <Link
                to="/map"
                className="inline-flex items-center gap-1 text-[11.5px] text-cyan hover:underline"
              >
                <MapIcon size={12} aria-hidden /> On the map
              </Link>
            }
            bodyClassName="p-0"
          >
            {cases.isPending ? (
              <SkeletonRows rows={3} />
            ) : risky.length === 0 ? (
              <p className="p-4 text-[12px] text-ink-muted">No case is late or due within a day.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {risky.map((c) => {
                  const due = countdown(c.deadline, now)
                  return (
                    <li key={c.id}>
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: c.id }}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-tint/[0.025]"
                      >
                        <span className="font-mono text-[12px] font-semibold text-cyan">
                          {c.ref}
                        </span>
                        <PriorityBadge priority={c.priority} />
                        <CaseStateBadge state={c.state} />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                          {c.title}
                        </span>
                        <span className="hidden text-[11.5px] text-ink-faint sm:inline">
                          {c.owner.name}
                        </span>
                        <span
                          className={cn(
                            'num w-20 text-right text-[12px] font-semibold',
                            due.overdue ? 'text-red' : 'text-amber',
                          )}
                        >
                          {due.label}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel title="On duty now" icon={UserRound}>
            {onDuty.isPending ? (
              <SkeletonRows rows={3} />
            ) : onDuty.isError ? (
              <ErrorNotice error={onDuty.error} onRetry={() => onDuty.refetch()} />
            ) : (
              <dl className="space-y-2 text-[12.5px]">
                {(onDuty.data ?? []).map((t) => (
                  <div key={t.tier} className="flex gap-3">
                    <dt className="w-28 shrink-0 text-ink-faint">{TIER_LABEL[t.tier]}</dt>
                    <dd className="text-ink-2">
                      {t.people.length === 0 ? (
                        <span className="text-red">Nobody on duty</span>
                      ) : (
                        t.people.map((p) => p.name).join(', ')
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Panel>

          <Panel
            title="Alerts open"
            icon={BellRing}
            actions={<DeskLink to="/alerts">All alerts</DeskLink>}
            bodyClassName="p-0"
          >
            {alerts.isPending ? (
              <SkeletonRows rows={3} />
            ) : alerts.isError ? (
              <ErrorNotice error={alerts.error} onRetry={() => alerts.refetch()} />
            ) : openAlerts.length === 0 ? (
              <p className="p-4 text-[12px] text-ink-muted">No open alerts.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {openAlerts.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-4 py-2 text-[12px]">
                    <PriorityBadge priority={a.severity} />
                    <span className="min-w-0 flex-1 truncate text-ink">{a.title}</span>
                    {a.tier && <Badge tone="neutral">{TIER_LABEL[a.tier]}</Badge>}
                    <span className="shrink-0 text-ink-faint">{relative(a.raisedAt, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Waiting on a decision" icon={Stamp} bodyClassName="p-0">
            <ul className="divide-y divide-line-soft text-[12.5px]">
              <Waiting
                icon={ClipboardCheck}
                to="/review"
                label="Cases to review"
                count={reviews.data?.items.length}
                error={reviews.isError}
              />
              <Waiting
                icon={Stamp}
                to="/approvals"
                label="Approvals waiting on you"
                count={pendingApprovals.length}
                detail={pendingApprovals
                  .slice(0, 3)
                  .map((a) => a.caseRef ?? a.subject)
                  .join(', ')}
                error={approvals.isError}
              />
              <Waiting
                icon={FileText}
                to="/review"
                label="Briefs waiting for release"
                count={briefs.data?.items.length}
                error={briefs.isError}
              />
              <Waiting
                icon={MonitorPlay}
                to="/wall"
                label="Requests for the wall"
                count={wallWaiting.length}
                error={wall.isError}
              />
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  tone,
  loading,
}: {
  label: string
  value: number
  tone?: 'red' | 'amber'
  loading?: boolean
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-4 py-3">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd
        className={cn(
          'num mt-1 text-[24px] leading-none font-semibold',
          value > 0 && tone === 'red' && 'text-red',
          value > 0 && tone === 'amber' && 'text-amber',
        )}
      >
        {loading ? '–' : value}
      </dd>
    </div>
  )
}

function DeskLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-[11.5px] text-cyan hover:underline"
    >
      {children} <ArrowUpRight size={11} aria-hidden />
    </Link>
  )
}

function Waiting({
  icon: Icon,
  to,
  label,
  count,
  detail,
  error,
}: {
  icon: typeof Stamp
  to: string
  label: string
  count?: number
  detail?: string
  error?: boolean
}) {
  return (
    <li>
      <Link
        to={to}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-tint/[0.025]"
      >
        <Icon size={14} className="shrink-0 text-ink-faint" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="text-ink">{label}</span>
          {detail && <span className="block truncate text-[11px] text-ink-faint">{detail}</span>}
        </span>
        <span
          className={cn('num text-[13px] font-semibold', count ? 'text-ink' : 'text-ink-faint')}
        >
          {error ? 'not available' : (count ?? '–')}
        </span>
      </Link>
    </li>
  )
}
