import {
  CircleDollarSign,
  Globe2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  ShieldAlert,
  Unplug,
} from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { useProvider, useProviderAction, useSources } from '@/api/queries'
import {
  ROLE_LABEL,
  type ProviderReport,
  type ProviderSourceUsage,
  type ProviderTerms,
  type SourceRecord,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Overlay'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  Meter,
  PageHeader,
  Panel,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { since } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { PLATFORM_LABEL, socialTarget } from '@/features/sources/social'

/** intake crawls a social source at most hourly (ADR 0007); a source's own interval can only slow it. */
const BASE_INTERVAL_MINUTES = 60
const fmt = new Intl.NumberFormat('en-GB')

/** The most credits a source can spend in 30 days at its terms. */
export function monthlyCeiling(maxPosts: number, intervalMinutes: number | null, paused: boolean) {
  if (paused) return 0
  const every = Math.max(intervalMinutes ?? BASE_INTERVAL_MINUTES, BASE_INTERVAL_MINUTES)
  return Math.round(maxPosts * ((30 * 24 * 60) / every))
}

interface Row {
  source: SourceRecord
  usage: ProviderSourceUsage | undefined
  terms: ProviderTerms | undefined
}

export function ProviderPage() {
  const { activeRole } = useAuth()
  const report = useProvider()
  const sources = useSources()

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Intelligence · Collection"
        title="Bright Data"
        description="What the Centre spends on Bright Data: social sources through the Web Scraper API, and sites that block the collector through the Web Unlocker. One credit is one post or one Unlocker request."
      />
      {!can.readSources(activeRole) ? (
        <Panel>
          <EmptyState icon={ShieldAlert} title="Collection spend isn't open to your role">
            Acting as {ROLE_LABEL[activeRole]}. Analysts, supervisors, centre leads and admins can
            read it.
          </EmptyState>
        </Panel>
      ) : report.isPending || sources.isPending ? (
        <Panel>
          <SkeletonRows rows={6} />
        </Panel>
      ) : report.isError ? (
        <Panel>
          <ErrorNotice error={report.error} onRetry={() => report.refetch()} />
        </Panel>
      ) : (
        <ProviderBody report={report.data} sources={sources.data?.items ?? []} />
      )}
    </div>
  )
}

