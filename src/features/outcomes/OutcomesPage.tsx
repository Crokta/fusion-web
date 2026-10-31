import { BarChart3, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { useOutcomes } from '@/api/queries'
import type { OutcomeDay, OutcomePeriod, Outcomes } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  Segmented,
  Skeleton,
  Sparkline,
} from '@/components/ui'
import { cn } from '@/lib/cn'

const PERIODS: { value: OutcomePeriod; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
]

/** A duration in seconds as people say it: "45 s", "12 min", "3 h 20 min", "2 d 4 h". */
export function duration(seconds?: number): string {
  if (seconds === undefined) return '—'
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`
}

/**
 * The outcome dashboard (reporting, outcomes.read; ADR 0017): what left the Centre and how fast,
 * how often a brief had to be corrected, cases closed and lessons drawn, and how fast alerts were
 * acknowledged.
 */
export function OutcomesPage() {
  const { activeRole } = useAuth()
  const [period, setPeriod] = useState<OutcomePeriod>('30d')
  const allowed = can.readOutcomes(activeRole)

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <PageHeader
        eyebrow="Analysis"
        title="Outcomes"
        description="What the Centre released and how fast, how often a brief needed correcting, the cases it closed and the lessons it drew from them, and how quickly alerts were acknowledged. Days are UTC; today is included."
        actions={
          allowed && (
            <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
          )
        }
      />
      {allowed ? (
        <Dashboard period={period} />
      ) : (
        <Panel>
          <EmptyState icon={ShieldAlert} title="Your active role cannot see the outcome dashboard">
            Supervisors, the centre lead and leadership see it.
          </EmptyState>
        </Panel>
      )}
    </div>
  )
}

function Dashboard({ period }: { period: OutcomePeriod }) {
  const outcomes = useOutcomes(period)
  if (outcomes.isPending)
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  if (outcomes.isError)
    return <ErrorNotice error={outcomes.error} onRetry={() => outcomes.refetch()} />
  const o = outcomes.data
  return (
    <div className="space-y-5">
      <section aria-label="Releases" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Briefs released" value={o.briefsReleased} />
        <Tile
          label="Median time to release"
          value={duration(o.medianTimeToRelease)}
          hint="From the review approving the case"
        />
        <Tile
          label="Corrections"
          value={o.corrections}
          hint={
            o.correctionRate === undefined
              ? 'Nothing released in the period'
              : `${Math.round(o.correctionRate * 100)}% of releases`
          }
          tone={o.correctionRate !== undefined && o.correctionRate > 0.1 ? 'amber' : undefined}
        />
        <Tile
          label="Median time to correct"
          value={duration(o.medianTimeToCorrect)}
          hint="From the release it corrects"
        />
      </section>
      <section aria-label="Cases and alerts" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Cases closed" value={o.casesClosed} />
        <Tile label="Lessons recorded" value={o.lessonsRecorded} />
        <Tile
          label="Alerts acknowledged"
          value={`${o.alertsAcknowledged} of ${o.alertsRaised}`}
          hint="Raised in the period"
        />
        <Tile label="Median time to acknowledge" value={duration(o.medianTimeToAcknowledge)} />
      </section>

      <Panel title="Releases and corrections by day" icon={BarChart3}>
        <DailyBars days={o.daily} />
        <Legend />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Alerts raised by day">
          <Sparkline data={o.daily.map((d) => d.alertsRaised)} height={56} />
          <Range o={o} />
        </Panel>
        <Panel title="Recipient feedback">
          <p className="text-[12.5px] text-ink-muted">
            {o.feedbackRecorded === undefined
              ? 'Not recorded yet: recipients cannot leave feedback on briefs until the leadership portal arrives.'
              : `${o.feedbackRecorded} pieces of feedback in the period.`}
          </p>
        </Panel>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'amber'
}) {
  return (
    <div className="surface rounded-lg px-4 py-3">
      <div className="eyebrow">{label}</div>
      <div
        className={cn(
          'num mt-1.5 text-[24px] leading-none font-semibold tracking-[-0.02em]',
          tone === 'amber' ? 'text-amber' : 'text-ink',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-ink-faint">{hint}</div>}
    </div>
  )
}

/** Releases (cyan) with that day's corrections (amber) stacked on top; one bar per UTC day. */
function DailyBars({ days }: { days: OutcomeDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.released + d.corrections))
  const h = 120
  const w = 100 / days.length
  return (
    <svg
      viewBox={`0 0 100 ${h}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: h }}
      role="img"
      aria-label={`Releases and corrections over ${days.length} days`}
    >
      {days.map((d, i) => {
        const released = (d.released / max) * (h - 4)
        const corrected = (d.corrections / max) * (h - 4)
        const x = i * w + w * 0.15
        return (
          <g key={d.date}>
            <title>{`${d.date}: ${d.released} released, ${d.corrections} corrected`}</title>
            <rect
              x={x}
              width={w * 0.7}
              y={h - released}
              height={released}
              fill="var(--color-cyan)"
              opacity={0.75}
            />
            <rect
              x={x}
              width={w * 0.7}
              y={h - released - corrected}
              height={corrected}
              fill="var(--color-amber)"
            />
          </g>
        )
      })}
    </svg>
  )
}

function Legend() {
  return (
    <div className="mt-2 flex gap-4 text-[11px] text-ink-faint">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-cyan/75" aria-hidden /> Released
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-sm bg-amber" aria-hidden /> Corrected
      </span>
    </div>
  )
}

function Range({ o }: { o: Outcomes }) {
  return (
    <div className="mt-2 flex justify-between text-[11px] text-ink-faint">
      <span>{o.from.slice(0, 10)}</span>
      <span>{o.daily.at(-1)?.date}</span>
    </div>
  )
}
