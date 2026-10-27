import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Brain,
  Check,
  ClipboardList,
  Copy,
  FileAudio,
  FileSearch,
  FileText,
  FileVideo,
  Flag,
  GitCommitVertical,
  Globe,
  Image,
  ListChecks,
  MessageSquareQuote,
  MessageSquareText,
  Quote,
  Scale,
  Send,
  Stamp,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { ApiError, describeError } from '@/api'
import { useCase, useSubmitCase } from '@/api/queries'
import type { CaseDetail, Claim, EvidenceItem, Finding, TimelineEntry } from '@/api/types'
import { StateStepper } from '@/components/StateStepper'
import { useToast } from '@/components/Toaster'
import {
  Avatar,
  Badge,
  Button,
  CaseStateBadge,
  EmptyState,
  ErrorNotice,
  MarkingTag,
  Meter,
  Panel,
  PriorityBadge,
  Skeleton,
  type Tone,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { SlaChip } from './CasesPage'

const evidenceIcon: Record<EvidenceItem['kind'], LucideIcon> = {
  image: Image,
  video: FileVideo,
  document: FileText,
  'web-capture': Globe,
  audio: FileAudio,
  statement: MessageSquareQuote,
}

const confidenceTone: Record<Finding['confidence'], Tone> = {
  high: 'green',
  moderate: 'amber',
  low: 'neutral',
}

const claimTone: Record<Claim['outcome'], Tone> = {
  supported: 'green',
  contradicted: 'red',
  inconclusive: 'amber',
  unassessed: 'neutral',
}

const timelineIcon: Record<TimelineEntry['kind'], { icon: LucideIcon; cls: string }> = {
  state: { icon: GitCommitVertical, cls: 'text-cyan bg-cyan/10 ring-cyan/30' },
  evidence: { icon: FileSearch, cls: 'text-teal bg-teal/10 ring-teal/30' },
  finding: { icon: Flag, cls: 'text-green bg-green/10 ring-green/30' },
  indicator: { icon: Brain, cls: 'text-violet bg-violet/10 ring-violet/30' },
  note: { icon: MessageSquareText, cls: 'text-ink-2 bg-white/[0.05] ring-white/10' },
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
  const evidenceById = Object.fromEntries(c.evidence.map((e) => [e.id, e]))

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
              <dd className="num mt-1 text-ink-2">{relative(c.updatedAt, now)}</dd>
            </div>
          </dl>
        </div>
      </header>

      <section className="surface mb-5 rounded-lg px-5 pt-5 pb-4">
        <StateStepper state={c.state} />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Panel title="Summary" icon={FileText}>
            <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">{c.summary}</p>
          </Panel>

          <Panel
            title="Findings"
            icon={Flag}
            actions={<span className="num text-[11.5px] text-ink-faint">{c.findings.length}</span>}
            bodyClassName="p-0"
          >
            {c.findings.length === 0 ? (
              <EmptyState icon={Flag} title="No findings recorded yet" className="py-8">
                Findings are written by analysts and approved by a reviewer who is not the author.
              </EmptyState>
            ) : (
              <ol className="divide-y divide-line-soft">
                {c.findings.map((f, i) => (
                  <li key={f.id} className="flex gap-4 px-4 py-4">
                    <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-white/[0.04] font-mono text-[11px] text-ink-muted ring-1 ring-white/[0.06]">
                      F{i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-relaxed text-ink">{f.statement}</p>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                        <Scale
                          size={12}
                          className="mr-1 inline -translate-y-px text-ink-faint"
                          aria-hidden
                        />
                        {f.basis}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={confidenceTone[f.confidence]}>{f.confidence} confidence</Badge>
                        {f.evidenceIds.map((id) => (
                          <span
                            key={id}
                            className="rounded-[4px] bg-white/[0.035] px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted ring-1 ring-white/[0.06]"
                          >
                            {evidenceById[id]?.ref ?? id}
                          </span>
                        ))}
                        <span className="ml-auto text-[11px] text-ink-faint">
                          {f.authorName} · {relative(f.recordedAt, now)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <EvidencePanel evidence={c.evidence} />

          <Panel
            title="Claims"
            icon={Quote}
            actions={<span className="num text-[11.5px] text-ink-faint">{c.claims.length}</span>}
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-line-soft">
              {c.claims.map((cl) => (
                <li key={cl.id} className="flex items-start gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">“{cl.text}”</p>
                    <p className="mt-0.5 text-[11.5px] text-ink-faint">
                      Attributed to {cl.attributedTo} · {cl.supportingEvidence} supporting evidence
                    </p>
                  </div>
                  <Badge tone={claimTone[cl.outcome]} className="capitalize">
                    {cl.outcome}
                  </Badge>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <ChecklistPanel c={c} />

          <Panel title="Indicators" icon={Brain} eyebrow="Model outputs" bodyClassName="p-0">
            {c.indicators.length === 0 ? (
              <p className="px-4 py-5 text-[12px] text-ink-faint">
                No analysis jobs have reported for this case.
              </p>
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
                    <p className="mt-2 rounded-md bg-white/[0.025] px-2.5 py-1.5 text-[11px] leading-relaxed text-ink-muted">
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

function EvidencePanel({ evidence }: { evidence: EvidenceItem[] }) {
  const toast = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (e: EvidenceItem) => {
    try {
      await navigator.clipboard.writeText(e.sha256)
      setCopied(e.id)
      setTimeout(() => setCopied((c) => (c === e.id ? null : c)), 1600)
    } catch {
      toast({
        title: 'Copy failed',
        detail: 'Clipboard is not available in this browser.',
        tone: 'warning',
      })
    }
  }
  return (
    <Panel
      title="Evidence"
      icon={FileSearch}
      actions={
        <span className="text-[11px] text-ink-faint">Originals sealed · SHA-256 + RFC 3161</span>
      }
      bodyClassName="p-0 overflow-x-auto"
    >
      <table className="w-full min-w-[720px] text-left text-[12px]">
        <thead>
          <tr className="eyebrow border-b border-line-soft text-[9.5px]">
            <th className="py-2 pr-2 pl-4 font-semibold">Ref</th>
            <th className="px-2 py-2 font-semibold">Item</th>
            <th className="px-2 py-2 font-semibold">Captured</th>
            <th className="px-2 py-2 font-semibold">SHA-256</th>
            <th className="px-2 py-2 text-right font-semibold">Custody</th>
            <th className="py-2 pr-4 pl-2 font-semibold">Marking</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {evidence.map((e) => {
            const Icon = evidenceIcon[e.kind]
            return (
              <tr key={e.id} className="transition-colors hover:bg-white/[0.02]">
                <td className="py-2.5 pr-2 pl-4 font-mono text-[11px] whitespace-nowrap text-ink-muted">
                  {e.ref}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="grid size-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-cyan/80 ring-1 ring-white/[0.06]"
                      title={e.kind}
                    >
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{e.title}</span>
                      <span className="block truncate text-[11px] text-ink-faint">{e.source}</span>
                    </span>
                  </div>
                </td>
                <td className="num px-2 py-2.5 whitespace-nowrap text-ink-muted">
                  {dateTime(e.capturedAt)}
                </td>
                <td className="px-2 py-2.5">
                  <button
                    type="button"
                    onClick={() => copy(e)}
                    className="group inline-flex items-center gap-1.5 rounded px-1 font-mono text-[11px] text-ink-muted hover:text-ink"
                    aria-label={`Copy SHA-256 of ${e.ref}`}
                    title={e.sha256}
                  >
                    {e.sha256.slice(0, 8)}…{e.sha256.slice(-6)}
                    {copied === e.id ? (
                      <Check size={12} className="text-green" />
                    ) : (
                      <Copy size={12} className="text-ink-faint group-hover:text-cyan" />
                    )}
                  </button>
                </td>
                <td className="num px-2 py-2.5 text-right text-ink-2">{e.custodyEvents}</td>
                <td className="py-2.5 pr-4 pl-2">
                  <MarkingTag marking={e.marking} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}

function ChecklistPanel({ c }: { c: CaseDetail }) {
  const submit = useSubmitCase(c.id)
  const toast = useToast()
  const done = c.checklist.filter((i) => i.done).length
  const complete = done === c.checklist.length
  const canSubmit = c.state === 'in_assessment' || c.state === 'returned' || c.state === 'open'

  return (
    <Panel
      title="Mission checklist"
      icon={ListChecks}
      actions={
        <span
          className={cn(
            'num text-[11.5px] font-semibold',
            complete ? 'text-green' : 'text-ink-muted',
          )}
        >
          {done}/{c.checklist.length}
        </span>
      }
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            complete ? 'bg-green' : 'bg-cyan',
          )}
          style={{ width: `${(done / Math.max(1, c.checklist.length)) * 100}%` }}
        />
      </div>
      <ul className="space-y-1.5">
        {c.checklist.map((item) => (
          <li key={item.label} className="flex items-start gap-2.5 text-[12.5px]">
            <span
              className={cn(
                'mt-px grid size-4 shrink-0 place-items-center rounded-[4px] ring-1 ring-inset',
                item.done
                  ? 'bg-green/15 text-green ring-green/40'
                  : 'text-transparent ring-line-strong',
              )}
              aria-hidden
            >
              <Check size={11} strokeWidth={3} />
            </span>
            <span className={item.done ? 'text-ink-2' : 'text-ink-muted'}>
              {item.label}
              <span className="sr-only">{item.done ? ' (done)' : ' (outstanding)'}</span>
            </span>
          </li>
        ))}
      </ul>
      {canSubmit ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <Button
            variant={complete ? 'primary' : 'secondary'}
            size="md"
            icon={Send}
            className="w-full"
            loading={submit.isPending}
            onClick={() =>
              submit.mutate(c.etag, {
                onSuccess: () =>
                  toast({
                    title: `${c.ref} submitted for review`,
                    detail: 'A CASE_REVIEW approval was created.',
                    tone: 'success',
                  }),
                onError: (e) =>
                  toast({ title: 'Not submitted', detail: describeError(e), tone: 'error' }),
              })
            }
          >
            Submit for review
          </Button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Submit requires a complete checklist and statements. The reviewer must not be the
            author.
          </p>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3 text-[11.5px] text-ink-faint">
          <ClipboardList size={13} />{' '}
          {c.state === 'submitted' ? 'Awaiting review.' : 'No submission available in this state.'}
        </p>
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
