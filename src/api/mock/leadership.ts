import type { FusionApi } from '../contract'
import type { ProblemCode } from '../problem'
import type { Brief, BriefFeedback, Question, Requirement, Role } from '../types'
import { ago } from './fixtures'

/**
 * Leadership's questions, the requirements they become and feedback on released briefs, for the
 * mock gateway (E37, ADR 0020), with intake's rules: asking is question.ask (leadership); reading
 * questions is question.read; accepting, answering and declining are requirement.manage
 * (supervisor, centre lead), never by the asker; feedback is product.feedback (leadership) on a
 * released brief, one per reader, and reading it product.read.
 */
interface Deps {
  delay: <T>(value: () => T) => Promise<T>
  refuse: (code: ProblemCode, title: string, status?: number) => never
  requireRole: (roles: Role[], action: string) => void
  audit: (outcome: 'allowed' | 'refused', action: string, target: string) => void
  me: () => { id: string; name: string }
  briefs: () => Brief[]
}

type LeadershipApi = Pick<
  FusionApi,
  | 'questions'
  | 'askQuestion'
  | 'acceptQuestion'
  | 'answerQuestion'
  | 'declineQuestion'
  | 'requirements'
  | 'createRequirement'
  | 'briefFeedback'
  | 'giveFeedback'
>

const ASK: Role[] = ['leadership']
const READ_QUESTIONS: Role[] = ['supervisor', 'centre_lead', 'leadership']
const MANAGE: Role[] = ['supervisor', 'centre_lead']
const READ_BRIEFS: Role[] = ['analyst', 'supervisor', 'reviewer', 'centre_lead', 'leadership']
const DAY = 86_400_000

const bump = (etag: string) => `"v${Number(etag.replace(/\D/g, '')) + 1}"`

