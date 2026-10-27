import type { FusionApi } from '../contract'
import { ApiError, type ProblemCode } from '../problem'
import { session } from '../session'
import type {
  Alert,
  Brief,
  CaseDetail,
  SupportCheck,
  LiveEventMap,
  LiveEventName,
  Me,
  Role,
  SearchKind,
  SourceRecord,
  StoryGroup,
  WallState,
} from '../types'
import * as fx from './fixtures'

/**
 * In-memory gateway. It keeps the same rules the real services enforce — reviewer is not the
 * author, roles gate actions, wall publication needs a supervisor — so the UI's own checks are
 * exercised against a server that would refuse, not one that always says yes.
 */

const clone = <T>(v: T): T => structuredClone(v)

const db = {
  cases: clone(fx.caseSummaries),
  feed: clone(fx.storyGroups),
  triage: clone(fx.triageItems),
  sources: clone(fx.sources),
  briefs: [] as Brief[],
  /** Assessment written in this session, laid over the fixture case. */
  assessment: new Map<string, Partial<CaseDetail>>(),
  alerts: clone(fx.alerts),
  reviews: clone(fx.reviews),
  approvals: clone(fx.approvals),
  policies: clone(fx.policies),
  audit: clone(fx.auditEvents),
  publications: clone(fx.wallPublications),
  wall: fx.stateFromPreset(fx.wallPresets[0]!, 16, 'Zainab Bello'),
  signals: 0,
}

// ---------------------------------------------------------------- event bus (mock hub)

type Handler<E extends LiveEventName> = (payload: LiveEventMap[E]) => void
const listeners = new Map<LiveEventName, Set<Handler<LiveEventName>>>()

export const mockBus = {
  on<E extends LiveEventName>(event: E, handler: Handler<E>) {
    const set = listeners.get(event) ?? new Set()
    set.add(handler as Handler<LiveEventName>)
    listeners.set(event, set)
    return () => set.delete(handler as Handler<LiveEventName>)
  },
  emit<E extends LiveEventName>(event: E, payload: LiveEventMap[E]) {
    listeners.get(event)?.forEach((h) => h(payload))
  },
}

// ---------------------------------------------------------------- helpers

const latency = () => 180 + Math.random() * 320

async function delay<T>(value: () => T): Promise<T> {
  await new Promise((r) => setTimeout(r, latency()))
  return clone(value())
}

function refuse(code: ProblemCode, title: string, status = 403, detail?: string): never {
  audit('refused', title, detail ?? code)
  throw new ApiError({ title, status, code, detail: detail ?? title, traceId: crypto.randomUUID() })
}

function requireRole(roles: Role[], action: string) {
  const role = session.getActiveRole()
  if (!roles.includes(role))
    refuse('capability_not_authorised', `${action} is not permitted for the active role`)
}

function audit(outcome: 'allowed' | 'refused', action: string, target: string, purpose?: string) {
  db.audit.unshift({
    id: `au-${Date.now()}`,
    at: new Date().toISOString(),
    actor: devName(),
    role: session.getActiveRole(),
    action,
    target,
    outcome,
    purpose,
    rowHash: Math.random().toString(16).slice(2, 18),
  })
}

const devName = () => (session.getUserId() === fx.DEV_USER_ID ? fx.people.dirk.name : 'You')

const me = () => ({ id: session.getUserId() ?? fx.DEV_USER_ID, name: devName() })

function sourceAt(id: string, etag: string) {
  const s = db.sources.find((x) => x.id === id)
  if (!s) refuse('not_found', 'No such source.', 404)
  if (s.etag !== etag) refuse('precondition_failed', 'Someone changed this source first.', 412)
  return s
}

function bumpSource(s: SourceRecord) {
  s.etag = `"v${Number(s.etag.replace(/\D/g, '')) + 1}"`
}

