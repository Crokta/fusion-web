import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  BarChart3,
  Check,
  Clock,
  FileText,
  Layers,
  Newspaper,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useState } from 'react'
import {
  useDecideNameCluster,
  useNameClusters,
  useNameMentions,
  useNameReportData,
  useNameSearch,
  useTakeNameReportData,
} from '@/api/queries'
import type { NameBucket, NameCluster, NameReportData, NameSearch } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  SkeletonRows,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, relative } from '@/lib/format'
import { ClusterBadge, Highlighted, KindBadge, StatusBadge, refusalText } from './badges'

export function NameSearchPage({ searchId }: { searchId: string }) {
  const { activeRole } = useAuth()
  const allowed = can.searchNames(activeRole) || can.readPiResults(activeRole)
  const search = useNameSearch(searchId, allowed)
  const [clusterId, setClusterId] = useState<string | undefined>()

  if (!allowed)
    return (
      <Panel className="mx-auto max-w-3xl">
        <EmptyState icon={ShieldAlert} title="Your active role cannot read name searches" />
      </Panel>
    )
  if (search.isPending) return <SkeletonRows rows={6} />
  if (search.isError) return <ErrorNotice error={search.error} onRetry={() => search.refetch()} />

  const s = search.data
  const done = s.status === 'completed'
  return (
    <div className="mx-auto max-w-6xl">
      <Link
        to="/names"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={13} aria-hidden /> Names of interest
      </Link>
      <PageHeader eyebrow="Name search" title={s.name} description={describe(s)}>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <KindBadge kind={s.kind} />
          <StatusBadge status={s.status} />
          {done && (
            <Badge tone="cyan">
              <span className="num">{s.resultCount}</span> mentions
            </Badge>
          )}
        </div>
      </PageHeader>
      {done ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <div className="space-y-4">
            <Clusters searchId={s.id} selected={clusterId} onSelect={setClusterId} />
            <ReportData searchId={s.id} />
          </div>
          <Mentions searchId={s.id} clusterId={clusterId} onClear={() => setClusterId(undefined)} />
        </div>
      ) : (
        <Panel>
          <EmptyState icon={Clock} title={waiting(s)} />
        </Panel>
      )}
    </div>
  )
}

function describe(s: NameSearch) {
  const asked = `Asked for by ${s.requestedBy} ${relative(s.requestedAt)}.`
  if (s.kind === 'public') return asked
  const until = s.approvalExpiresAt
    ? ` Its results are kept until the approval lapses on ${dateTime(s.approvalExpiresAt)}.`
    : ''
  return `${asked} A private individual: only the centre lead reads the results, while the PI policy is on.${until}`
}

function waiting(s: NameSearch) {
  switch (s.status) {
    case 'awaiting_approval':
      return 'Waiting for PI_SEARCH approval: the centre lead, then an evidence officer.'
    case 'refused':
      return 'The PI_SEARCH approval was refused, so this search did not run.'
    case 'expired':
      return 'The approval lapsed, and what this search found has been deleted.'
    default:
      return 'This search is still running.'
  }
}

function Clusters({
  searchId,
  selected,
  onSelect,
}: {
  searchId: string
  selected?: string
  onSelect: (id?: string) => void
}) {
  const clusters = useNameClusters(searchId)
  const decide = useDecideNameCluster(searchId)
  return (
    <Panel title="Clusters" icon={Layers} eyebrow="Who is meant" bodyClassName="p-0">
      {clusters.isPending && <SkeletonRows rows={3} />}
      {clusters.isError && <Refused error={clusters.error} />}
      {clusters.data?.length === 0 && <EmptyState icon={Layers} title="No mentions to group" />}
      {clusters.data && clusters.data.length > 0 && (
        <p className="border-b border-line-soft px-4 py-2.5 text-[11.5px] text-ink-muted">
          Mentions that share a case or the words around the name are grouped. Confirm the ones that
          mean the person you are after: report data then counts only those.
        </p>
      )}
      <ul className="divide-y divide-line-soft">
        {clusters.data?.map((c) => (
          <ClusterRow
            key={c.id}
            cluster={c}
            selected={selected === c.id}
            onSelect={() => onSelect(selected === c.id ? undefined : c.id)}
            busy={decide.isPending && decide.variables?.clusterId === c.id}
            onDecide={(confirmed) => decide.mutate({ clusterId: c.id, confirmed })}
          />
        ))}
      </ul>
      {decide.isError && (
        <p role="alert" className="px-4 py-2 text-xs text-red">
          {refusalText(decide.error)}
        </p>
      )}
    </Panel>
  )
}