export function leadershipMocks({
  delay,
  refuse,
  requireRole,
  audit,
  me,
  briefs,
}: Deps): LeadershipApi {
  const leader = { id: 'u-leader', name: 'Ngozi Okafor' }
  const requirements: Requirement[] = []
  const questions: Question[] = [
    {
      id: 'q-1',
      text: 'Are the fuel queue protests likely to spread beyond Kano this week?',
      context: 'Deciding whether to brief the governor on Thursday.',
      neededBy: new Date(Date.now() + 3 * DAY).toISOString(),
      status: 'asked',
      askedBy: leader,
      askedAt: ago(90),
      requirement: null,
      acceptedBy: null,
      acceptedAt: null,
      answer: null,
      briefIds: [],
      answeredBy: null,
      answeredAt: null,
      declinedReason: null,
      declinedBy: null,
      declinedAt: null,
      etag: '"v0"',
    },
  ]
  const feedback: BriefFeedback[] = []

  const released = (id: string) =>
    briefs().find((b) => b.id === id && b.versions.some((v) => v.releasedAt))

  function questionAt(id: string, etag: string) {
    const q = questions.find((x) => x.id === id)
    if (!q) return refuse('not_found', 'No such question.', 404)
    if (q.etag !== etag) refuse('precondition_failed', 'Someone changed this question first.', 412)
    return q
  }

  function newRequirement(title: string, detail: string | null, expiresAt: string, from?: string) {
    if (new Date(expiresAt).getTime() <= Date.now())
      refuse('validation_failed', 'A requirement expires in the future.', 400)
    if (new Date(expiresAt).getTime() > Date.now() + 180 * DAY)
      refuse(
        'validation_failed',
        'A requirement runs for at most 180 days before it is renewed.',
        400,
      )
    const r: Requirement = {
      id: `req-${Date.now()}`,
      title: title.trim().slice(0, 200),
      detail,
      status: 'active',
      expiresAt,
      createdBy: me(),
      createdAt: new Date().toISOString(),
      questionId: from ?? null,
      closedReason: null,
      etag: '"v0"',
    }
    requirements.unshift(r)
    audit('allowed', 'requirement.create', r.id)
    return r
  }

  return {
    questions: (p) =>
      delay(() => {
        requireRole(READ_QUESTIONS, 'Reading leadership questions')
        const items = questions.filter(
          (q) =>
            (!p?.status || q.status === p.status) &&
            (!p?.briefId || q.briefIds.includes(p.briefId)),
        )
        return { items, nextCursor: null }
      }),
    askQuestion: (input) =>
      delay(() => {
        requireRole(ASK, 'Asking the centre a question')
        if (!input.text.trim()) refuse('validation_failed', 'Write the question.', 400)
        const q: Question = {
          id: `q-${Date.now()}`,
          text: input.text.trim(),
          context: input.context?.trim() || null,
          neededBy: input.neededBy ?? null,
          status: 'asked',
          askedBy: me(),
          askedAt: new Date().toISOString(),
          requirement: null,
          acceptedBy: null,
          acceptedAt: null,
          answer: null,
          briefIds: [],
          answeredBy: null,
          answeredAt: null,
          declinedReason: null,
          declinedBy: null,
          declinedAt: null,
          etag: '"v0"',
        }
        questions.unshift(q)
        audit('allowed', 'question.ask', q.id)
        return q
      }),
    acceptQuestion: (id, input, etag) =>
      delay(() => {
        requireRole(MANAGE, 'Accepting a question')
        const q = questionAt(id, etag)
        if (q.status !== 'asked')
          refuse('conflict', `An ${q.status} question cannot be accepted.`, 409)
        if (q.askedBy.id === me().id)
          refuse('self_approval_forbidden', 'You cannot accept a question you asked.')
        let r: Requirement
        if ('requirementId' in input) {
          const found = requirements.find((x) => x.id === input.requirementId)
          if (!found || found.status !== 'active')
            return refuse(
              'validation_failed',
              'Choose a requirement that is active and not past its expiry.',
              400,
            )
          r = found
        } else {
          r = newRequirement(
            input.title?.trim() || q.text,
            input.detail?.trim() || q.context,
            input.expiresAt,
            q.id,
          )
        }
        Object.assign(q, {
          status: 'accepted',
          requirement: { id: r.id, title: r.title, status: r.status, expiresAt: r.expiresAt },
          acceptedBy: me(),
          acceptedAt: new Date().toISOString(),
          etag: bump(q.etag),
        })
        audit('allowed', 'question.accept', q.id)
        return q
      }),
    answerQuestion: (id, answer, briefIds, etag) =>
      delay(() => {
        requireRole(MANAGE, 'Answering a question')
        const q = questionAt(id, etag)
        if (q.status !== 'accepted')
          refuse(
            'conflict',
            q.status === 'asked'
              ? 'Accept the question before answering it.'
              : `An ${q.status} question cannot be answered.`,
            409,
          )
        if (!answer.trim()) refuse('validation_failed', 'Write the answer.', 400)
        if (briefIds.some((b) => !released(b)))
          refuse('validation_failed', 'Only released briefs can be cited in an answer.', 400)
        Object.assign(q, {
          status: 'answered',
          answer: answer.trim(),
          briefIds: [...new Set(briefIds)],
          answeredBy: me(),
          answeredAt: new Date().toISOString(),
          etag: bump(q.etag),
        })
        audit('allowed', 'question.answer', q.id)
        return q
      }),
    declineQuestion: (id, reason, etag) =>
      delay(() => {
        requireRole(MANAGE, 'Declining a question')
        const q = questionAt(id, etag)
        if (q.status !== 'asked' && q.status !== 'accepted')
          refuse('conflict', `An ${q.status} question cannot be declined.`, 409)
        if (!reason.trim()) refuse('validation_failed', 'Say why the question is declined.', 400)
        Object.assign(q, {
          status: 'declined',
          declinedReason: reason.trim(),
          declinedBy: me(),
          declinedAt: new Date().toISOString(),
          etag: bump(q.etag),
        })
        audit('allowed', 'question.decline', q.id)
        return q
      }),
    requirements: (p) =>
      delay(() => {
        requireRole(MANAGE, 'Reading requirements')
        return {
          items: requirements.filter((r) => !p?.status || r.status === p.status),
          nextCursor: null,
        }
      }),
    createRequirement: (input) =>
      delay(() => {
        requireRole(MANAGE, 'Creating a requirement')
        if (!input.title.trim()) refuse('validation_failed', 'A requirement needs a title.', 400)
        return newRequirement(input.title, input.detail?.trim() || null, input.expiresAt)
      }),
    briefFeedback: (p) =>
      delay(() => {
        requireRole(READ_BRIEFS, 'Reading feedback on briefs')
        return feedback.filter((f) => !p?.productId || f.productId === p.productId)
      }),
    giveFeedback: (productId, rating, comment) =>
      delay(() => {
        requireRole(ASK, 'Giving feedback on a brief')
        const brief = released(productId)
        if (!brief)
          return refuse('validation_failed', 'Feedback is given on a released brief.', 400)
        const version = Math.max(...brief.versions.filter((v) => v.releasedAt).map((v) => v.number))
        const now = new Date().toISOString()
        const mine = feedback.find((f) => f.productId === productId && f.givenBy.id === me().id)
        if (mine) {
          Object.assign(mine, {
            rating,
            comment: comment?.trim() || null,
            productVersion: version,
            changedAt: now,
          })
          audit('allowed', 'feedback.change', mine.id)
          return mine
        }
        const f: BriefFeedback = {
          id: `fb-${Date.now()}`,
          productId,
          productVersion: version,
          rating,
          comment: comment?.trim() || null,
          givenBy: me(),
          givenAt: now,
          changedAt: null,
        }
        feedback.unshift(f)
        audit('allowed', 'feedback.give', f.id)
        return f
      }),
  }
}