function ProviderBody({ report, sources }: { report: ProviderReport; sources: SourceRecord[] }) {
  const { activeRole } = useAuth()
  const mayManage = can.approveSource(activeRole)
  const usage = new Map(report.sources.map((s) => [s.sourceId, s]))
  const rows: Row[] = sources
    .filter((s) => s.kind === 'social')
    .map((source) => ({ source, usage: usage.get(source.id), terms: usage.get(source.id)?.terms }))
  const ceiling = rows
    .filter((r) => r.source.status === 'approved')
    .reduce(
      (sum, r) =>
        sum +
        monthlyCeiling(
          r.terms?.maxPosts ?? report.defaults.maxPosts,
          r.terms?.minIntervalMinutes ?? null,
          r.terms?.paused ?? false,
        ),
      0,
    )

  return (
    <div className="flex flex-col gap-5">
      {!report.configured && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-amber/35 bg-amber/[0.07] px-4 py-3"
        >
          <Unplug size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            <span className="font-medium text-amber">Bright Data isn’t set up.</span> The collector
            has no API key, so social sources fail with{' '}
            <code className="font-mono text-[11px] text-ink-2">social_not_configured</code>. Put{' '}
            <code className="font-mono text-[11px] text-ink-2">BRIGHT_DATA_API_KEY</code> in the
            workspace .env and restart the collector.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <UsagePanel report={report} />
        <BudgetPanel report={report} ceiling={ceiling} mayManage={mayManage} />
      </div>
      <SourcesPanel rows={rows} report={report} mayManage={mayManage} />
      <HostsPanel report={report} mayManage={mayManage} />
    </div>
  )
}

function UsagePanel({ report }: { report: ProviderReport }) {
  const peak = Math.max(1, ...report.days.map((d) => d.scraper + d.unlocker))
  const b = report.budget
  return (
    <Panel title="Credits, last 30 days" icon={CircleDollarSign}>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="This month" value={b.usedThisMonth} />
        <Stat label="Social posts" value={b.scraperThisMonth} tone="text-cyan" />
        <Stat label="Unlocker requests" value={b.unlockerThisMonth} tone="text-amber" />
      </div>
      <div
        className="flex h-32 items-end gap-[3px]"
        role="img"
        aria-label={`Credits per day for 30 days; peak ${peak}`}
      >
        {report.days.map((d) => (
          <div
            key={d.date}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${d.date}: ${d.scraper} social, ${d.unlocker} Unlocker`}
          >
            <div
              className="rounded-t-[2px] bg-amber/80"
              style={{ height: `${(d.unlocker / peak) * 100}%` }}
            />
            <div
              className={cn('bg-cyan/80', d.unlocker === 0 && 'rounded-t-[2px]')}
              style={{ height: `${(d.scraper / peak) * 100}%` }}
            />
            {d.scraper + d.unlocker === 0 && <div className="h-px bg-line-strong" />}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
        <span>{report.days[0]?.date}</span>
        <span className="flex gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-cyan/80" aria-hidden /> Social posts
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-amber/80" aria-hidden /> Unlocker
          </span>
        </span>
        <span>today</span>
      </div>
    </Panel>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className="text-[11.5px] text-ink-faint">{label}</p>
      <p className={cn('mt-0.5 font-mono text-[20px] font-semibold text-ink', tone)}>
        {fmt.format(value)}
      </p>
    </div>
  )
}

function BudgetPanel({
  report,
  ceiling,
  mayManage,
}: {
  report: ProviderReport
  ceiling: number
  mayManage: boolean
}) {
  const b = report.budget
  const act = useProviderAction()
  const toast = useToast()
  const [cap, setCap] = useState(b.monthlyCreditCap?.toString() ?? '')
  const parsed = cap.trim() === '' ? null : Number(cap)
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 0)
  const share = b.monthlyCreditCap ? b.usedThisMonth / b.monthlyCreditCap : 0
  const save = () =>
    act.mutate(
      { kind: 'budget', monthlyCreditCap: parsed },
      {
        onSuccess: () =>
          toast({
            title: parsed === null ? 'Cap removed' : 'Monthly cap saved',
            detail: parsed === null ? 'Nothing stops spending.' : `${fmt.format(parsed)} credits`,
            tone: 'success',
          }),
        onError: (e) => toast({ title: 'Refused', detail: describeError(e), tone: 'error' }),
      },
    )

  return (
    <Panel title="Monthly budget" icon={CircleDollarSign}>
      {b.monthlyCreditCap === null ? (
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          <span className="font-medium text-amber">No cap.</span> Crawls spend until the account
          runs out. A cap stops social jobs and Unlocker requests for the rest of the month.
        </p>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline justify-between text-[12.5px]">
            <span className="text-ink-2">
              {fmt.format(b.usedThisMonth)} of {fmt.format(b.monthlyCreditCap)} credits
            </span>
            <span className="text-ink-faint">{fmt.format(b.left ?? 0)} left</span>
          </div>
          <Meter value={share} tone={share >= 1 ? 'red' : share >= 0.8 ? 'amber' : 'green'} />
          {share >= 1 && (
            <p className="mt-2 text-[12px] text-red" role="alert">
              The cap is spent: social sources and the Unlocker are stopped until the 1st.
            </p>
          )}
        </>
      )}
      <dl className="mt-4 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12.5px]">
        <dt className="text-ink-faint">Most at these terms</dt>
        <dd className="text-ink-2">
          {fmt.format(ceiling)} credits a month
          <span className="block text-[11.5px] text-ink-faint">
            Every approved social source, at its post limit, every round
          </span>
        </dd>
        <dt className="text-ink-faint">Unlocker</dt>
        <dd className="text-ink-2">
          {report.unlockerZone ? (
            <>
              On · zone <code className="font-mono text-[11.5px]">{report.unlockerZone}</code>
            </>
          ) : (
            'Off — no zone set (BRIGHTDATA_UNLOCKER_ZONE)'
          )}
        </dd>
        {b.updatedBy && b.updatedAt && (
          <>
            <dt className="text-ink-faint">Cap last set</dt>
            <dd className="text-ink-2">{new Date(b.updatedAt).toLocaleString('en-GB')}</dd>
          </>
        )}
      </dl>
      {mayManage && (
        <div className="mt-4 flex items-end gap-2">
          <Field label="Monthly cap (credits)" hint="Empty for no cap">
            <input
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 5000"
              className={cn(inputClass, 'font-mono', !valid && 'border-red/60')}
            />
          </Field>
          <Button size="md" disabled={!valid} loading={act.isPending} onClick={save}>
            Save
          </Button>
        </div>
      )}
    </Panel>
  )
}

function SourcesPanel({
  rows,
  report,
  mayManage,
}: {
  rows: Row[]
  report: ProviderReport
  mayManage: boolean
}) {
  const now = useNow()
  const [editing, setEditing] = useState<Row | null>(null)
  return (
    <Panel title="Social sources" icon={Globe2} bodyClassName="p-0">
      {rows.length === 0 ? (
        <EmptyState icon={Globe2} title="No social sources">
          Propose one on the Sources screen: a profile, page, community or platform search.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-ink-faint">
              <tr className="border-b border-line-soft">
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 text-right font-medium">Credits this month</th>
                <th className="px-3 py-2.5 font-medium">Last job</th>
                <th className="px-3 py-2.5 font-medium">Terms</th>
                <th className="px-3 py-2.5 text-right font-medium">Most a month</th>
                {mayManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((r) => {
                const t = socialTarget(r.source.url)
                const maxPosts = r.terms?.maxPosts ?? report.defaults.maxPosts
                const paused = r.terms?.paused ?? false
                return (
                  <tr key={r.source.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{r.source.name}</p>
                      <p className="text-[11.5px] text-ink-faint">
                        {t.platform ? PLATFORM_LABEL[t.platform] : r.source.host}
                        {t.ok ? ` · ${t.target}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      {paused ? (
                        <Badge tone="amber" dot>
                          Paused
                        </Badge>
                      ) : r.source.status === 'approved' ? (
                        <Badge tone="green" dot>
                          Collecting
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          {r.source.status === 'proposed' ? 'Awaiting approval' : 'Suspended'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-ink-2">
                      {fmt.format(r.usage?.creditsThisMonth ?? 0)}
                      <span className="block text-[11px] text-ink-faint">
                        {r.usage?.jobsThisMonth ?? 0} job(s)
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-2">
                      {r.usage?.lastJobAt ? since(r.usage.lastJobAt, now) : '—'}
                      {r.usage?.pendingSnapshot && (
                        <span className="block text-[11px] text-cyan">a job is running</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-2">
                      {maxPosts} posts · {intervalLabel(r.terms?.minIntervalMinutes ?? null)}
                      {r.terms?.maxPosts == null && r.terms?.minIntervalMinutes == null && (
                        <span className="block text-[11px] text-ink-faint">defaults</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-ink-2">
                      {r.source.status === 'approved'
                        ? fmt.format(
                            monthlyCeiling(maxPosts, r.terms?.minIntervalMinutes ?? null, paused),
                          )
                        : '—'}
                    </td>
                    {mayManage && (
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" icon={Pencil} onClick={() => setEditing(r)}>
                          Terms
                        </Button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TermsModal row={editing} report={report} onClose={() => setEditing(null)} />}
    </Panel>
  )
}

export function intervalLabel(minutes: number | null) {
  const m = Math.max(minutes ?? BASE_INTERVAL_MINUTES, BASE_INTERVAL_MINUTES)
  if (m === 60) return 'hourly'
  if (m % 1440 === 0) return m === 1440 ? 'daily' : `every ${m / 1440} days`
  if (m % 60 === 0) return `every ${m / 60} hours`
  return `every ${m} minutes`
}

const INTERVALS: { value: string; label: string }[] = [
  { value: '', label: 'Hourly (default)' },
  { value: '120', label: 'Every 2 hours' },
  { value: '360', label: 'Every 6 hours' },
  { value: '720', label: 'Every 12 hours' },
  { value: '1440', label: 'Daily' },
]

function TermsModal({
  row,
  report,
  onClose,
}: {
  row: Row
  report: ProviderReport
  onClose: () => void
}) {
  const act = useProviderAction()
  const toast = useToast()
  const [maxPosts, setMaxPosts] = useState(row.terms?.maxPosts?.toString() ?? '')
  const [interval, setEvery] = useState(row.terms?.minIntervalMinutes?.toString() ?? '')
  const [paused, setPaused] = useState(row.terms?.paused ?? false)
  const posts = maxPosts.trim() === '' ? null : Number(maxPosts)
  const validPosts = posts === null || (Number.isInteger(posts) && posts >= 1 && posts <= 100)
  const every = interval === '' ? null : Number(interval)
  const ceiling = monthlyCeiling(posts ?? report.defaults.maxPosts, every, paused)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Bright Data terms · ${row.source.name}`}
      description="How much this source may spend. Changes apply from its next round and are audited."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!validPosts) return
          act.mutate(
            {
              kind: 'terms',
              sourceId: row.source.id,
              input: { maxPosts: posts, minIntervalMinutes: every, paused },
            },
            {
              onSuccess: () => {
                toast({ title: 'Terms saved', detail: row.source.name, tone: 'success' })
                onClose()
              },
              onError: (err) =>
                toast({ title: 'Refused', detail: describeError(err), tone: 'error' }),
            },
          )
        }}
      >
        <Field
          label="Posts per round"
          hint={`1 to 100; empty for the default (${report.defaults.maxPosts})`}
        >
          <input
            value={maxPosts}
            onChange={(e) => setMaxPosts(e.target.value)}
            inputMode="numeric"
            placeholder={String(report.defaults.maxPosts)}
            className={cn(inputClass, 'font-mono', !validPosts && 'border-red/60')}
          />
        </Field>
        <Field
          label="How often"
          hint="A source can be collected less often than hourly, never more"
        >
          <select
            value={interval}
            onChange={(e) => setEvery(e.target.value)}
            className={cn(inputClass, 'appearance-none')}
          >
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2.5 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          Paused: no Bright Data jobs, but the source stays approved
        </label>
        <p className="text-[12px] text-ink-muted">
          At these terms this source spends at most{' '}
          <span className="font-mono text-ink-2">{fmt.format(ceiling)}</span> credits a month.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} disabled={act.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            icon={paused ? Pause : Play}
            loading={act.isPending}
            disabled={!validPosts}
          >
            Save terms
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function HostsPanel({ report, mayManage }: { report: ProviderReport; mayManage: boolean }) {
  const act = useProviderAction()
  const toast = useToast()
  return (
    <Panel title="Sites through the Unlocker" icon={Unplug} bodyClassName="p-0">
      {report.hosts.length === 0 ? (
        <EmptyState icon={Unplug} title="No site has needed the Unlocker">
          {report.unlockerZone
            ? 'When a site refuses the collector, its crawls go through the Unlocker and it shows here.'
            : 'The Unlocker is off. With a zone set, sites that refuse the collector fall back to it.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft">
          {report.hosts.map((h) => (
            <li key={h.host} className="flex items-center gap-4 px-4 py-3 text-[12.5px]">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-ink">{h.host}</p>
                <p className="text-[11.5px] text-ink-faint">
                  {fmt.format(h.creditsThisMonth)} credit(s) this month ·{' '}
                  {h.unlockedForSeconds
                    ? `through the Unlocker for ${hoursLeft(h.unlockedForSeconds)} more, without a direct try`
                    : 'tried directly first'}
                </p>
              </div>
              {mayManage && h.unlockedForSeconds ? (
                <Button
                  variant="ghost"
                  icon={RotateCcw}
                  loading={act.isPending}
                  onClick={() =>
                    act.mutate(
                      { kind: 'clear-host', host: h.host },
                      {
                        onSuccess: () =>
                          toast({
                            title: 'Tried directly next time',
                            detail: `${h.host} falls back again if it still refuses.`,
                            tone: 'success',
                          }),
                        onError: (e) =>
                          toast({ title: 'Refused', detail: describeError(e), tone: 'error' }),
                      },
                    )
                  }
                >
                  Try direct again
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function hoursLeft(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}
