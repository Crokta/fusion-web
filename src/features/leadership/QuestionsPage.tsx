import { ClipboardList, MessageSquareText, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { useBriefs, useQuestionAction, useQuestions, useRequirements } from '@/api/queries'
import { ROLE_LABEL, type Question, type QuestionStatus, type Requirement } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Panel,
  Segmented,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { dateTime } from '@/lib/format'
import {
  QUESTION_LABEL,
  QuestionBadge,
  QuestionStory,
  endOfDay,
  inDays,
  releasedVersion,
} from './shared'

const FILTERS: QuestionStatus[] = ['asked', 'accepted', 'answered', 'declined']

/**
 * The centre's side of leadership's questions (E37, ADR 0020): take a question on as a
 * requirement, answer it citing released briefs, or decline it saying why. requirement.manage.
 */
export function QuestionsPage() {
  const { activeRole } = useAuth()
  const [status, setStatus] = useState<QuestionStatus>('asked')
  const questions = useQuestions(undefined, can.readQuestions(activeRole))
  const all = questions.data?.items ?? []
  const items = all.filter((q) => q.status === status)

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Intelligence · Requirements"
        title="Questions and requirements"
        description="Questions leadership has put to the centre. Accept one as a requirement, then answer it from released briefs; or decline it and say why. Someone other than the asker decides."
        actions={
          can.readQuestions(activeRole) && (
            <Segmented
              label="Status"
              value={status}
              onChange={setStatus}
              options={FILTERS.map((s) => ({
                value: s,
                label: QUESTION_LABEL[s],
                count: all.filter((q) => q.status === s).length,
              }))}
            />
          )
        }
      />
      {!can.readQuestions(activeRole) ? (
        <Panel>
          <EmptyState icon={ShieldAlert} title="Questions aren't open to your role">
            Acting as {ROLE_LABEL[activeRole]}. Supervisors, the centre lead and leadership see
            them.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Panel
            title={`${QUESTION_LABEL[status]} questions`}
            icon={MessageSquareText}
            bodyClassName="p-0"
          >
            {questions.isPending ? (
              <SkeletonRows rows={3} />
            ) : questions.isError ? (
              <ErrorNotice error={questions.error} onRetry={() => questions.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState icon={MessageSquareText} title={`No ${status} questions`} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {items.map((q) => (
                  <QuestionRow key={q.id} q={q} />
                ))}
              </ul>
            )}
          </Panel>
          {can.manageRequirements(activeRole) && <Requirements />}
        </div>
      )}
    </div>
  )
}

type Step = 'accept' | 'answer' | 'decline' | null

function QuestionRow({ q }: { q: Question }) {
  const { activeRole } = useAuth()
  const briefs = useBriefs()
  const titles = new Map((briefs.data?.items ?? []).map((b) => [b.id, b.title]))
  const [step, setStep] = useState<Step>(null)
  const manage = can.manageRequirements(activeRole)

  return (
    <li className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[13px] font-medium text-ink">{q.text}</p>
        <QuestionBadge status={q.status} />
      </div>
      <QuestionStory q={q} briefTitle={(id) => titles.get(id)} />
      {manage && step === null && (q.status === 'asked' || q.status === 'accepted') && (
        <div className="flex gap-2">
          {q.status === 'asked' && (
            <Button variant="primary" onClick={() => setStep('accept')}>
              Accept as a requirement
            </Button>
          )}
          {q.status === 'accepted' && (
            <Button variant="primary" onClick={() => setStep('answer')}>
              Answer
            </Button>
          )}
          <Button variant="danger" onClick={() => setStep('decline')}>
            Decline
          </Button>
        </div>
      )}
      {step === 'accept' && <AcceptForm q={q} onDone={() => setStep(null)} />}
      {step === 'answer' && <AnswerForm q={q} onDone={() => setStep(null)} />}
      {step === 'decline' && <DeclineForm q={q} onDone={() => setStep(null)} />}
    </li>
  )
}

function useStep(onDone: () => void, done: string) {
  const toast = useToast()
  const action = useQuestionAction()
  const run = (a: Parameters<typeof action.mutate>[0]) =>
    action.mutate(a, {
      onSuccess: () => {
        toast({ title: done, tone: 'success' })
        onDone()
      },
      onError: (err) => toast({ title: 'Refused', detail: describeError(err), tone: 'error' }),
    })
  return { run, pending: action.isPending }
}

function AcceptForm({ q, onDone }: { q: Question; onDone: () => void }) {
  const requirements = useRequirements('active')
  const { run, pending } = useStep(onDone, 'Question accepted')
  const [existing, setExisting] = useState('')
  const [title, setTitle] = useState(q.text.slice(0, 200))
  const [expires, setExpires] = useState(() => inDays(30))
  // The date bounds, fixed when the form opens.
  const [bounds] = useState(() => ({ min: inDays(1), max: inDays(180), now: Date.now() }))
  const live = (requirements.data?.items ?? []).filter(
    (r) => new Date(r.expiresAt).getTime() > bounds.now,
  )

  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault()
        run({
          kind: 'accept',
          id: q.id,
          etag: q.etag,
          input: existing ? { requirementId: existing } : { title, expiresAt: endOfDay(expires) },
        })
      }}
    >
      <Field label="Requirement">
        <select
          className={inputClass}
          value={existing}
          onChange={(e) => setExisting(e.target.value)}
        >
          <option value="">A new requirement</option>
          {live.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} (until {dateTime(r.expiresAt)})
            </option>
          ))}
        </select>
      </Field>
      {!existing && (
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Title">
            <input
              className={inputClass}
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Expires" hint="At most 180 days ahead.">
            <input
              type="date"
              className={inputClass}
              required
              min={bounds.min}
              max={bounds.max}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </Field>
        </div>
      )}
      <FormButtons pending={pending} label="Accept" onCancel={onDone} />
    </form>
  )
}

