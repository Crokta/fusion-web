import { Link } from '@tanstack/react-router'
import type { Brief, Question, QuestionStatus } from '@/api/types'
import { Badge, type Tone } from '@/components/ui'
import { dateTime } from '@/lib/format'

export const QUESTION_LABEL: Record<QuestionStatus, string> = {
  asked: 'Asked',
  accepted: 'Accepted',
  answered: 'Answered',
  declined: 'Declined',
}

const QUESTION_TONE: Record<QuestionStatus, Tone> = {
  asked: 'amber',
  accepted: 'cyan',
  answered: 'green',
  declined: 'neutral',
}

export function QuestionBadge({ status }: { status: QuestionStatus }) {
  return (
    <Badge tone={QUESTION_TONE[status]} dot>
      {QUESTION_LABEL[status]}
    </Badge>
  )
}

/** The highest version of a brief that has been released, or null while it is only a draft. */
export function releasedVersion(b: Brief) {
  const released = b.versions.filter((v) => v.releasedAt)
  if (released.length === 0) return null
  return released.reduce((a, v) => (v.number > a.number ? v : a))
}

/** A date input's value (yyyy-mm-dd) as the end of that day, UTC. */
export const endOfDay = (date: string) => new Date(`${date}T23:59:59Z`).toISOString()

/** yyyy-mm-dd, <days> from today. */
export const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

/** What happened to a question so far, and the answer with the briefs it rests on. */
export function QuestionStory({
  q,
  briefTitle,
}: {
  q: Question
  briefTitle: (id: string) => string | undefined
}) {
  return (
    <div className="space-y-2 text-[12.5px] text-ink-2">
      <p className="text-[11.5px] text-ink-faint">
        Asked by {q.askedBy.name} · {dateTime(q.askedAt)}
        {q.neededBy && <> · needed by {dateTime(q.neededBy)}</>}
      </p>
      {q.context && <p className="text-ink-muted">{q.context}</p>}
      {q.requirement && (
        <p className="text-[11.5px] text-ink-muted">
          Taken on as the requirement “{q.requirement.title}” ({q.requirement.status}, until{' '}
          {dateTime(q.requirement.expiresAt)}){q.acceptedBy && <> by {q.acceptedBy.name}</>}.
        </p>
      )}
      {q.status === 'answered' && q.answer && (
        <div className="rounded-md border border-green/25 bg-green/[0.05] px-3 py-2">
          <p className="eyebrow mb-1 text-green/90">
            Answer{q.answeredBy && <> · {q.answeredBy.name}</>}
            {q.answeredAt && <> · {dateTime(q.answeredAt)}</>}
          </p>
          <p className="whitespace-pre-line text-ink">{q.answer}</p>
          {q.briefIds.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {q.briefIds.map((id) => (
                <li key={id}>
                  <Link
                    to="/products/$productId"
                    params={{ productId: id }}
                    className="inline-flex rounded border border-line px-1.5 py-0.5 text-[11.5px] text-cyan hover:border-cyan/50"
                  >
                    {briefTitle(id) ?? 'Released brief'}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {q.status === 'declined' && (
        <p className="rounded-md border border-line px-3 py-2 text-ink-muted">
          Declined{q.declinedBy && <> by {q.declinedBy.name}</>}: {q.declinedReason}
        </p>
      )}
    </div>
  )
}
