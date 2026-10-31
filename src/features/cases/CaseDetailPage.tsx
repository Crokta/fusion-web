import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Brain,
  FileSearch,
  Flag,
  GitCommitVertical,
  MessageSquareText,
  Stamp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { ApiError } from '@/api'
import { useCase, useCaseMedia } from '@/api/queries'
import type { CaseDetail, EvidenceItem, TimelineEntry } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { StateStepper } from '@/components/StateStepper'
import {
  Avatar,
  CaseStateBadge,
  EmptyState,
  ErrorNotice,
  MarkingTag,
  Meter,
  Panel,
  PriorityBadge,
  Skeleton,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, relative, since } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { SlaChip } from './CasesPage'
import {
  AssessmentNotice,
  ClaimsPanel,
  FindingsPanel,
  StatementsPanel,
  SummaryPanel,
} from './Assessment'
import { shortId } from '@/api/adapters'
import { AddEvidence } from './AddEvidence'
import { EvidenceList } from './EvidenceList'
import { MatrixPanel } from './MatrixPanel'
import { ScreeningBadge } from './MediaViewer'
import { CaseBriefsPanel } from '@/features/briefs/CaseBriefsPanel'
import { ChecklistPanel } from './ChecklistPanel'
import { CaseLessonsPanel } from '@/features/lessons/LessonsPanel'
import { LocationsPanel } from '@/features/geo/LocationsPanel'

const timelineIcon: Record<TimelineEntry['kind'], { icon: LucideIcon; cls: string }> = {
  state: { icon: GitCommitVertical, cls: 'text-cyan bg-cyan/10 ring-cyan/30' },
  evidence: { icon: FileSearch, cls: 'text-teal bg-teal/10 ring-teal/30' },
  finding: { icon: Flag, cls: 'text-green bg-green/10 ring-green/30' },
  indicator: { icon: Brain, cls: 'text-violet bg-violet/10 ring-violet/30' },
  note: { icon: MessageSquareText, cls: 'text-ink-2 bg-tint/[0.05] ring-tint/10' },
  assignment: { icon: UserPlus, cls: 'text-amber bg-amber/10 ring-amber/30' },
  review: { icon: Stamp, cls: 'text-amber bg-amber/10 ring-amber/30' },
}

export function CaseDetailPage({ caseId }: { caseId: string }) {
  const query = useCase(caseId)

  if (query.isPending) return <CaseSkeleton />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.code === 'not_found')
      return (
        <EmptyState
          icon={FileSearch}
          title={`Case ${caseId.toUpperCase()} not found`}
          className="py-28"
        >
          It may not exist, or your active role may not be permitted to see it.{' '}
          <Link to="/cases" className="text-cyan hover:underline">
            Back to cases
          </Link>
        </EmptyState>
      )
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <ErrorNotice error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  }
  return <CaseView c={query.data} />
}

