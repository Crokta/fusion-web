import { CheckCircle2, CornerUpLeft, ShieldAlert, UserX } from 'lucide-react'
import { useState } from 'react'
import { ROLE_LABEL, type ReviewDecision, type ReviewItem, type Role } from '@/api/types'
import { can } from '@/auth/AuthProvider'
import { Button, Field, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'

/**
 * Approve / return controls for one submitted case. The gateway enforces reviewer ≠ author
 * (self_approval_forbidden); the UI enforces it too so nobody is invited to make a decision
 * the server will refuse.
 */
export function ReviewDecisionPanel({
  item,
  currentUserId,
  activeRole,
  onDecide,
  pending,
}: {
  item: ReviewItem
  currentUserId: string
  activeRole: Role
  onDecide: (decision: ReviewDecision, comment: string) => void
  pending?: boolean
}) {
  const [comment, setComment] = useState('')
  const [touched, setTouched] = useState(false)
  const isAuthor = item.authorId === currentUserId
  const roleAllowed = can.decideReview(activeRole)
  const blocked = isAuthor || !roleAllowed
  const commentMissing = comment.trim().length === 0

  return (
    <div>
      {isAuthor && (
        <div
          role="note"
          className="mb-4 flex gap-3 rounded-lg border border-amber/35 bg-amber/[0.07] px-3.5 py-3"
        >
          <UserX size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
          <div className="text-[12.5px] leading-relaxed">
            <p className="font-medium text-amber">
              You authored this case — another reviewer must decide.
            </p>
            <p className="mt-0.5 text-ink-muted">
              Reviewer ≠ author is enforced by governance; the gateway would refuse with{' '}
              <code className="font-mono text-[11px] text-ink-2">self_approval_forbidden</code>.
            </p>
          </div>
        </div>
      )}
      {!isAuthor && !roleAllowed && (
        <div
          role="note"
          className="mb-4 flex gap-3 rounded-lg border border-line-strong bg-tint/[0.025] px-3.5 py-3"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-cyan" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Acting as <span className="text-ink-2">{ROLE_LABEL[activeRole]}</span>. Switch to
            Reviewer, Supervisor or Centre lead in the user menu to decide.
          </p>
        </div>
      )}

      <Field
        label="Reviewer comment"
        hint="Required to return the case; recorded in the audit trail either way."
      >
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={blocked || pending}
          rows={4}
          placeholder={
            blocked
              ? 'Not available'
              : 'What should the analyst change, or why is this ready for release?'
          }
          className={cn(
            inputClass,
            'resize-y leading-relaxed disabled:opacity-50',
            touched && commentMissing && 'border-red/60',
          )}
        />
      </Field>
      {touched && commentMissing && (
        <p className="mt-1.5 text-[11.5px] text-red" role="alert">
          A comment is required to return a case.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          variant="success"
          size="md"
          icon={CheckCircle2}
          disabled={blocked}
          loading={pending}
          onClick={() => onDecide('approve', comment.trim())}
          className="flex-1"
        >
          Approve
        </Button>
        <Button
          variant="danger"
          size="md"
          icon={CornerUpLeft}
          disabled={blocked || pending}
          onClick={() => {
            setTouched(true)
            if (!commentMissing) onDecide('return', comment.trim())
          }}
          className="flex-1"
        >
          Return to analyst
        </Button>
      </div>
    </div>
  )
}
