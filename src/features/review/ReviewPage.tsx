import { Link } from '@tanstack/react-router'
import { ArrowUpRight, ClipboardCheck, FileStack, Flag, Inbox } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { useDecideReview, useReviews } from '@/api/queries'
import { useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Avatar,
  Badge,
  EmptyState,
  ErrorNotice,
  MarkingTag,
  PageHeader,
  Panel,
  PriorityBadge,
  SkeletonRows,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { countdown, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useShell } from '@/features/shell/ShellContext'
import { ReviewDecisionPanel } from './ReviewDecision'

export function ReviewPage() {
  const reviews = useReviews()
  const decide = useDecideReview()
  const { user, activeRole } = useAuth()
  const { select } = useShell()
  const toast = useToast()
  const now = useNow()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const items = reviews.data?.items ?? []
  const selected = items.find((r) => r.caseId === selectedId) ?? items[0]

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Operations · Release gate"
        title="Review"
        description="Submitted cases waiting for a decision. Approved findings move towards release; returned cases go back to the analyst with your comment."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Panel
          title="Queue"
          icon={Inbox}
          actions={<span className="num text-[11.5px] text-ink-faint">{items.length} waiting</span>}
          bodyClassName="p-0"
        >
          {reviews.isPending ? (
            <SkeletonRows rows={4} />
          ) : reviews.isError ? (
            <ErrorNotice error={reviews.error} onRetry={() => reviews.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="Review queue is clear">
              New submissions appear here as analysts submit cases.
            </EmptyState>
          ) : (
            <ul
              className="divide-y divide-line-soft"
              role="listbox"
              aria-label="Cases awaiting review"
            >
              {items.map((r) => {
                const due = countdown(r.dueAt, now)
                const active = selected?.caseId === r.caseId
                return (
                  <li key={r.caseId} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(r.caseId)
                        select({
                          kind: 'case',
                          title: r.title,
                          caseRef: r.caseRef,
                          priority: r.priority,
                          state: 'Submitted',
                          raisedAt: r.submittedAt,
                        })
                      }}
                      className={cn(
                        'relative flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors focus-visible:-outline-offset-2',
                        active ? 'bg-cyan/[0.06]' : 'hover:bg-tint/[0.025]',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-cyan"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] font-semibold text-cyan">
                            {r.caseRef}
                          </span>
                          <PriorityBadge priority={r.priority} />
                          {r.authorId === user?.id && <Badge tone="amber">Your case</Badge>}
                          {r.revision > 1 && <Badge tone="neutral">rev {r.revision}</Badge>}
                        </div>
                        <p className="mt-1 truncate text-[13px] font-medium text-ink">{r.title}</p>
                        <p className="mt-0.5 text-[11.5px] text-ink-faint">
                          {r.authorName} · submitted {relative(r.submittedAt, now)}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        <div
                          className={cn(
                            'num text-[12px] font-semibold',
                            due.overdue ? 'text-red' : due.soon ? 'text-amber' : 'text-ink-2',
                          )}
                        >
                          {due.label}
                        </div>
                        <div className="text-[10.5px] text-ink-faint">to SLA</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {selected && user && (
          <Panel
            key={selected.caseId}
            className="animate-rise-in self-start"
            eyebrow="Decision"
            title={`${selected.caseRef} · ${selected.title}`}
          >
            <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-ink-muted">
              <span className="flex items-center gap-2">
                <Avatar name={selected.authorName} size={20} /> {selected.authorName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Flag size={12} /> {selected.findingCount} findings
              </span>
              <span className="inline-flex items-center gap-1.5">
                <FileStack size={12} /> {selected.evidenceCount} evidence
              </span>
              <MarkingTag marking={selected.marking} />
            </div>
            <Link
              to="/cases/$caseId"
              params={{ caseId: selected.caseId }}
              className="mb-5 flex items-center justify-between rounded-lg border border-line bg-canvas/50 px-3.5 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:border-cyan/40 hover:text-ink"
            >
              Read findings, evidence and indicators{' '}
              <ArrowUpRight size={14} className="text-cyan" />
            </Link>
            <ReviewDecisionPanel
              key={selected.caseId}
              item={selected}
              currentUserId={user.id}
              activeRole={activeRole}
              pending={decide.isPending}
              onDecide={(decision, comment) =>
                decide.mutate(
                  { caseId: selected.caseId, decision, comment },
                  {
                    onSuccess: () =>
                      toast({
                        title:
                          decision === 'approve'
                            ? `${selected.caseRef} approved`
                            : `${selected.caseRef} returned`,
                        detail:
                          decision === 'approve'
                            ? 'Findings are cleared for release.'
                            : 'The analyst has been notified.',
                        tone: 'success',
                      }),
                    onError: (e) =>
                      toast({ title: 'Decision refused', detail: describeError(e), tone: 'error' }),
                  },
                )
              }
            />
          </Panel>
        )}
      </div>
    </div>
  )
}
