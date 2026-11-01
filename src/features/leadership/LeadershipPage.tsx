import { Link } from '@tanstack/react-router'
import { BarChart3, FileText, MessageSquareText, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import {
  useBriefFeedback,
  useBriefs,
  useGiveFeedback,
  useOutcomes,
  useQuestionAction,
  useQuestions,
} from '@/api/queries'
import {
  FEEDBACK_LABEL,
  ROLE_LABEL,
  type Brief,
  type BriefFeedback,
  type FeedbackRating,
  type Question,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
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
import { duration } from '@/features/outcomes/OutcomesPage'
import { dateTime } from '@/lib/format'
import { QuestionBadge, QuestionStory, endOfDay, inDays, releasedVersion } from './shared'

const RATINGS: { value: FeedbackRating; label: string }[] = [
  { value: 'useful', label: FEEDBACK_LABEL.useful },
  { value: 'partly_useful', label: FEEDBACK_LABEL.partly_useful },
  { value: 'not_useful', label: FEEDBACK_LABEL.not_useful },
]

/**
 * The leadership portal (E37, ADR 0020): released briefs with what leadership made of them, the
 * questions leadership put to the centre and their answers, and the outcome headline (E38).
 */
export function LeadershipPage() {
  const { activeRole } = useAuth()
  const allowed = can.readBriefs(activeRole) && can.readQuestions(activeRole)

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Leadership"
        title="Leadership portal"
        description="Briefs the centre has released, the questions leadership has asked and the answers, and how the centre is doing. Say whether a brief helped; ask a question and the centre takes it on as a requirement."
      />
      {!allowed ? (
        <Panel>
          <EmptyState icon={ShieldAlert} title="The leadership portal isn't open to your role">
            Acting as {ROLE_LABEL[activeRole]}. Leadership, supervisors and the centre lead see it.
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-5">
          {can.readOutcomes(activeRole) && <OutcomeHeadline />}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <ReleasedBriefs />
            <Questions />
          </div>
        </div>
      )}
    </div>
  )
}

function OutcomeHeadline() {
  const outcomes = useOutcomes('30d')
  const feedback = useBriefFeedback()
  const o = outcomes.data
  const useful = (feedback.data ?? []).filter((f) => f.rating === 'useful').length
  return (
    <Panel
      title="The last 30 days"
      icon={BarChart3}
      actions={
        <Link to="/outcomes" className="text-[12px] text-cyan hover:underline">
          Outcome dashboard
        </Link>
      }
    >
      {outcomes.isError ? (
        <ErrorNotice error={outcomes.error} onRetry={() => outcomes.refetch()} />
      ) : (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Briefs released" value={o ? String(o.briefsReleased) : '…'} />
          <Figure
            label="Median time to release"
            value={o ? duration(o.medianTimeToRelease) : '…'}
          />
          <Figure label="Corrections" value={o ? String(o.corrections) : '…'} />
          <Figure
            label="Feedback given"
            value={feedback.data ? String(feedback.data.length) : '…'}
            hint={feedback.data?.length ? `${useful} found the brief useful` : undefined}
          />
        </dl>
      )}
    </Panel>
  )
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="num mt-1 text-[20px] font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[11px] text-ink-faint">{hint}</dd>}
    </div>
  )
}