/** Approval and reinstatement are both approvals: never by the person who proposed it. */
function approveOrReinstate(
  id: string,
  etag: string,
  from: SourceRecord['status'],
  action: string,
): SourceRecord {
  requireRole(['supervisor', 'centre_lead'], 'Approving a source')
  const s = sourceAt(id, etag)
  if (s.status !== from)
    refuse(
      'conflict',
      `Only a ${from} source can be ${action === 'source.approve' ? 'approved' : 'reinstated'}.`,
      409,
    )
  if (s.proposedBy.id === me().id)
    refuse('self_approval_forbidden', 'You cannot approve a source you proposed.')
  Object.assign(s, {
    status: 'approved',
    approvedBy: me(),
    approvedAt: new Date().toISOString(),
    suspendedReason: null,
    suspendedAt: null,
  })
  bumpSource(s)
  audit('allowed', action, s.name)
  return s
}

function briefAt(id: string): Brief {
  const b = db.briefs.find((x) => x.id === id)
  if (!b) refuse('not_found', 'No such brief.', 404)
  return b
}

/** The same check reporting runs: every sentence cites something this case holds. */
function mockSupportCheck(b: Brief): SupportCheck {
  const c = liveCase(b.caseId)
  const citable: SupportCheck['citable'] = [
    ...c.findings.map((f, i) => ({
      ref: `finding:${f.id}`,
      kind: 'finding' as const,
      label: `F${i + 1}`,
      text: f.statement,
    })),
    ...c.claims
      .filter((x) => x.outcome !== 'unassessed')
      .map((x, i) => ({
        ref: `claim:${x.id}`,
        kind: 'claim' as const,
        label: `C${i + 1}`,
        text: `${x.text} (${x.outcome})`,
      })),
    ...c.evidence.map((e) => ({
      ref: `evidence:${e.id}`,
      kind: 'evidence' as const,
      label: e.ref,
      text: e.label ?? e.title,
    })),
  ]
  const known = new Map(citable.map((x) => [x.ref, x.label]))
  const sentences = b.sentences.map((s, i) => {
    const refs = s.supportRefs.map((ref) => ({
      ref,
      resolves: known.has(ref),
      label: known.get(ref),
    }))
    return { order: i + 1, supported: refs.some((r) => r.resolves), refs }
  })
  const unsupported = sentences.filter((s) => !s.supported).map((s) => s.order)
  const blockers = [
    ...(unsupported.length
      ? [`Every sentence needs support before release. Unsupported: ${unsupported.join(', ')}.`]
      : []),
    ...(c.state !== 'approved' && b.status !== 'released'
      ? ['The case must be Approved before its product is released.']
      : []),
  ]
  return {
    caseReference: c.ref,
    caseState: c.state,
    ready: blockers.length === 0,
    blockers,
    sentences,
    citable,
  }
}

function liveCase(id: string): CaseDetail {
  const base = fx.caseDetail(id)
  if (!base) refuse('not_found', `Case ${id} not found`, 404)
  const live = db.cases.find((c) => c.id === base.id)
  return { ...base, ...db.assessment.get(base.id), state: live?.state ?? base.state }
}

/** The same editing rules as casework: analysts and supervisors, and not while under review or after release. */
function assess(
  id: string,
  action: string,
  change: (c: CaseDetail) => Partial<CaseDetail>,
): CaseDetail {
  requireRole(['analyst', 'supervisor'], 'Assessing a case')
  const c = liveCase(id)
  if (!['open', 'in_assessment', 'returned', 'approved'].includes(c.state))
    refuse('conflict', `A ${c.state.replace('_', ' ')} case cannot be changed.`, 409)
  db.assessment.set(c.id, { ...db.assessment.get(c.id), ...change(c) })
  audit('allowed', action, c.ref)
  return liveCase(id)
}

function bumpWall(next: WallState): WallState {
  db.wall = {
    ...next,
    revision: db.wall.revision + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: devName(),
  }
  mockBus.emit('wall.state', clone(db.wall))
  return db.wall
}