function CaseView({ c }: { c: CaseDetail }) {
  const now = useNow()

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <Link
        to="/cases"
        className="mb-3 inline-flex items-center gap-1.5 rounded text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> All cases
      </Link>

      <header className="mb-5 animate-rise-in">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[13px] font-semibold text-cyan">{c.ref}</span>
          <CaseStateBadge state={c.state} />
          <PriorityBadge priority={c.priority} />
          <MarkingTag marking={c.marking} />
          <span className="text-[11.5px] text-ink-faint">
            {c.category} · {c.place}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <h1 className="min-w-0 flex-1 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">
            {c.title}
          </h1>
          <dl className="flex items-center gap-6 text-[12px]">
            <div>
              <dt className="eyebrow text-[9.5px]">Owner</dt>
              <dd className="mt-1 flex items-center gap-2 text-ink-2">
                <Avatar name={c.owner.name} size={22} /> {c.owner.name}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-[9.5px]">Deadline</dt>
              <dd className="mt-1">
                <SlaChip
                  deadline={c.deadline}
                  now={now}
                  closed={['closed', 'released'].includes(c.state)}
                />
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-[9.5px]">Updated</dt>
              <dd className="num mt-1 text-ink-2">{since(c.updatedAt, now)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="surface mb-5 rounded-lg px-5 pt-5 pb-4">
        <StateStepper state={c.state} />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <AssessmentNotice c={c} />
          <SummaryPanel c={c} />
          <LocationsPanel subjectType="case" subjectId={c.id} />
          <FindingsPanel c={c} />
          <StatementsPanel c={c} />
          <EvidencePanel caseId={c.id} state={c.state} evidence={c.evidence} />
          <ClaimsPanel c={c} />
          <MatrixPanel caseId={c.id} evidence={c.evidence} />
        </div>

        <div className="min-w-0 space-y-5">
          <CaseBriefsPanel c={c} />
          <ChecklistPanel c={c} />
          <CaseLessonsPanel c={c} />

          <Panel title="Indicators" icon={Brain} eyebrow="Model outputs" bodyClassName="p-0">
            <MediaScreeningSummary caseId={c.id} />
            {c.indicators.length === 0 ? (
              <MediaScreeningEmpty caseId={c.id} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {c.indicators.map((ind) => (
                  <li key={ind.id} className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-medium text-ink">{ind.kind}</span>
                      <span className="ml-auto text-[9.5px] font-semibold tracking-[0.1em] text-violet uppercase">
                        Indicator · advisory
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-ink-faint">
                      {ind.model} {ind.modelVersion} · {relative(ind.producedAt, now)}
                    </div>
                    <p className="mt-2 text-[12.5px] text-ink-2">{ind.result}</p>
                    <div className="mt-2 flex items-center gap-2.5">
                      <Meter
                        value={ind.confidence}
                        tone={ind.confidence >= 0.8 ? 'amber' : 'cyan'}
                        className="flex-1"
                      />
                      <span className="num w-9 text-right text-[11.5px] font-semibold text-ink-2">
                        {ind.confidence.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-2 rounded-md bg-tint/[0.025] px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-muted">
                      <span className="font-semibold text-ink-faint">Limitations · </span>
                      {ind.limitations}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Timeline" icon={GitCommitVertical}>
            <ol className="relative">
              {c.timeline.map((t, i) => {
                const meta = timelineIcon[t.kind]
                return (
                  <li key={t.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < c.timeline.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute top-7 bottom-0 left-[13px] w-px bg-line-strong"
                      />
                    )}
                    <span
                      className={cn(
                        'relative z-10 grid size-[27px] shrink-0 place-items-center rounded-full ring-1 ring-inset',
                        meta.cls,
                      )}
                    >
                      <meta.icon size={13} />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="text-[12.5px] leading-snug text-ink-2">{t.text}</p>
                      <p className="num mt-0.5 text-[11px] text-ink-faint">
                        {t.actor} · {dateTime(t.at)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  )
}

/** Media screening of the case's images and video, in one line each: the detail is in the viewer. */
function MediaScreeningSummary({ caseId }: { caseId: string }) {
  const media = useCaseMedia(caseId)
  const rows = media.data ?? []
  if (rows.length === 0) return null
  return (
    <ul className="divide-y divide-line-soft border-b border-line-soft">
      {rows.map((m) => (
        <li key={m.jobId} className="flex items-center gap-2 px-4 py-3 text-[12.5px]">
          <span className="font-medium text-ink">Media screening</span>
          <span className="font-mono text-[10.5px] text-ink-faint">EV-{shortId(m.evidenceId)}</span>
          <span className="ml-auto">
            <ScreeningBadge screening={m} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function MediaScreeningEmpty({ caseId }: { caseId: string }) {
  const media = useCaseMedia(caseId)
  if ((media.data ?? []).length > 0) return null
  return (
    <p className="px-4 py-5 text-[12px] text-ink-faint">
      No analysis jobs have reported for this case.
    </p>
  )
}

function EvidencePanel({
  caseId,
  state,
  evidence,
}: {
  caseId: string
  state: CaseDetail['state']
  evidence: EvidenceItem[]
}) {
  const media = useCaseMedia(caseId)
  const { activeRole } = useAuth()
  // evidence.upload in permissions.yaml; a closed case takes no new evidence.
  const mayAdd = can.addEvidence(activeRole) && state !== 'closed'
  return (
    <Panel
      title="Evidence"
      icon={FileSearch}
      actions={
        <span className="flex items-center gap-3">
          <span className="hidden text-[11px] text-ink-faint sm:inline">
            Originals sealed · SHA-256 + RFC 3161
          </span>
          {mayAdd && <AddEvidence caseId={caseId} />}
        </span>
      }
      bodyClassName="p-0"
    >
      {evidence.length === 0 ? (
        <EmptyState icon={FileSearch} title="No evidence attached yet" />
      ) : (
        <EvidenceList evidence={evidence} screenings={media.data} />
      )}
    </Panel>
  )
}

function CaseSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1440px] space-y-5 px-6 py-6"
      aria-busy="true"
      aria-label="Loading case"
    >
      <Skeleton className="h-3 w-20" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-7 w-2/3" />
      </div>
      <Skeleton className="h-20 w-full rounded-lg" />
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    </div>
  )
}