function ClusterRow({
  cluster: c,
  selected,
  onSelect,
  busy,
  onDecide,
}: {
  cluster: NameCluster
  selected: boolean
  onSelect: () => void
  busy: boolean
  onDecide: (confirmed: boolean) => void
}) {
  return (
    <li className={cn('px-4 py-3', selected && 'bg-cyan/[0.05]')}>
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <span className="num text-[13px] font-semibold text-ink">{c.mentionCount}</span>
          <span className="text-[12px] text-ink-muted">
            mention{c.mentionCount === 1 ? '' : 's'}
          </span>
          <span className="flex-1" />
          <ClusterBadge status={c.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {c.terms.length === 0 && (
            <span className="text-[11px] text-ink-faint">No shared words</span>
          )}
          {c.terms.map((t) => (
            <span
              key={t}
              className="rounded-full border border-line-strong px-2 py-px text-[11px] text-ink-2"
            >
              {t}
            </span>
          ))}
        </div>
        <div className="mt-1.5 text-[11px] text-ink-faint">
          {relative(c.firstSeen)} – {relative(c.lastSeen)}
          {c.decidedBy && <> · decided by {c.decidedBy}</>}
        </div>
      </button>
      <div className="mt-2 flex gap-1.5">
        <Button
          size="xs"
          variant={c.status === 'confirmed' ? 'success' : 'secondary'}
          icon={Check}
          loading={busy}
          onClick={() => onDecide(true)}
        >
          This person
        </Button>
        <Button
          size="xs"
          variant={c.status === 'rejected' ? 'danger' : 'ghost'}
          icon={X}
          disabled={busy}
          onClick={() => onDecide(false)}
        >
          Not this person
        </Button>
      </div>
    </li>
  )
}

function Mentions({
  searchId,
  clusterId,
  onClear,
}: {
  searchId: string
  clusterId?: string
  onClear: () => void
}) {
  const mentions = useNameMentions(searchId, clusterId)
  return (
    <Panel
      title={clusterId ? 'Mentions in this cluster' : 'All mentions'}
      icon={Newspaper}
      bodyClassName="p-0"
      actions={
        clusterId ? (
          <Button size="xs" variant="ghost" icon={X} onClick={onClear}>
            Show all
          </Button>
        ) : undefined
      }
    >
      {mentions.isPending && <SkeletonRows rows={5} />}
      {mentions.isError && <Refused error={mentions.error} />}
      {mentions.data?.items.length === 0 && (
        <EmptyState icon={Newspaper} title="No mentions you can read">
          Only the record types your role can read are shown.
        </EmptyState>
      )}
      <ul className="divide-y divide-line-soft">
        {mentions.data?.items.map((m) => (
          <li key={m.id} className="px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 text-[13px] font-medium text-ink">{m.title}</span>
              <Badge>{m.documentType}</Badge>
            </div>
            {m.snippet && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                <Highlighted text={m.snippet} />
              </p>
            )}
            <div className="mt-1 text-[11px] text-ink-faint">
              {m.source && <>{m.source} · </>}
              {dateTime(m.at)}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ReportData({ searchId }: { searchId: string }) {
  const report = useNameReportData(searchId)
  const take = useTakeNameReportData(searchId)
  const r = report.data
  return (
    <Panel
      title="Report data"
      icon={BarChart3}
      eyebrow="For briefs and the wall"
      actions={
        !report.isError && (
          <Button
            size="xs"
            variant={r ? 'secondary' : 'primary'}
            icon={FileText}
            loading={take.isPending}
            onClick={() => take.mutate()}
          >
            {r ? 'Take again' : 'Take report data'}
          </Button>
        )
      }
    >
      {report.isPending && <SkeletonRows rows={2} />}
      {report.isError && <Refused error={report.error} />}
      {take.isError && (
        <p role="alert" className="mb-2 text-xs text-red">
          {refusalText(take.error)}
        </p>
      )}
      {report.isSuccess && !r && (
        <p className="text-[12px] text-ink-muted">
          A snapshot of the counts: how often, where and when the name was mentioned. It never
          changes once taken, so a brief cites the numbers it was written from. Reporting reads it
          from search.
        </p>
      )}
      {r && <Snapshot report={r} />}
    </Panel>
  )
}

function Snapshot({ report: r }: { report: NameReportData }) {
  return (
    <div className="space-y-3 text-[12px]">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Mentions" value={r.mentionCount} />
        <Stat label="Clusters" value={r.clusterCount} />
      </div>
      <p className="text-ink-muted">
        {r.basis === 'confirmed_clusters'
          ? 'Counted from the confirmed clusters only.'
          : 'Counted from every mention: no cluster is confirmed.'}
        {r.firstSeen && r.lastSeen && (
          <>
            {' '}
            First seen {dateTime(r.firstSeen)}, last seen {dateTime(r.lastSeen)}.
          </>
        )}
      </p>
      <Buckets title="By day" buckets={r.breakdowns.day ?? []} />
      <Buckets title="By outlet" buckets={r.breakdowns.source ?? []} />
      <Buckets title="By record type" buckets={r.breakdowns.type ?? []} />
      <p className="text-[11px] text-ink-faint">
        Taken by {r.createdBy} {relative(r.createdAt)}
        {r.retentionClass === 'short' && ' · deleted when the approval lapses'}
      </p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-line-soft px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className="num text-[18px] font-semibold text-ink">{value}</div>
    </div>
  )
}

function Buckets({ title, buckets }: { title: string; buckets: NameBucket[] }) {
  if (buckets.length === 0) return null
  const max = Math.max(...buckets.map((b) => b.count))
  return (
    <div>
      <div className="eyebrow mb-1">{title}</div>
      <ul className="space-y-1">
        {buckets.map((b) => (
          <li key={b.key} className="flex items-center gap-2">
            <span className="w-28 shrink-0 truncate text-ink-2" title={b.key}>
              {b.key}
            </span>
            <span className="h-1.5 flex-1 rounded-full bg-tint/[0.05]">
              <span
                className="block h-full rounded-full bg-cyan/70"
                style={{ width: `${(b.count / max) * 100}%` }}
              />
            </span>
            <span className="num w-6 text-right text-ink-muted">{b.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A refusal (PI results for the wrong role, or the PI policy off) read as what it is, not as a failure. */
function Refused({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 px-4 py-3 text-[12px] text-amber">
      <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
      <span>{refusalText(error)}</span>
    </div>
  )
}