// ---------------------------------------------------------------- simulated signals

/** The prototype's "Generate Signal": a new story group plus the alert it trips. */
export function simulateSignal(): { story: StoryGroup; alert: Alert } {
  db.signals += 1
  const n = db.signals
  const seed = fx.syntheticHeadlines[(n - 1) % fx.syntheticHeadlines.length]!
  const id = `sg-sim-${n}`
  const nowIso = new Date().toISOString()
  const story: StoryGroup = {
    id,
    headline: seed.headline,
    summary: 'New monitored-source match. Unverified; independent corroboration pending.',
    place: seed.place,
    channel: seed.channel,
    priority: n % 3 === 0 ? 'medium' : 'high',
    firstSeen: nowIso,
    lastUpdated: nowIso,
    independentOutlets: 1 + (n % 3),
    stories: [
      {
        id: `${id}-1`,
        outlet: ['Northern Wire', 'Community Reports', 'Social repost'][n % 3]!,
        headline: seed.headline,
        url: 'https://example.org/sim',
        publishedAt: nowIso,
        official: false,
      },
    ],
    marking: 'OFFICIAL',
  }
  const alert: Alert = {
    id: `al-sim-${n}`,
    title: `Synthetic signal ${String(n).padStart(3, '0')} detected`,
    detail: `${seed.place} · new monitored-source match · just now`,
    severity: story.priority,
    status: 'open',
    raisedAt: nowIso,
    rule: 'watchlist.match',
    escalationLevel: 0,
    escalatesAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  }
  db.feed.unshift(story)
  db.alerts.unshift(alert)
  mockBus.emit('story.published', clone(story))
  mockBus.emit('alert.raised', clone(alert))
  return { story, alert }
}

/** Adds an analyst share request to the wall queue, as if raised from another desk. */
export function simulateShareRequest() {
  const n = db.publications.length + 1
  const contents = ['media-images', 'events', 'social', 'entities'] as const
  db.publications.unshift({
    id: `wq-sim-${n}`,
    ref: `WQ-${1100 + n}`,
    content: contents[n % contents.length]!,
    targets: [n % 16],
    requestedBy: ['Halima Yusuf', 'Emeka Obi', 'Chiamaka Eze'][n % 3]!,
    requestedAt: new Date().toISOString(),
    note: 'Share new investigation media',
    status: 'pending',
  })
  mockBus.emit('wall.state', clone(db.wall))
}

// ---------------------------------------------------------------- adapter

