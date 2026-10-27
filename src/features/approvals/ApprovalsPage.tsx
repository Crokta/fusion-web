import { Check, Clock3, Hourglass, Stamp, X } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { useApprovals, useDecideApproval } from '@/api/queries'
import {
  ROLE_LABEL,
  type Approval,
  type ApprovalStep,
  type ApprovalType,
  type Role,
} from '@/api/types'
import { useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Overlay'
import { useToast } from '@/components/Toaster'
import {
  Avatar,
  Badge,
  Button,
  CaseLink,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Segmented,
  SkeletonRows,
  inputClass,
  type Tone,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { countdown, dateTime, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'

const GATES: Record<ApprovalType, { tone: Tone; rule: string }> = {
  CASE_REVIEW: { tone: 'cyan', rule: 'One approver, who is not the author.' },
  PI_SEARCH: { tone: 'violet', rule: 'Centre lead, then Evidence officer. Valid ≤ 14 days.' },
  CCTV_SEARCH: {
    tone: 'amber',
    rule: 'Centre lead and Evidence officer, two different people. ≤ 24 h window.',
  },
  CORRECTION: {
    tone: 'green',
    rule: 'Reviewer approves a new version; the original list is notified.',
  },
  RETENTION_EXTENSION: {
    tone: 'neutral',
    rule: 'Centre lead extends the retention class of held evidence.',
  },
}

const stepRoleLabel = (r: ApprovalStep['role']) =>
  r === 'evidence_officer' ? 'Evidence officer' : ROLE_LABEL[r]

const statusTone: Record<Approval['status'], Tone> = {
  pending: 'amber',
  approved: 'green',
  refused: 'red',
  expired: 'neutral',
}

type Filter = Approval['status'] | 'all'

/** Whether the active user may decide the current step, and if not, why. */
export function decisionBlock(a: Approval, userId: string, role: Role): string | null {
  if (a.status !== 'pending') return 'Already decided'
  if (a.requesterId === userId) return 'You requested this — requester cannot approve'
  const step = a.steps.find((s) => !s.decision)
  if (!step) return 'No pending step'
  const ok = step.role === role || (step.role === 'reviewer' && role === 'supervisor')
  if (!ok) return `Needs ${stepRoleLabel(step.role)}`
  return null
}

export function ApprovalsPage() {
  const approvals = useApprovals()
  const decide = useDecideApproval()
  const { user, activeRole } = useAuth()
  const toast = useToast()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('pending')
  const [deciding, setDeciding] = useState<{
    approval: Approval
    decision: 'approve' | 'refuse'
  } | null>(null)
  const [comment, setComment] = useState('')

  const all = approvals.data?.items ?? []
  const count = (s: Filter) => (s === 'all' ? all.length : all.filter((a) => a.status === s).length)
  const items = filter === 'all' ? all : all.filter((a) => a.status === filter)

  const submit = () => {
    if (!deciding) return
    const { approval, decision } = deciding
    decide.mutate(
      { id: approval.id, decision, comment: comment.trim() },
      {
        onSuccess: () => {
          toast({
            title: decision === 'approve' ? 'Step approved' : 'Request refused',
            detail: approval.subject,
            tone: 'success',
          })
          setDeciding(null)
          setComment('')
        },
        onError: (e) =>
          toast({
            title: 'Decision refused by governance',
            detail: describeError(e),
            tone: 'error',
          }),
      },
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Governance · Gates"
        title="Approvals"
        description="Every gate decision is signed and written to the hash-chained audit store. Requester ≠ approver, and approver 1 ≠ approver 2, are database constraints."
      />

      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {(Object.keys(GATES) as ApprovalType[]).map((t) => (
          <div key={t} className="surface rounded-lg px-3.5 py-3">
            <Badge tone={GATES[t].tone} className="font-mono">
              {t}
            </Badge>
            <p className="mt-2 text-[11.5px] leading-snug text-ink-muted">{GATES[t].rule}</p>
          </div>
        ))}
      </div>

      <div className="mb-3">
        <Segmented
          label="Filter approvals"
          value={filter}
          onChange={setFilter}
          options={(['pending', 'approved', 'refused', 'expired', 'all'] as Filter[]).map((s) => ({
            value: s,
            label: s[0]!.toUpperCase() + s.slice(1),
            count: count(s),
          }))}
        />
      </div>

      {approvals.isPending ? (
        <div className="surface rounded-lg">
          <SkeletonRows rows={4} />
        </div>
      ) : approvals.isError ? (
        <ErrorNotice error={approvals.error} onRetry={() => approvals.refetch()} />
      ) : items.length === 0 ? (
        <div className="surface rounded-lg">
          <EmptyState icon={Stamp} title={`No ${filter === 'all' ? '' : filter} approvals`} />
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((a, i) => {
            const block = user ? decisionBlock(a, user.id, activeRole) : 'Not signed in'
            const exp = a.expiresAt ? countdown(a.expiresAt, now) : null
            return (
              <li
                key={a.id}
                className="surface animate-rise-in rounded-lg"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex flex-wrap items-start gap-x-6 gap-y-4 p-4">
                  <div className="min-w-[280px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={GATES[a.type].tone} className="font-mono">
                        {a.type}
                      </Badge>
                      <Badge tone={statusTone[a.status]} dot className="capitalize">
                        {a.status}
                      </Badge>
                      <span className="font-mono text-[11px] text-ink-faint">
                        {a.id.toUpperCase()}
                      </span>
                      {a.caseRef && <CaseLink caseRef={a.caseRef} />}
                    </div>
                    <h3 className="mt-2 text-[14px] leading-snug font-semibold text-ink">
                      {a.subject}
                    </h3>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                      {a.justification}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-faint">
                      <span className="flex items-center gap-1.5">
                        <Avatar name={a.requesterName} size={18} /> {a.requesterName} ·{' '}
                        {relative(a.requestedAt, now)}
                      </span>
                      <span>
                        Scope: <span className="text-ink-2">{a.scope}</span>
                      </span>
                      {exp && (
                        <span
                          className={cn(
                            'num inline-flex items-center gap-1',
                            exp.overdue ? 'text-red' : 'text-ink-muted',
                          )}
                        >
                          <Hourglass size={11} />{' '}
                          {exp.overdue
                            ? `expired ${exp.label.replace(' over', '')} ago`
                            : `expires in ${exp.label}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <ol
                    className="flex min-w-[260px] items-stretch gap-2"
                    aria-label="Approval steps"
                  >
                    {a.steps.map((s, si) => {
                      const current =
                        !s.decision &&
                        a.status === 'pending' &&
                        a.steps.findIndex((x) => !x.decision) === si
                      return (
                        <li
                          key={si}
                          className={cn(
                            'w-[150px] rounded-md border px-3 py-2',
                            s.decision === 'approve' && 'border-green/35 bg-green/[0.05]',
                            s.decision === 'refuse' && 'border-red/35 bg-red/[0.05]',
                            !s.decision && current && 'border-amber/40 bg-amber/[0.05]',
                            !s.decision && !current && 'border-line bg-canvas/40',
                          )}
                        >
                          <div className="eyebrow text-[9px]">Step {si + 1}</div>
                          <div className="mt-0.5 text-[12px] font-medium text-ink">
                            {stepRoleLabel(s.role)}
                          </div>
                          <div className="mt-1 flex items-center gap-1 text-[11px]">
                            {s.decision === 'approve' ? (
                              <>
                                <Check size={11} className="text-green" />
                                <span className="truncate text-ink-2">{s.decidedBy}</span>
                              </>
                            ) : s.decision === 'refuse' ? (
                              <>
                                <X size={11} className="text-red" />
                                <span className="truncate text-ink-2">{s.decidedBy}</span>
                              </>
                            ) : (
                              <>
                                <Clock3
                                  size={11}
                                  className={current ? 'text-amber' : 'text-ink-faint'}
                                />
                                <span className="text-ink-faint">
                                  {current ? 'Awaiting' : 'Queued'}
                                </span>
                              </>
                            )}
                          </div>
                          {s.decidedAt && (
                            <div className="num text-[10px] text-ink-faint">
                              {dateTime(s.decidedAt)}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>

                  {a.status === 'pending' && (
                    <div className="flex w-[180px] flex-col gap-2">
                      <Button
                        variant="success"
                        icon={Check}
                        disabled={!!block}
                        onClick={() => setDeciding({ approval: a, decision: 'approve' })}
                      >
                        Approve step
                      </Button>
                      <Button
                        variant="danger"
                        icon={X}
                        disabled={!!block}
                        onClick={() => setDeciding({ approval: a, decision: 'refuse' })}
                      >
                        Refuse
                      </Button>
                      {block && <p className="text-[11px] leading-snug text-ink-faint">{block}</p>}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === 'approve' ? 'Approve this step' : 'Refuse this request'}
        description={deciding?.approval.subject}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant={deciding?.decision === 'approve' ? 'primary' : 'danger'}
              loading={decide.isPending}
              disabled={deciding?.decision === 'refuse' && !comment.trim()}
              onClick={submit}
            >
              {deciding?.decision === 'approve' ? 'Sign approval' : 'Refuse'}
            </Button>
          </>
        }
      >
        <Field
          label="Comment"
          hint="Recorded with your name, active role and device. Required to refuse."
        >
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className={cn(inputClass, 'resize-y')}
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  )
}