function ReleasedBriefs() {
  const briefs = useBriefs()
  const feedback = useBriefFeedback()
  const questions = useQuestions()
  const released = (briefs.data?.items ?? []).filter((b) => releasedVersion(b))

  return (
    <Panel title="Released briefs" icon={FileText} bodyClassName="p-0">
      {briefs.isPending ? (
        <SkeletonRows rows={4} />
      ) : briefs.isError ? (
        <ErrorNotice error={briefs.error} onRetry={() => briefs.refetch()} />
      ) : released.length === 0 ? (
        <EmptyState icon={FileText} title="No briefs released yet">
          A brief appears here once a reviewer releases it.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft">
          {released.map((b) => (
            <ReleasedBriefRow
              key={b.id}
              brief={b}
              feedback={(feedback.data ?? []).filter((f) => f.productId === b.id)}
              questions={(questions.data?.items ?? []).filter((q) => q.briefIds.includes(b.id))}
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function ReleasedBriefRow({
  brief,
  feedback,
  questions,
}: {
  brief: Brief
  feedback: BriefFeedback[]
  questions: Question[]
}) {
  const { activeRole, user } = useAuth()
  const version = releasedVersion(brief)!
  const mine = feedback.find((f) => f.givenBy.id === user?.id)

  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link
            to="/products/$productId"
            params={{ productId: brief.id }}
            className="text-[13px] font-medium text-ink hover:text-cyan"
          >
            {brief.title}
          </Link>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">
            Version {version.number} · released {version.releasedAt && dateTime(version.releasedAt)}
            {brief.status === 'correcting' && ' · a correction is being prepared'}
          </p>
        </div>
        <span className="text-[11.5px] text-ink-muted">
          {feedback.length === 0
            ? 'No feedback yet'
            : `${feedback.length} ${feedback.length === 1 ? 'reader' : 'readers'}: ${summary(feedback)}`}
        </span>
      </div>
      {questions.length > 0 && (
        <div className="rounded-md bg-tint/[0.025] px-3 py-2">
          <p className="eyebrow mb-1">Answers questions</p>
          <ul className="space-y-1 text-[12.5px] text-ink-2">
            {questions.map((q) => (
              <li key={q.id}>“{q.text}”</li>
            ))}
          </ul>
        </div>
      )}
      {can.giveFeedback(activeRole) && (
        <FeedbackForm productId={brief.id} mine={mine} releasedVersion={version.number} />
      )}
    </li>
  )
}

function summary(feedback: BriefFeedback[]) {
  return RATINGS.map((r) => [r.label, feedback.filter((f) => f.rating === r.value).length] as const)
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${n} ${label.toLowerCase()}`)
    .join(', ')
}

function FeedbackForm({
  productId,
  mine,
  releasedVersion,
}: {
  productId: string
  mine?: BriefFeedback
  releasedVersion: number
}) {
  const toast = useToast()
  const give = useGiveFeedback()
  const [rating, setRating] = useState<FeedbackRating>(mine?.rating ?? 'useful')
  const [comment, setComment] = useState(mine?.comment ?? '')

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        give.mutate(
          { productId, rating, comment },
          {
            onSuccess: () =>
              toast({ title: mine ? 'Feedback changed' : 'Feedback sent', tone: 'success' }),
            onError: (err) =>
              toast({ title: 'Feedback refused', detail: describeError(err), tone: 'error' }),
          },
        )
      }}
    >
      <Segmented label="Was it useful?" value={rating} onChange={setRating} options={RATINGS} />
      <input
        aria-label="Comment"
        className={`${inputClass} min-w-48 flex-1`}
        placeholder="What would have made it more useful? (optional)"
        maxLength={2000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button type="submit" variant="primary" loading={give.isPending}>
        {mine ? 'Change feedback' : 'Send feedback'}
      </Button>
      {mine && (
        <p className="w-full text-[11px] text-ink-faint">
          You said “{FEEDBACK_LABEL[mine.rating]}” on version {mine.productVersion}
          {mine.productVersion < releasedVersion && ', before the correction'} ·{' '}
          {dateTime(mine.changedAt ?? mine.givenAt)}
        </p>
      )}
    </form>
  )
}

function Questions() {
  const { activeRole } = useAuth()
  const questions = useQuestions()
  const briefs = useBriefs()
  const titles = new Map((briefs.data?.items ?? []).map((b) => [b.id, b.title]))
  const items = questions.data?.items ?? []

  return (
    <Panel title="Questions to the centre" icon={MessageSquareText} bodyClassName="p-0">
      {can.askQuestion(activeRole) && <AskForm />}
      {questions.isPending ? (
        <SkeletonRows rows={3} />
      ) : questions.isError ? (
        <ErrorNotice error={questions.error} onRetry={() => questions.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquareText} title="No questions yet">
          Leadership's questions and the centre's answers appear here.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line-soft">
          {items.map((q) => (
            <li key={q.id} className="space-y-2 px-4 py-3.5">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-[13px] font-medium text-ink">{q.text}</p>
                <QuestionBadge status={q.status} />
              </div>
              <QuestionStory q={q} briefTitle={(id) => titles.get(id)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function AskForm() {
  const toast = useToast()
  const ask = useQuestionAction()
  const [text, setText] = useState('')
  const [context, setContext] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [tomorrow] = useState(() => inDays(1))

  return (
    <form
      className="space-y-3 border-b border-line-soft px-4 py-4"
      onSubmit={(e) => {
        e.preventDefault()
        ask.mutate(
          {
            kind: 'ask',
            input: {
              text: text.trim(),
              context: context.trim() || undefined,
              neededBy: neededBy ? endOfDay(neededBy) : undefined,
            },
          },
          {
            onSuccess: () => {
              setText('')
              setContext('')
              setNeededBy('')
              toast({ title: 'Question sent to the centre', tone: 'success' })
            },
            onError: (err) =>
              toast({ title: 'Question refused', detail: describeError(err), tone: 'error' }),
          },
        )
      }}
    >
      <Field label="Your question">
        <textarea
          className={`${inputClass} min-h-18`}
          required
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you need the centre to find out?"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Field
          label="Why you ask (optional)"
          hint="The decision it informs helps the centre scope it."
        >
          <input
            className={inputClass}
            maxLength={2000}
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </Field>
        <Field label="Needed by (optional)">
          <input
            type="date"
            className={inputClass}
            min={tomorrow}
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={ask.isPending} disabled={!text.trim()}>
        Ask the centre
      </Button>
    </form>
  )
}