export const mockApi: FusionApi = {
  me: () =>
    delay<Me>(() => ({
      id: fx.DEV_USER_ID,
      name: fx.people.dirk.name,
      email: 'dirk.adebayo@fusion.local',
      roles: ['analyst', 'supervisor', 'reviewer', 'centre_lead', 'admin'],
      activeRole: session.getActiveRole(),
      device: 'WS-FLOOR-07',
    })),

  watchFloor: () =>
    delay(() => ({
      ...fx.watchFloor,
      kpis: fx.watchFloor.kpis.map((k) =>
        k.key === 'alerts'
          ? {
              ...k,
              value: db.alerts.filter((a) => a.status === 'open' || a.status === 'escalated')
                .length,
            }
          : k.key === 'stories'
            ? { ...k, value: 428 + db.signals }
            : k,
      ),
    })),

  feed: (p) =>
    delay(() => ({
      items: p?.channel ? db.feed.filter((g) => g.channel === p.channel) : db.feed,
      nextCursor: null,
      total: db.feed.length,
    })),
  sendToTriage: (id) =>
    delay(() => {
      audit('allowed', 'story.send-to-triage', id)
    }),

  sources: (p) =>
    delay(() => {
      const items = p?.status ? db.sources.filter((s) => s.status === p.status) : db.sources
      return { items, nextCursor: null, total: items.length }
    }),
  proposeSource: (input) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Proposing a source')
      const s: SourceRecord = {
        id: `src-${Date.now()}`,
        ...input,
        host: new URL(input.url).hostname.replace(/^www\./, ''),
        status: 'proposed',
        proposedBy: me(),
        proposedAt: new Date().toISOString(),
        approvedBy: null,
        approvedAt: null,
        suspendedReason: null,
        suspendedAt: null,
        etag: '"v0"',
      }
      db.sources.unshift(s)
      audit('allowed', 'source.propose', s.name)
      return s
    }),
  editSource: (id, input, etag) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Editing a source')
      const s = sourceAt(id, etag)
      const reAddressed = input.url !== s.url || input.kind !== s.kind
      Object.assign(s, input, { host: new URL(input.url).hostname.replace(/^www\./, '') })
      if (reAddressed)
        Object.assign(s, {
          status: 'proposed',
          proposedBy: me(),
          proposedAt: new Date().toISOString(),
          approvedBy: null,
          approvedAt: null,
          suspendedReason: null,
          suspendedAt: null,
        })
      bumpSource(s)
      audit('allowed', 'source.edit', s.name)
      return s
    }),
  approveSource: (id, etag) =>
    delay(() => approveOrReinstate(id, etag, 'proposed', 'source.approve')),
  reinstateSource: (id, etag) =>
    delay(() => approveOrReinstate(id, etag, 'suspended', 'source.reinstate')),
  suspendSource: (id, reason, etag) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Suspending a source')
      const s = sourceAt(id, etag)
      if (s.status !== 'approved')
        refuse('conflict', 'Only an approved source can be suspended.', 409)
      Object.assign(s, {
        status: 'suspended',
        suspendedReason: reason,
        suspendedAt: new Date().toISOString(),
      })
      bumpSource(s)
      audit('allowed', 'source.suspend', s.name, reason)
      return s
    }),

  triage: (p) =>
    delay(() => {
      const items = p?.status ? db.triage.filter((t) => t.status === p.status) : db.triage
      return { items, nextCursor: null, total: items.length }
    }),
  promoteTriage: (id, input) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Promoting from triage')
      const t = db.triage.find((x) => x.id === id)
      if (!t) refuse('not_found', 'Triage item not found', 404)
      if (t.status !== 'pending') refuse('conflict', 'This item has already left triage', 409)
      const caseId = `case-${Date.now()}`
      t.status = 'promoted'
      t.caseId = caseId
      t.promotedAt = new Date().toISOString()
      t.promotedBy = devName()
      db.cases.unshift({
        id: caseId,
        ref: `CASE-2026-${String(db.cases.length + 1).padStart(4, '0')}`,
        title: input.title,
        state: 'open',
        priority: input.priority,
        category: 'Unclassified',
        place: '—',
        owner: { id: input.ownerId, name: devName() },
        deadline: input.deadline,
        updatedAt: new Date().toISOString(),
        signalCount: 0,
        evidenceCount: t.evidence.length,
        marking: 'OFFICIAL',
      })
      audit('allowed', 'triage.promote', `${t.id} → ${caseId}`)
      return { caseId }
    }),

  alerts: (p) =>
    delay(() => ({
      items: p?.status ? db.alerts.filter((a) => a.status === p.status) : db.alerts,
      nextCursor: null,
    })),
  acknowledgeAlert: (id) =>
    delay(() => {
      const a = db.alerts.find((x) => x.id === id)
      if (!a) refuse('not_found', 'Alert not found', 404)
      a.status = 'acknowledged'
      a.acknowledgedBy = devName()
      a.escalatesAt = undefined
      audit('allowed', 'alert.ack', `${a.id.toUpperCase()} ${a.rule}`)
      return a
    }),

  cases: (p) =>
    delay(() => {
      let items = db.cases
      if (p?.state === 'active')
        items = items.filter((c) => !['closed', 'released'].includes(c.state))
      else if (p?.state) items = items.filter((c) => c.state === p.state)
      if (p?.q) {
        const q = p.q.toLowerCase()
        items = items.filter((c) => `${c.ref} ${c.title} ${c.place}`.toLowerCase().includes(q))
      }
      return { items, nextCursor: null, total: items.length }
    }),
  case: (id) => delay(() => liveCase(id)),
  setChecklistItem: (id, key, done) =>
    delay(() =>
      assess(id, 'case.checklist', (c) => ({
        checklist: c.checklist.map((i) => ((i.key ?? i.label) === key ? { ...i, done } : i)),
      })),
    ),
  setCaseSummary: (id, summary) =>
    delay(() =>
      assess(id, 'case.summary', () => ({
        summary,
        summaryBy: devName(),
        summaryUpdatedAt: new Date().toISOString(),
      })),
    ),
  recordFinding: (id, input) =>
    delay(() =>
      assess(id, 'finding.record', (c) => ({
        findings: [
          ...c.findings,
          {
            id: `f-${Date.now()}`,
            ...input,
            authorName: devName(),
            recordedAt: new Date().toISOString(),
            version: 1,
          },
        ],
      })),
    ),
  reviseFinding: (id, findingId, input, version) =>
    delay(() =>
      assess(id, 'finding.revise', (c) => {
        const f = c.findings.find((x) => x.id === findingId)
        if (!f) refuse('not_found', 'No such finding', 404)
        if ((f.version ?? 1) !== version)
          refuse('precondition_failed', 'This finding changed since you loaded it.', 412)
        return {
          findings: c.findings.map((x) =>
            x.id === findingId ? { ...x, ...input, version: version + 1, revisedBy: devName() } : x,
          ),
        }
      }),
    ),
  recordStatement: (id, input) =>
    delay(() =>
      assess(id, 'statement.record', (c) => ({
        statements: [
          ...(c.statements ?? []),
          {
            id: `s-${Date.now()}`,
            ...input,
            recordedBy: devName(),
            recordedAt: new Date().toISOString(),
          },
        ],
      })),
    ),
  recordClaim: (id, input) =>
    delay(() =>
      assess(id, 'claim.record', (c) => ({
        claims: [
          ...c.claims,
          { id: `cl-${Date.now()}`, ...input, outcome: 'unassessed', supportingEvidence: 0 },
        ],
      })),
    ),
  setClaimOutcome: (caseId, claimId, input) =>
    delay(() =>
      assess(caseId, 'claim.outcome', (c) => ({
        claims: c.claims.map((x) =>
          x.id === claimId
            ? {
                ...x,
                ...input,
                supportingEvidence: input.evidenceIds.length + input.statementIds.length,
                outcomeSetBy: devName(),
              }
            : x,
        ),
      })),
    ),
  submitCase: (id) =>
    delay(() => {
      const c = db.cases.find((x) => x.id === id)
      if (!c) refuse('not_found', 'Case not found', 404)
      const detail = fx.caseDetail(id)!
      if (detail.checklist.some((i) => !i.done))
        refuse(
          'requirement_missing',
          'Mission checklist incomplete',
          422,
          'Submit requires a complete mission checklist and statements.',
        )
      c.state = 'submitted'
      audit('allowed', 'case.submit', c.ref)
      return { ...detail, state: c.state }
    }),

  briefs: (p) =>
    delay(() => ({
      items: p?.caseId ? db.briefs.filter((b) => b.caseId === p.caseId) : db.briefs,
      nextCursor: null,
    })),
  brief: (id) => delay(() => briefAt(id)),
  createBrief: (caseId) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Drafting a brief')
      const c = liveCase(caseId)
      if (!['approved', 'released'].includes(c.state))
        refuse(
          'requirement_missing',
          `A brief is drafted from approved findings: ${c.ref} is ${c.state}.`,
        )
      const now = new Date().toISOString()
      const b: Brief = {
        id: `b-${Date.now()}`,
        caseId: c.id,
        title: c.title,
        authorId: me().id,
        authorName: devName(),
        status: 'draft',
        currentVersion: 1,
        sentences: [
          ...c.findings.map((f) => ({ text: f.statement, supportRefs: [`finding:${f.id}`] })),
          ...c.claims
            .filter((x) => x.outcome !== 'unassessed')
            .map((x) => ({
              text: `The claim that ${x.text} is ${x.outcome}.`,
              supportRefs: [`claim:${x.id}`],
            })),
        ],
        versions: [{ number: 1, createdBy: devName(), createdAt: now, hasPdf: false }],
        createdAt: now,
        updatedAt: now,
        etag: '"v0"',
      }
      db.briefs.unshift(b)
      audit('allowed', 'product.draft', c.ref)
      return b
    }),
  redraftBrief: (id, input, etag) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Drafting a brief')
      const b = briefAt(id)
      if (b.etag !== etag) refuse('precondition_failed', 'Someone changed this brief first.', 412)
      if (b.status === 'released') refuse('conflict', 'A released version cannot change.', 409)
      Object.assign(b, input, { updatedAt: new Date().toISOString() })
      b.etag = `"v${Number(b.etag.replace(/\D/g, '')) + 1}"`
      return b
    }),
  supportCheck: (id) => delay(() => mockSupportCheck(briefAt(id))),
  releaseBrief: (id, etag) =>
    delay(() => {
      requireRole(['reviewer', 'centre_lead'], 'Releasing a brief')
      const b = briefAt(id)
      if (b.etag !== etag) refuse('precondition_failed', 'Someone changed this brief first.', 412)
      if (b.authorId === me().id)
        refuse('self_approval_forbidden', 'You cannot release a brief you wrote.')
      const check = mockSupportCheck(b)
      if (!check.ready) refuse('unsupported_sentences', check.blockers.join(' '))
      const now = new Date().toISOString()
      b.status = 'released'
      b.versions = b.versions.map((v) =>
        v.number === b.currentVersion
          ? {
              ...v,
              releasedAt: now,
              releasedBy: devName(),
              sha256: 'mock'.padEnd(64, '0'),
              hasPdf: true,
            }
          : v,
      )
      const c = db.cases.find((x) => x.id === b.caseId)
      if (c) c.state = 'released'
      audit('allowed', 'product.release', b.title)
      return b
    }),
  // Offline there is no Gotenberg: a text file says so instead of a PDF.
  briefPdf: () =>
    delay(
      () =>
        new Blob(['PDFs are rendered by reporting and Gotenberg; mock mode has neither.'], {
          type: 'text/plain',
        }),
    ),

  reviews: () => delay(() => ({ items: db.reviews, nextCursor: null })),
  decideReview: (caseId, decision, comment) =>
    delay(() => {
      requireRole(['reviewer', 'supervisor', 'centre_lead'], 'Deciding a review')
      const r = db.reviews.find((x) => x.caseId === caseId)
      if (!r) refuse('not_found', 'Review not found', 404)
      if (r.authorId === session.getUserId())
        refuse('self_approval_forbidden', 'Reviewer cannot be the author', 403)
      db.reviews = db.reviews.filter((x) => x.caseId !== caseId)
      const c = db.cases.find((x) => x.id === caseId)
      if (c) c.state = decision === 'approve' ? 'approved' : 'returned'
      audit('allowed', 'review.decide', r.caseRef, `${decision}: ${comment}`)
    }),

  approvals: () => delay(() => ({ items: db.approvals, nextCursor: null })),
  decideApproval: (id, decision, comment) =>
    delay(() => {
      const a = db.approvals.find((x) => x.id === id)
      if (!a) refuse('not_found', 'Approval not found', 404)
      if (a.requesterId === session.getUserId())
        refuse('self_approval_forbidden', 'Requester cannot approve their own request')
      const step = a.steps.find((s) => !s.decision)
      if (!step) refuse('validation_failed', 'Approval already decided', 409)
      const role = session.getActiveRole()
      const allowed = step.role === role || (step.role === 'reviewer' && role === 'supervisor')
      if (!allowed)
        refuse(
          'capability_not_authorised',
          `This step needs the ${step.role.replace('_', ' ')} role`,
        )
      if (a.steps.some((s) => s.decidedBy === devName()))
        refuse('self_approval_forbidden', 'Approver 1 and approver 2 must be different people')
      step.decision = decision
      step.decidedBy = devName()
      step.decidedAt = new Date().toISOString()
      if (decision === 'refuse') a.status = 'refused'
      else if (a.steps.every((s) => s.decision === 'approve')) a.status = 'approved'
      audit('allowed', 'approval.decide', `${a.id.toUpperCase()} ${a.type}`, comment)
      return a
    }),

  policies: () => delay(() => db.policies),
  updatePolicy: (key, value, authorityRef) =>
    delay(() => {
      requireRole(['admin', 'centre_lead'], 'Changing a policy')
      const p = db.policies.find((x) => x.key === key)
      if (!p) refuse('not_found', 'Policy not found', 404)
      if (!authorityRef.trim())
        refuse('validation_failed', 'An authority reference is required', 422)
      Object.assign(p, {
        value,
        authorityRef,
        version: p.version + 1,
        changedBy: devName(),
        changedAt: new Date().toISOString(),
      })
      audit('allowed', 'policy.update', key, authorityRef)
      return p
    }),
  audit: (p) =>
    delay(() => {
      let items = db.audit
      if (p?.actor)
        items = items.filter((e) => e.actor.toLowerCase().includes(p.actor!.toLowerCase()))
      if (p?.action) items = items.filter((e) => e.action.startsWith(p.action!))
      return { items, nextCursor: null }
    }),

  search: (q, kind) =>
    delay(() => {
      const started = performance.now()
      const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
      const matches = fx.searchIndex.filter((h) => {
        const hay =
          `${h.id} ${h.title} ${h.summary} ${h.place} ${h.source} ${h.caseRef ?? ''} ${h.kind}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
      const facets = {
        person: 0,
        location: 0,
        news: 0,
        social: 0,
        media: 0,
        alert: 0,
        case: 0,
      } as Record<SearchKind, number>
      matches.forEach((m) => (facets[m.kind] += 1))
      return {
        items: kind ? matches.filter((m) => m.kind === kind) : matches,
        facets,
        tookMs: Math.round(performance.now() - started + 40 + Math.random() * 60),
      }
    }),
  item: (id) =>
    delay(() => {
      const hit = fx.searchIndex.find((h) => h.id === id) ?? fx.searchIndex[13]!
      const related = fx.searchIndex
        .filter((h) => h.id !== hit.id && (h.place === hit.place || h.caseRef === hit.caseRef))
        .slice(0, 6)
      const loc = fx.places[hit.place] ?? fx.places.Kaduna!
      return {
        ...hit,
        detail:
          'Source provenance and context must be verified. Indicators are advisory; this record does not infer identity or confirm any reported event.',
        images: [
          { id: 'img-1', caption: 'Primary frame · 00:21', hue: 190 },
          { id: 'img-2', caption: 'Crop · signage', hue: 28 },
          { id: 'img-3', caption: 'Archive match · 2024', hue: 210 },
          { id: 'img-4', caption: 'Wide · eastern gate', hue: 165 },
        ],
        similar: [
          {
            id: 'sim-1',
            title: 'Archived clip, Kano tanker fire (2024-03)',
            score: 0.91,
            firstSeen: '2024-03-14T10:22:00Z',
          },
          {
            id: 'sim-2',
            title: 'Repost with caption "Kaduna today"',
            score: 0.88,
            firstSeen: fx.ago(40),
          },
          {
            id: 'sim-3',
            title: 'Cropped variant, watermark removed',
            score: 0.79,
            firstSeen: fx.ago(25),
          },
          {
            id: 'sim-4',
            title: 'Unrelated warehouse fire, Onitsha',
            score: 0.41,
            firstSeen: '2025-11-02T08:10:00Z',
          },
        ],
        metadata: [
          { key: 'Captured', value: new Date(hit.at).toUTCString() },
          { key: 'Source', value: hit.source },
          { key: 'Container', value: 'MP4 · H.264 · 1280×720 · 29.97 fps' },
          { key: 'Duration', value: '01:24' },
          { key: 'EXIF / creation', value: 'Stripped by platform' },
          { key: 'SHA-256', value: '9f2c4a81…f9e2d5b' },
          { key: 'Custody events', value: '4 · sealed' },
          { key: 'Marking', value: hit.marking },
        ],
        entities: [
          { name: 'Kawo interchange', type: 'location', mentions: 9 },
          { name: 'Kaduna State Emergency Management Agency', type: 'organisation', mentions: 5 },
          { name: 'Tunde Okafor', type: 'person', mentions: 2 },
          { name: 'Fire at transport hub', type: 'event', mentions: 14 },
        ],
        locations: [
          { name: `${hit.place} (centroid)`, lat: loc.lat, lon: loc.lon, precision: 'confirmed' },
          {
            name: 'Kawo, Kaduna North',
            lat: loc.lat + 0.05,
            lon: loc.lon + 0.01,
            precision: 'estimated',
          },
        ],
        related,
      }
    }),

  wallState: () => delay(() => db.wall),
  putWallState: (state) =>
    delay(() => {
      if (state.revision !== db.wall.revision)
        refuse('precondition_failed', 'Wall state changed since you loaded it', 412)
      if (state.visitorMode !== db.wall.visitorMode)
        audit('allowed', 'wall.visitor-mode', state.visitorMode ? 'on' : 'off')
      else audit('allowed', 'wall.layout', `revision ${state.revision + 1}`)
      return bumpWall(state)
    }),
  wallPresets: () => delay(() => fx.wallPresets),
  activatePreset: (key) =>
    delay(() => {
      const preset = fx.wallPresets.find((p) => p.key === key)
      if (!preset) refuse('not_found', 'Preset not found', 404)
      const next = fx.stateFromPreset(preset, db.wall.revision, devName())
      audit('allowed', 'wall.preset.activate', key)
      return bumpWall({ ...next, visitorMode: db.wall.visitorMode })
    }),
  wallPublications: () => delay(() => db.publications),
  requestPublication: (input) =>
    delay(() => {
      const n = db.publications.length + 1
      const pub = {
        id: `wq-${1100 + n}`,
        ref: `WQ-${1100 + n}`,
        ...input,
        requestedBy: devName(),
        requestedAt: new Date().toISOString(),
        status: 'pending' as const,
      }
      db.publications.unshift(pub)
      audit('allowed', 'wall.publication.request', `${pub.ref} ${input.content}`)
      return pub
    }),
  decidePublication: (id, decision) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Deciding a wall request')
      const pub = db.publications.find((p) => p.id === id)
      if (!pub) refuse('not_found', 'Request not found', 404)
      pub.status = decision === 'approve' ? 'approved' : 'rejected'
      if (decision === 'approve') {
        const targets = new Set(pub.targets)
        bumpWall({
          ...db.wall,
          preset: 'custom',
          groups: db.wall.groups.map((g) =>
            g.cells.some((c) => targets.has(c)) ? { ...g, content: pub.content } : g,
          ),
          screens: db.wall.screens.map((s) =>
            targets.has(s.index) ? { ...s, content: pub.content, contextRef: pub.contextRef } : s,
          ),
        })
      }
      audit('allowed', 'wall.publication.decide', `${pub.ref} ${decision}`)
      return pub
    }),
}