function AnswerForm({ q, onDone }: { q: Question; onDone: () => void }) {
  const briefs = useBriefs()
  const { run, pending } = useStep(onDone, 'Answer sent to leadership')
  const [answer, setAnswer] = useState('')
  const [cited, setCited] = useState<string[]>([])
  const released = (briefs.data?.items ?? []).filter((b) => releasedVersion(b))

  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault()
        run({ kind: 'answer', id: q.id, etag: q.etag, answer: answer.trim(), briefIds: cited })
      }}
    >
      <Field label="Answer">
        <textarea
          className={`${inputClass} min-h-24`}
          required
          maxLength={4000}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </Field>
      <fieldset>
        <legend className="eyebrow mb-1.5">Released briefs it rests on</legend>
        {released.length === 0 ? (
          <p className="text-[12px] text-ink-faint">No brief has been released yet.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-auto">
            {released.map((b) => (
              <li key={b.id}>
                <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={cited.includes(b.id)}
                    disabled={!cited.includes(b.id) && cited.length >= 10}
                    onChange={(e) =>
                      setCited((c) =>
                        e.target.checked ? [...c, b.id] : c.filter((x) => x !== b.id),
                      )
                    }
                  />
                  {b.title}
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <FormButtons
        pending={pending}
        label="Send answer"
        onCancel={onDone}
        disabled={!answer.trim()}
      />
    </form>
  )
}

function DeclineForm({ q, onDone }: { q: Question; onDone: () => void }) {
  const { run, pending } = useStep(onDone, 'Question declined')
  const [reason, setReason] = useState('')
  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault()
        run({ kind: 'decline', id: q.id, etag: q.etag, reason: reason.trim() })
      }}
    >
      <Field label="Why the centre declines it" hint="Leadership sees this.">
        <input
          className={inputClass}
          required
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <FormButtons
        pending={pending}
        label="Decline"
        danger
        onCancel={onDone}
        disabled={!reason.trim()}
      />
    </form>
  )
}

function FormButtons({
  pending,
  label,
  onCancel,
  danger,
  disabled,
}: {
  pending: boolean
  label: string
  onCancel: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="submit"
        variant={danger ? 'danger' : 'primary'}
        loading={pending}
        disabled={disabled}
      >
        {label}
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

const REQUIREMENT_TONE: Record<Requirement['status'], 'green' | 'neutral' | 'amber'> = {
  active: 'green',
  expired: 'amber',
  closed: 'neutral',
}

function Requirements() {
  const requirements = useRequirements()
  const items = requirements.data?.items ?? []
  return (
    <Panel title="Requirements" icon={ClipboardList} bodyClassName="p-0">
      {requirements.isPending ? (
        <SkeletonRows rows={3} />
      ) : requirements.isError ? (
        <ErrorNotice error={requirements.error} onRetry={() => requirements.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No requirements yet">
          Accepting a question creates one.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{r.title}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-faint">
                  Until {dateTime(r.expiresAt)} · {r.createdBy.name}
                  {r.questionId && ' · from a leadership question'}
                </p>
              </div>
              <Badge tone={REQUIREMENT_TONE[r.status]} dot>
                {r.status === 'active' ? 'Active' : r.status === 'expired' ? 'Expired' : 'Closed'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
