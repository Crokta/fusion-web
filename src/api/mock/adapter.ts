import type { FusionApi } from '../contract'
import { ApiError, type ProblemCode } from '../problem'
import { session } from '../session'
import { alertReference, cctvRefusalText } from '../adapters'
import type {
  MissionTemplate,
  MissionTemplateInput,
  Alert,
  Brief,
  ReviewHistoryEntry,
  BriefRecipient,
  Lesson,
  LessonInput,
  OutcomePeriod,
  Outcomes,
  CaptureRequest,
  CaseMatrix,
  CctvRequest,
  CctvRequestInput,
  EvidenceItem,
  MatrixFlag,
  Delivery,
  DeliveryChannel,
  DutyShift,
  DutyTier,
  CaseDetail,
  SupportCheck,
  LiveEventMap,
  LiveEventName,
  Me,
  ProviderReport,
  Role,
  SearchKind,
  SourceApproveResult,
  SourceImportResult,
  SourceRecord,
  StoryGroup,
  WallControllerStatus,
  WallLayoutPublication,
  WallPreset,
  WallState,
} from '../types'
import * as fx from './fixtures'
import { nameMocks } from './names'
import { leadershipMocks } from './leadership'
import { displayMocks } from './display'
import { geoMocks } from './geo'
import { retentionMocks } from './retention'

/**
 * In-memory gateway. It keeps the same rules the real services enforce — reviewer is not the
 * author, roles gate actions, wall publication needs a supervisor — so the UI's own checks are
 * exercised against a server that would refuse, not one that always says yes.
 */

const clone = <T>(v: T): T => structuredClone(v)

/** A month of Bright Data use for the two social fixtures and one blocked site. */
function mockProvider(): ProviderReport {
  const now = new Date()
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now.getTime() - (29 - i) * 86_400_000)
    return {
      date: d.toISOString().slice(0, 10),
      scraper: i < 26 ? 0 : 10 + (i % 3) * 10,
      unlocker: i < 27 ? 0 : 6,
    }
  })
  const terms = {
    maxPosts: null,
    minIntervalMinutes: null,
    paused: false,
    updatedBy: null,
    updatedAt: null,
  }
  return {
    provider: 'brightdata',
    configured: true,
    unlockerZone: 'fusion_unlocker',
    defaults: { maxPosts: 10, waitSeconds: 150, unlockerBlockedHours: 6 },
    budget: {
      monthlyCreditCap: 2000,
      usedThisMonth: 138,
      scraperThisMonth: 120,
      unlockerThisMonth: 18,
      left: 1862,
      monthStarts: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
      updatedBy: 'u-musa',
      updatedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
    },
    days,
    sources: [
      {
        sourceId: 'src-social-x',
        creditsThisMonth: 100,
        jobsThisMonth: 10,
        lastJobAt: new Date(now.getTime() - 22 * 60_000).toISOString(),
        terms: { ...terms },
        pendingSnapshot: null,
      },
      {
        sourceId: 'src-social-fb',
        creditsThisMonth: 20,
        jobsThisMonth: 2,
        lastJobAt: new Date(now.getTime() - 47 * 60_000).toISOString(),
        terms: { ...terms, paused: true, updatedBy: 'u-musa', updatedAt: now.toISOString() },
        pendingSnapshot: null,
      },
    ],
    hosts: [
      { host: 'blocked-daily.example.ng', creditsThisMonth: 18, unlockedForSeconds: 4 * 3600 },
    ],
  }
}

const db = {
  provider: mockProvider(),
  cases: clone(fx.caseSummaries),
  feed: clone(fx.storyGroups),
  triage: clone(fx.triageItems),
  sources: clone(fx.sources),
  briefs: [] as Brief[],
  /** Assessment written in this session, laid over the fixture case. */
  assessment: new Map<string, Partial<CaseDetail>>(),
  alerts: clone(fx.alerts),
  shifts: [] as DutyShift[],
  messages: [] as Delivery[],
  reviews: clone(fx.reviews),
  /** Review decisions made in this session, per case, newest first (E34). */
  reviewHistory: new Map<string, ReviewHistoryEntry[]>(),
  approvals: clone(fx.approvals),
  policies: clone(fx.policies),
  audit: clone(fx.auditEvents),
  publications: clone(fx.wallPublications),
  wall: fx.stateFromPreset(fx.wallPresets[0]!, 16, 'Zainab Bello'),
  /** Stored presets (E33): the standard four, then those saved in this session. */
  presets: clone(fx.wallPresets) as WallPreset[],
  layoutPublications: [] as WallLayoutPublication[],
  /** The simulated wall controller, as reporting's simulator keeps it (ADR 0015). */
  controller: {
    adapter: 'simulator',
    online: true,
    inputsMuted: false,
    routes: [],
    log: [],
  } as WallControllerStatus,
  signals: 0,
  /** Evidence added in this session (E26), per case, laid over the fixture's. */
  added: new Map<string, EvidenceItem[]>(),
  /** The uploaded files themselves, for the working copy. */
  files: new Map<string, { url: string; contentType: string; size: number; name: string }>(),
  captures: [] as CaptureRequest[],
  cctv: [] as CctvRequest[],
}

/**
 * What media would say about an upload, without a model: a file named like a generator's output
 * reads as AI-generated, anything else as authentic, so both colours can be tried in the mock.
 */
const mockVerdict = (name: string) =>
  /(ai|generated|synthetic|dall|midjourney|stable|flux)/i.test(name)
    ? { verdict: 'LikelySynthetic', confidence: 0.93 }
    : { verdict: 'LikelyAuthentic', confidence: 0.04 }

const kindOf = (contentType: string): EvidenceItem['kind'] =>
  contentType.startsWith('image/')
    ? 'image'
    : contentType.startsWith('video/')
      ? 'video'
      : contentType.startsWith('audio/')
        ? 'audio'
        : 'document'

// A day's roster around now, and the notices the fixture alerts would have sent.
{
  const h = 3600_000
  const start = new Date(Math.floor(Date.now() / h) * h - 4 * h)
  const end = new Date(start.getTime() + 12 * h)
  const on = (tier: DutyTier, p: { id: string; name: string }, email?: string, phone?: string) =>
    db.shifts.push({
      id: `sh-${tier}-${p.id}`,
      tier,
      userId: p.id,
      name: p.name,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      email,
      phone,
      createdBy: fx.people.zainab.name,
    })
  on('analyst', fx.people.dirk, 'dirk.adebayo@fusion.local', '+2348031234567')
  on('analyst', fx.people.amaka, 'amaka.nwosu@fusion.local')
  on('supervisor', fx.people.zainab, 'zainab.bello@fusion.local', '+9990000001')
  on('centre_lead', fx.people.halima, 'halima.yusuf@fusion.local')
  for (const a of db.alerts) {
    for (const shift of db.shifts.filter((s) => s.tier === 'analyst')) {
      const channels: DeliveryChannel[] = [
        'in_app',
        'email',
        ...(shift.phone ? ['sms' as const] : []),
      ]
      for (const channel of channels)
        db.messages.push(composeMessage(a, shift, channel, a.status === 'acknowledged'))
    }
  }
}

function composeMessage(
  a: Alert,
  to: DutyShift,
  channel: DeliveryChannel,
  read: boolean,
): Delivery {
  const reference = alertReference(a.id)
  return {
    id: `msg-${a.id}-${to.userId}-${channel}`,
    alertId: a.id,
    reference,
    level: a.escalationLevel,
    recipientId: to.userId,
    recipientName: to.name,
    channel,
    address: channel === 'email' ? to.email : channel === 'sms' ? to.phone : undefined,
    subject: `[${a.severity.toUpperCase()}] Homeland Fusion Centre alert ${reference}`,
    link: `${location.origin}/alerts/${a.id}`,
    status: 'sent',
    attempts: 1,
    createdAt: a.raisedAt,
    sentAt: a.raisedAt,
    readAt: read ? a.raisedAt : undefined,
  }
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

const tierAt = (level: number): DutyTier =>
  level <= 0 ? 'analyst' : level === 1 ? 'supervisor' : 'centre_lead'

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
    ...(b.status === 'draft' && c.state !== 'approved'
      ? ['The case must be Approved before its product is released.']
      : []),
    // A correction is of a brief already out: the case's findings must still stand (ADR 0017).
    ...(b.status === 'correcting' && !['approved', 'released', 'closed'].includes(c.state)
      ? [
          "The case's findings must stand (Approved, Released or Closed) for a correction to be released.",
        ]
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
  return {
    ...base,
    ...db.assessment.get(base.id),
    evidence: [...base.evidence, ...(db.added.get(base.id) ?? [])],
    state: live?.state ?? base.state,
    category: live?.category ?? base.category,
  }
}

function addEvidence(caseId: string, item: EvidenceItem) {
  db.added.set(caseId, [...(db.added.get(caseId) ?? []), item])
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

/** A preset key from its name, as reporting makes it: "Night shift (north)" → night-shift-north. */
const presetKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')

function controllerNote(command: string, detail: string) {
  db.controller.log = [
    { at: new Date().toISOString(), command, detail, accepted: true },
    ...db.controller.log,
  ].slice(0, 50)
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

// ---------------------------------------------------------------- CCTV requests (E31, ADR 0014)

const CCTV_CAMERAS = ['cam-kawo-01', 'cam-kawo-02', 'cam-ikeja-01', 'cam-ikeja-02', 'cam-ikeja-03']
const LAWFUL_BASES = [
  { code: 'prevention_of_crime', label: 'Prevention or detection of crime' },
  { code: 'national_security', label: 'National security' },
  { code: 'protection_of_life', label: 'Protection of life' },
  { code: 'public_safety', label: 'Public safety' },
]
const FACE_WORDS = ['face', 'facial', 'biometric', 'iris', 'faceprint']

function cctvFieldErrors(input: CctvRequestInput, complete: boolean): Record<string, string[]> {
  const errors: Record<string, string[]> = {}
  const add = (field: string, message: string) => (errors[field] ??= []).push(message)
  const start = input.windowStart ? Date.parse(input.windowStart) : undefined
  const end = input.windowEnd ? Date.parse(input.windowEnd) : undefined
  if (start !== undefined && end !== undefined) {
    if (end <= start) add('windowEnd', 'The window must end after it starts.')
    else if (end - start > 24 * 3600_000) add('windowEnd', 'The window may be at most 24 hours.')
  }
  if (input.attributes.some((a) => FACE_WORDS.some((w) => a.toLowerCase().includes(w))))
    add('attributes', 'Facial or biometric attributes cannot be searched.')
  if (!complete) return errors
  if (start === undefined) add('windowStart', 'Say when the window starts.')
  if (end === undefined) add('windowEnd', 'Say when the window ends.')
  if (input.cameras.length === 0) add('cameras', 'Name at least one camera.')
  if (!input.lawfulBasis) add('lawfulBasis', 'Choose the lawful basis for the search.')
  if ((input.reason ?? '').trim().length < 20)
    add('reason', 'Say why the footage is needed, in at least 20 characters.')
  return errors
}

function cctvInvalid(errors: Record<string, string[]>): void {
  if (Object.keys(errors).length === 0) return
  audit('refused', 'cctv.request', 'validation_failed')
  throw new ApiError({
    title: 'Some fields need attention.',
    status: 400,
    code: 'validation_failed',
    errors,
    traceId: crypto.randomUUID(),
  })
}

function cctvGate(action: string) {
  requireRole(['analyst', 'supervisor'], 'Requesting CCTV footage')
  if (!db.policies.find((p) => p.key === 'cctv_search_enabled')?.value)
    refuse('capability_not_authorised', 'CCTV search is switched off by policy.', 403, action)
}

function cctvBump(r: CctvRequest) {
  r.etag = `"v${Number(r.etag.slice(2, -1)) + 1}"`
}

function ownCctv(id: string, etag?: string): CctvRequest {
  const r = db.cctv.find((x) => x.id === id)
  const role = session.getActiveRole()
  if (!r || (r.requesterId !== me().id && role !== 'supervisor'))
    refuse('not_found', 'Request not found', 404)
  if (r.requesterId !== me().id)
    refuse('forbidden', 'Only the analyst who drafted a request can change or submit it.')
  if (etag && etag !== r.etag)
    refuse('precondition_failed', 'This changed since you loaded it.', 412)
  return r
}

/** governance's ApprovalCompleted, as cctv's consumer applies it. */
function settleCctv(approvalId: string, status: string) {
  const r = db.cctv.find((x) => x.approvalId === approvalId)
  if (!r || r.status !== 'awaiting_approval') return
  if (status === 'approved') r.status = 'approved'
  else if (status === 'refused') {
    r.status = 'refused'
    r.refusalCode = 'approver_refused'
    r.refusal = cctvRefusalText('approver_refused')
  } else return
  r.decidedAt = new Date().toISOString()
  cctvBump(r)
}

// Retention, legal holds, disposal and integrity runs (E39, ADR 0021).
const retention = retentionMocks({
  delay,
  refuse,
  requireRole,
  audit,
  me,
  role: () => session.getActiveRole(),
  approvals: () => db.approvals,
})

export const mockApi: FusionApi = {
  ...retention.api,
  // Geo: gazetteer, locations and map layers (E32, ADR 0018).
  ...geoMocks({ delay, refuse, audit, role: () => session.getActiveRole(), me }),
  // Name-of-interest searches (E30, ADR 0013).
  ...nameMocks({
    delay,
    refuse,
    requireRole,
    audit,
    role: () => session.getActiveRole(),
    me,
    piOn: () => !!db.policies.find((p) => p.key === 'pi_search_enabled')?.value,
  }),
  // Leadership questions, requirements and feedback (E37, ADR 0020).
  ...leadershipMocks({ delay, refuse, requireRole, audit, me, briefs: () => db.briefs }),
  // Review history and the wall renderer (E34, ADR 0019).
  ...displayMocks({
    delay,
    refuse,
    requireRole,
    audit,
    me,
    briefs: () => db.briefs,
    wall: () => db.wall,
    layoutPublications: () => db.layoutPublications,
    history: (caseId) => db.reviewHistory.get(caseId) ?? [],
  }),
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
        collection: { lastCrawlAt: null, lastStoryAt: null, lastError: null, lastErrorAt: null },
      }
      db.sources.unshift(s)
      audit('allowed', 'source.propose', s.name)
      return s
    }),
  importSources: (items) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Proposing sources')
      const key = (u: string) => {
        const x = new URL(u)
        return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/$/, '')}${x.search}`
      }
      const seen = new Set(db.sources.map((s) => key(s.url)))
      const result: SourceImportResult = { created: [], skipped: [], invalid: [] }
      items.forEach((input, index) => {
        if (!input.name?.trim())
          return result.invalid.push({ index, field: 'name', message: 'A source needs a name.' })
        let k: string
        try {
          k = key(input.url)
        } catch {
          return result.invalid.push({
            index,
            field: 'url',
            message: 'Not an http or https address.',
          })
        }
        if (seen.has(k)) return result.skipped.push({ index, url: input.url, reason: 'duplicate' })
        seen.add(k)
        const s: SourceRecord = {
          id: `src-${crypto.randomUUID()}`,
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
          collection: { lastCrawlAt: null, lastStoryAt: null, lastError: null, lastErrorAt: null },
        }
        db.sources.unshift(s)
        result.created.push(s)
      })
      audit('allowed', 'source.import', `${result.created.length} proposed`)
      return clone(result)
    }),
  approveSources: (items) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Approving sources')
      const result: SourceApproveResult = { approved: [], refused: [] }
      for (const { id, version } of items) {
        const s = db.sources.find((x) => x.id === id)
        if (!s) result.refused.push({ id, code: 'not_found', message: 'No such source.' })
        else if (s.etag !== `"v${version}"`)
          result.refused.push({
            id,
            code: 'precondition_failed',
            message: 'Changed since you looked.',
          })
        else if (s.status !== 'proposed')
          result.refused.push({
            id,
            code: 'conflict',
            message: 'Only a proposed source can be approved.',
          })
        else if (s.proposedBy.id === me().id)
          result.refused.push({ id, code: 'self_approval_forbidden', message: 'You proposed it.' })
        else {
          Object.assign(s, {
            status: 'approved',
            approvedBy: me(),
            approvedAt: new Date().toISOString(),
          })
          bumpSource(s)
          result.approved.push(clone(s))
        }
      }
      audit('allowed', 'source.approve', `${result.approved.length} approved`)
      return result
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
          collection: { lastCrawlAt: null, lastStoryAt: null, lastError: null, lastErrorAt: null },
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
  alert: (id) =>
    delay(() => {
      const a = db.alerts.find((x) => x.id === id)
      if (!a) refuse('not_found', 'Alert not found', 404)
      return { ...a, reference: alertReference(a.id), tier: tierAt(a.escalationLevel) }
    }),
  alertDeliveries: (id) => delay(() => db.messages.filter((m) => m.alertId === id)),
  notifications: (p) =>
    delay(() =>
      db.messages
        .filter((m) => m.channel === 'in_app' && m.recipientId === me().id)
        .filter((m) => !p?.unread || !m.readAt)
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
    ),
  markNotificationRead: (id) =>
    delay(() => {
      const m = db.messages.find((x) => x.id === id && x.recipientId === me().id)
      if (!m) refuse('not_found', 'No such notification', 404)
      m.readAt ??= new Date().toISOString()
      return m
    }),
  dutyRoster: () =>
    delay(() => [...db.shifts].sort((x, y) => x.startsAt.localeCompare(y.startsAt))),
  onDutyNow: () =>
    delay(() => {
      const now = Date.now()
      return (['analyst', 'supervisor', 'centre_lead'] as DutyTier[]).map((tier) => ({
        tier,
        people: db.shifts.filter(
          (s) => s.tier === tier && Date.parse(s.startsAt) <= now && now < Date.parse(s.endsAt),
        ),
      }))
    }),
  addShift: (input) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Managing the duty roster')
      const hours = (Date.parse(input.endsAt) - Date.parse(input.startsAt)) / 3600_000
      if (!(hours > 0)) refuse('validation_failed', 'A shift ends after it starts', 400)
      if (hours > 24) refuse('validation_failed', 'A shift is at most 24 hours', 400)
      const shift: DutyShift = { ...input, id: `sh-${crypto.randomUUID()}`, createdBy: devName() }
      db.shifts.push(shift)
      audit('allowed', 'roster.add', `${shift.name} · ${shift.tier}`)
      return shift
    }),
  caseMedia: (caseId) =>
    delay(() => {
      const media = liveCase(caseId).evidence.filter(
        (e) => e.kind === 'image' || e.kind === 'video',
      )
      return media.map((e, i) => {
        const file = db.files.get(e.id)
        if (file) {
          const { verdict, confidence } = mockVerdict(file.name)
          return {
            jobId: `job-${e.id}`,
            evidenceId: e.id,
            contentType: file.contentType,
            status: 'screened' as const,
            requestedAt: e.capturedAt,
            screenedAt: e.capturedAt,
            failure: null,
            c2paPresent: false,
            verdict,
            confidence,
            indicators: [
              {
                detector: 'synthetic-image-a',
                modelVersion: 'commfor-vit-s16-384 (mock)',
                verdict,
                confidence,
              },
            ],
          }
        }
        return {
          jobId: `job-${e.id}`,
          evidenceId: e.id,
          contentType: e.kind === 'image' ? 'image/jpeg' : 'video/mp4',
          status: i === 0 ? ('screened' as const) : ('requested' as const),
          requestedAt: new Date(Date.now() - 3600_000).toISOString(),
          screenedAt: i === 0 ? new Date(Date.now() - 3500_000).toISOString() : null,
          failure: null,
          c2paPresent: i === 0 ? false : null,
          verdict: i === 0 ? 'Inconclusive' : null,
          confidence: null,
          indicators:
            i === 0
              ? [
                  {
                    detector: 'stub',
                    modelVersion: '0.0.0-stub',
                    verdict: 'Inconclusive',
                    confidence: null,
                  },
                ]
              : [],
        }
      })
    }),
  mediaAnalysis: (evidenceId) =>
    delay(() => ({
      evidenceId,
      job: {
        id: `job-${evidenceId}`,
        kind: 'screen' as const,
        status: 'completed' as const,
        receivedAt: new Date(Date.now() - 3600_000).toISOString(),
        completedAt: new Date(Date.now() - 3500_000).toISOString(),
        failure: null,
        detectorsRun: true,
        note: null,
      },
      role: 'image',
      sourceUrl: 'https://example-desk.ng/2026/10/28/market-fire',
      contentType: 'image/jpeg',
      sizeBytes: 482_113,
      sha256: 'a3f1c9e2b7d4'.padEnd(64, '0'),
      sha256Verified: true,
      mediaKind: 'image' as const,
      metadata: {
        format: 'JPEG',
        width: 1600,
        height: 1067,
        durationSeconds: null,
        videoCodec: null,
        audioCodec: null,
        frameRate: null,
        cameraMake: null,
        cameraModel: null,
        capturedAt: null,
        software: null,
        exifPresent: false,
        xmpPresent: false,
        metadataStripped: true,
        location: { present: false, latitude: null, longitude: null },
      },
      c2pa: {
        status: 'absent' as const,
        claimGenerator: null,
        signedBy: null,
        digitalSourceType: null,
        aiGenerated: null,
        validationErrors: [],
      },
      fingerprints: [
        { kind: 'sha256', value: 'a3f1c9e2b7d4'.padEnd(64, '0'), atSeconds: null },
        { kind: 'phash', value: 'c3a1e0f07c3e1f0f', atSeconds: null },
      ],
      indicators: [
        {
          detector: 'stub',
          modelVersion: '0.0.0-stub',
          verdict: 'Inconclusive',
          confidence: null,
          limitations: 'No model yet (E21).',
        },
      ],
      combined: { verdict: 'Inconclusive', confidence: null },
    })),
  workingCopy: (evidenceId) =>
    delay(() => {
      audit('allowed', 'evidence.working_copy.read', evidenceId)
      const file = db.files.get(evidenceId)
      if (file)
        return {
          url: file.url,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          contentType: file.contentType,
          sizeBytes: file.size,
        }
      const svg =
        "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'><rect width='640' height='400' fill='%23132433'/><text x='50%' y='50%' fill='%237f97a8' font-family='sans-serif' font-size='20' text-anchor='middle'>Working copy (mock)</text></svg>"
      return {
        url: `data:image/svg+xml;utf8,${svg}`,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        contentType: 'image/svg+xml',
        sizeBytes: svg.length,
      }
    }),
  uploadEvidence: async (caseId, file, onProgress) => {
    requireRole(['analyst', 'supervisor', 'evidence_officer'], 'Adding evidence')
    const c = liveCase(caseId)
    for (const share of [0.3, 0.7, 1]) {
      await new Promise((r) => setTimeout(r, 120))
      onProgress?.({ loaded: Math.round(file.size * share), total: file.size })
    }
    const contentType = file.type || 'application/octet-stream'
    const id = crypto.randomUUID()
    db.files.set(id, {
      url: URL.createObjectURL(file),
      contentType,
      size: file.size,
      name: file.name,
    })
    addEvidence(c.id, {
      id,
      ref: `EV-${id.slice(-6).toUpperCase()}`,
      kind: kindOf(contentType),
      title: file.name,
      source: `Uploaded by ${devName()}`,
      capturedAt: new Date().toISOString(),
      sha256: crypto.randomUUID().replace(/-/g, '').padEnd(64, '0'),
      custodyEvents: 1,
      marking: 'OFFICIAL',
      label: `Upload · ${file.name}`,
      timestamped: true,
    })
    audit('allowed', 'evidence.upload.commit', `${c.ref} · ${file.name}`)
    return { evidenceId: id }
  },
  captureLink: (caseId, url, includeMedia) =>
    delay(() => {
      requireRole(['analyst', 'supervisor', 'evidence_officer'], 'Adding evidence')
      const c = liveCase(caseId)
      const capture: CaptureRequest = {
        id: crypto.randomUUID(),
        url,
        caseId: c.id,
        status: 'requested',
        failureReason: null,
        evidenceId: null,
        requestedAt: new Date().toISOString(),
      }
      db.captures.push(capture)
      audit(
        'allowed',
        'evidence.capture.request',
        `${c.ref} · ${url}${includeMedia ? ' (+media)' : ''}`,
      )
      return capture
    }),
  capture: (id) =>
    delay(() => {
      const capture = db.captures.find((x) => x.id === id)
      if (!capture) refuse('not_found', 'No such capture.', 404)
      // Collector takes a few seconds: complete it on the first look after that.
      if (
        capture.status === 'requested' &&
        Date.now() - new Date(capture.requestedAt).getTime() > 4_000
      ) {
        const evidenceId = crypto.randomUUID()
        addEvidence(capture.caseId!, {
          id: evidenceId,
          ref: `EV-${evidenceId.slice(-6).toUpperCase()}`,
          kind: 'web-capture',
          title: capture.url,
          source: new URL(capture.url).host,
          capturedAt: new Date().toISOString(),
          sha256: crypto.randomUUID().replace(/-/g, '').padEnd(64, '0'),
          custodyEvents: 1,
          marking: 'OFFICIAL',
          label: 'Web archive (WARC)',
          link: capture.url,
          timestamped: true,
        })
        capture.status = 'completed'
        capture.evidenceId = evidenceId
      }
      return capture
    }),
  provider: () =>
    delay(() => {
      requireRole(['analyst', 'supervisor', 'centre_lead', 'admin'], 'Reading collection spend')
      return clone(db.provider)
    }),
  setProviderBudget: (monthlyCreditCap) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Setting the Bright Data budget')
      const b = db.provider.budget
      Object.assign(b, {
        monthlyCreditCap,
        left: monthlyCreditCap === null ? null : Math.max(monthlyCreditCap - b.usedThisMonth, 0),
        updatedBy: me().id,
        updatedAt: new Date().toISOString(),
      })
      audit(
        'allowed',
        'provider.budget',
        monthlyCreditCap === null ? 'no cap' : `${monthlyCreditCap}`,
      )
      return clone(b)
    }),
  setProviderTerms: (sourceId, input) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Changing a source’s Bright Data terms')
      let row = db.provider.sources.find((x) => x.sourceId === sourceId)
      if (!row) {
        row = {
          sourceId,
          creditsThisMonth: 0,
          jobsThisMonth: 0,
          lastJobAt: null,
          terms: {
            maxPosts: null,
            minIntervalMinutes: null,
            paused: false,
            updatedBy: null,
            updatedAt: null,
          },
          pendingSnapshot: null,
        }
        db.provider.sources.push(row)
      }
      row.terms = { ...input, updatedBy: me().id, updatedAt: new Date().toISOString() }
      audit('allowed', 'provider.source_terms', sourceId)
      return clone(row.terms)
    }),
  clearProviderHost: (host) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Clearing a blocked host')
      const h = db.provider.hosts.find((x) => x.host === host)
      if (h) h.unlockedForSeconds = null
      audit('allowed', 'provider.host_cleared', host)
    }),
  removeShift: (id) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Managing the duty roster')
      const i = db.shifts.findIndex((s) => s.id === id)
      if (i < 0) refuse('not_found', 'Shift not found', 404)
      const [gone] = db.shifts.splice(i, 1)
      audit('allowed', 'roster.remove', `${gone!.name} · ${gone!.tier}`)
    }),
  searchPeople: (q) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Searching the directory')
      const text = q.trim().toLowerCase()
      if (text.length < 2) return []
      return Object.values(fx.people)
        .filter((p) => p.name.toLowerCase().includes(text))
        .map((p) => ({
          id: p.id,
          name: p.name,
          email: `${p.name.toLowerCase().replace(/\s+/g, '.')}@fusion.local`,
        }))
    }),
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
  setChecklistItem: (id, key, done, note) =>
    delay(() =>
      assess(id, 'case.checklist', (c) => ({
        checklist: c.checklist.map((i) =>
          (i.key ?? i.label) === key
            ? {
                ...i,
                done,
                doneBy: done ? devName() : undefined,
                ...(note === undefined
                  ? {}
                  : {
                      note: note.trim() || undefined,
                      noteBy: note.trim() ? devName() : undefined,
                    }),
              }
            : i,
        ),
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
  caseMatrix: (caseId) =>
    delay((): CaseMatrix => {
      const c = liveCase(caseId)
      const rows = [
        ...c.findings.map((f) => ({
          id: f.id,
          kind: 'finding' as const,
          text: f.statement,
          assessment: f.confidence as string,
          cites: [...f.evidenceIds, ...(f.statementIds ?? [])],
        })),
        ...c.claims.map((x) => ({
          id: x.id,
          kind: 'claim' as const,
          text: x.text,
          assessment: x.outcome as string,
          cites: [...(x.evidenceIds ?? []), ...(x.statementIds ?? [])],
        })),
      ]
      // The same verdicts the mock's screenings give: uploads by name, fixture photos authentic.
      const verdictOf = (e: EvidenceItem) => {
        const file = db.files.get(e.id)
        if (file) return mockVerdict(file.name)
        return e.kind === 'image' ? { verdict: 'LikelyAuthentic', confidence: 0.05 } : null
      }
      const synthetic = new Set(
        c.evidence.filter((e) => verdictOf(e)?.verdict === 'LikelySynthetic').map((e) => e.id),
      )
      const citedBy = (id: string) => rows.filter((r) => r.cites.includes(id)).length
      return {
        caseId: c.id,
        sources: [
          ...c.evidence.map((e) => {
            const v = verdictOf(e)
            return {
              id: e.id,
              kind: 'original' as const,
              label: null,
              contentType: null,
              at: e.capturedAt,
              screeningStatus: v ? ('screened' as const) : null,
              verdict: v?.verdict ?? null,
              confidence: v?.confidence ?? null,
              citedBy: citedBy(e.id),
            }
          }),
          ...(c.statements ?? []).map((st) => ({
            id: st.id,
            kind: 'statement' as const,
            label: st.speaker,
            contentType: null,
            at: st.givenAt ?? st.recordedAt,
            screeningStatus: null,
            verdict: null,
            confidence: null,
            citedBy: citedBy(st.id),
          })),
        ],
        rows: rows.map((r) => {
          const flags: MatrixFlag[] = []
          if (r.cites.length === 0) flags.push('unsupported')
          if (r.cites.some((id) => synthetic.has(id))) flags.push('cites_likely_synthetic')
          return { ...r, flags }
        }),
      }
    }),
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
      // Optional lines never hold up Submit (E29, ADR 0012).
      const open = liveCase(id).checklist.filter((i) => !i.done && i.required !== false)
      if (open.length > 0)
        refuse(
          'requirement_missing',
          'Mission checklist incomplete',
          403,
          `The mission checklist has required lines open: ${open.map((i) => i.label).join('; ')}.`,
        )
      c.state = 'submitted'
      audit('allowed', 'case.submit', c.ref)
      return { ...detail, state: c.state }
    }),

  briefs: (p) =>
    delay(() => ({
      items: db.briefs.filter(
        (b) =>
          (!p?.caseId || b.caseId === p.caseId) &&
          (!p?.status?.length || p.status.includes(b.status)),
      ),
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
          ...c.findings.map((f) => ({
            text: f.statement,
            supportRefs: [`finding:${f.id}`],
            section: 'Key judgements',
          })),
          ...c.claims
            .filter((x) => x.outcome !== 'unassessed')
            .map((x) => ({
              text: `The claim that ${x.text} is ${x.outcome}.`,
              supportRefs: [`claim:${x.id}`],
              section: 'Claims assessed',
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
      if (b.status === 'released') refuse('conflict', 'This version is already released.', 409)
      if (b.authorId === me().id)
        refuse('self_approval_forbidden', 'You cannot release a brief you wrote.')
      const correcting = b.status === 'correcting'
      if (correcting && e38.correctors.get(b.id) === me().id)
        refuse('self_approval_forbidden', 'You cannot release a correction you opened.')
      const check = mockSupportCheck(b)
      if (!check.ready) refuse('unsupported_sentences', check.blockers.join(' '))
      const now = new Date().toISOString()
      const working = b.versions.find((v) => v.number === b.currentVersion)
      b.status = 'released'
      b.versions = b.versions.map((v) =>
        v.number === b.currentVersion
          ? {
              ...v,
              releasedAt: now,
              releasedBy: devName(),
              sha256: `mock${b.currentVersion}`.padEnd(64, '0'),
              hasPdf: true,
            }
          : v.number === working?.correctsVersion
            ? { ...v, supersededBy: b.currentVersion, supersededAt: now }
            : v,
      )
      if (correcting) {
        holds(b, e38.correctors.get(b.id) ?? me().id, 'corrector')
        holds(b, me().id, 'releaser')
        e38.facts.push({ kind: 'correction', at: now, seconds: 3 * 3600 })
        audit('allowed', 'product.correction.release', b.title)
        return b
      }
      holds(b, b.authorId, 'author')
      holds(b, me().id, 'releaser')
      e38.facts.push({ kind: 'release', at: now, seconds: 5 * 3600 })
      const c = db.cases.find((x) => x.id === b.caseId)
      if (c) c.state = 'released'
      audit('allowed', 'product.release', b.title)
      return b
    }),
  // Offline there is no Gotenberg: a text file says so instead of a PDF.
  briefPdf: (id, version) =>
    delay(() => {
      // Whoever downloads a released version holds the brief (ADR 0017).
      const b = db.briefs.find((x) => x.id === id)
      if (b && version) holds(b, me().id, 'download', version)
      return new Blob(['PDFs are rendered by reporting and Gotenberg; mock mode has neither.'], {
        type: 'text/plain',
      })
    }),
  correctBrief: (id, reason, etag) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Correcting a brief')
      const b = briefAt(id)
      if (b.etag !== etag) refuse('precondition_failed', 'Someone changed this brief first.', 412)
      if (b.status === 'draft')
        refuse(
          'not_released',
          'Only a released brief is corrected; this one is still a draft.',
          409,
        )
      if (b.status === 'correcting')
        refuse(
          'correction_open',
          `Version ${b.currentVersion} is already a correction in progress.`,
          409,
        )
      if (!reason.trim()) refuse('validation_failed', 'Say why the brief is being corrected.', 400)
      const now = new Date().toISOString()
      b.currentVersion += 1
      b.status = 'correcting'
      b.versions.push({
        number: b.currentVersion,
        createdById: me().id,
        createdBy: devName(),
        createdAt: now,
        hasPdf: false,
        correctsVersion: b.currentVersion - 1,
        correctionReason: reason.trim(),
      })
      b.updatedAt = now
      b.etag = `"v${Number(b.etag.replace(/\D/g, '')) + 1}"`
      e38.correctors.set(b.id, me().id)
      audit('allowed', 'product.correction.open', b.title)
      return b
    }),
  briefDistribution: (id) => delay(() => (briefAt(id), e38.recipients.get(id) ?? [])),

  closeCase: (id) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Closing a case')
      const c = db.cases.find((x) => x.id === id)
      if (!c) refuse('not_found', 'Case not found', 404)
      if (c.state !== 'released') refuse('conflict', `A ${c.state} case cannot be closed.`, 409)
      c.state = 'closed'
      audit('allowed', 'case.close', c.ref)
      return liveCase(id)
    }),
  lessons: (p) =>
    delay(() =>
      e38.lessons.filter(
        (l) =>
          (!p?.caseId || l.caseId === p.caseId) &&
          (!p?.templateKey || l.templateKey === p.templateKey),
      ),
    ),
  recordLesson: (caseId, input) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Recording a lesson')
      const c = liveCase(caseId)
      if (c.state !== 'closed')
        refuse(
          'requirement_missing',
          `Lessons are recorded once the case is closed: ${c.ref} is ${c.state.replace('_', ' ')}.`,
        )
      lessonValid(input)
      const now = new Date().toISOString()
      const l: Lesson = {
        id: `ls-${Date.now()}`,
        caseId,
        caseRef: c.ref,
        title: input.title.trim(),
        observation: input.observation.trim(),
        recommendation: input.recommendation.trim(),
        templateKey: input.templateKey?.trim() || c.mission?.templateKey || 'default',
        recordedById: me().id,
        recordedBy: devName(),
        recordedAt: now,
        updatedAt: now,
        etag: '"v0"',
      }
      e38.lessons.unshift(l)
      e38.facts.push({ kind: 'lesson', at: now })
      audit('allowed', 'lesson.record', c.ref)
      return l
    }),
  reviseLesson: (id, input, etag) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Rewording a lesson')
      const l = lessonAt(id, etag)
      if (l.appliedVersion)
        refuse(
          'lesson_applied',
          `This lesson was applied to ${l.templateKey} v${l.appliedVersion} and cannot change.`,
          409,
        )
      lessonValid(input)
      Object.assign(l, {
        title: input.title.trim(),
        observation: input.observation.trim(),
        recommendation: input.recommendation.trim(),
        templateKey: input.templateKey?.trim() || l.templateKey,
        updatedAt: new Date().toISOString(),
        etag: `"v${Number(l.etag.slice(2, -1)) + 1}"`,
      })
      audit('allowed', 'lesson.revise', l.caseRef)
      return l
    }),
  applyLesson: (id, templateKey, etag) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Applying a lesson to a template')
      const l = lessonAt(id, etag)
      const t = missions.find((x) => x.key === templateKey)
      if (!t) refuse('validation_failed', 'No such mission template.', 400)
      if (l.appliedVersion)
        refuse(
          'lesson_applied',
          `This lesson was already applied to ${l.templateKey} v${l.appliedVersion}.`,
          409,
        )
      if (t.retired) refuse('conflict', `The template '${t.name}' is retired.`, 409)
      const now = new Date().toISOString()
      Object.assign(l, {
        templateKey: t.key,
        appliedVersion: t.currentVersion,
        appliedBy: devName(),
        appliedAt: now,
        updatedAt: now,
        etag: `"v${Number(l.etag.slice(2, -1)) + 1}"`,
      })
      audit('allowed', 'lesson.apply', l.caseRef)
      return l
    }),

  outcomes: (period) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead', 'leadership'], 'Reading the outcome dashboard')
      return mockOutcomes(period)
    }),

  reviews: () => delay(() => ({ items: db.reviews, nextCursor: null })),
  decideReview: (caseId, decision, comment) =>
    delay(() => {
      requireRole(['reviewer', 'supervisor', 'centre_lead'], 'Deciding a review')
      const r = db.reviews.find((x) => x.caseId === caseId)
      if (!r) refuse('not_found', 'Review not found', 404)
      if (r.authorId === session.getUserId())
        refuse('self_approval_forbidden', 'Reviewer cannot be the author', 403)
      db.reviews = db.reviews.filter((x) => x.caseId !== caseId)
      db.reviewHistory.set(caseId, [
        {
          approvalId: crypto.randomUUID(),
          requestedAt: r.submittedAt,
          outcome: decision === 'approve' ? 'approved' : 'returned',
          decidedBy: devName(),
          decidedAt: new Date().toISOString(),
          comment: comment || undefined,
        },
        ...(db.reviewHistory.get(caseId) ?? []),
      ])
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
      step.comment = comment || undefined
      if (decision === 'refuse') a.status = 'refused'
      else if (a.steps.every((s) => s.decision === 'approve')) a.status = 'approved'
      settleCctv(a.id, a.status)
      retention.settle(a.id, a.status)
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
  wallPresets: () => delay(() => db.presets),
  activatePreset: (key) =>
    delay(() => {
      const preset = db.presets.find((p) => p.key === key)
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
  saveWallPreset: (input) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Saving a wall preset')
      const key = presetKey(input.name)
      if (!key || key === 'custom') refuse('validation_failed', 'Choose another name.', 400)
      if (db.presets.some((p) => p.key === key))
        refuse('preset_exists', `A preset called “${input.name}” already exists.`, 409)
      const preset: WallPreset = {
        key,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        screens: db.wall.screens.map((s) => s.content),
        groups: db.wall.groups.map((g) => ({ cells: g.cells, content: g.content })),
        builtIn: false,
        createdBy: devName(),
      }
      db.presets.push(preset)
      audit('allowed', 'wall.preset.save', key)
      return preset
    }),
  deleteWallPreset: (key) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Deleting a wall preset')
      const preset = db.presets.find((p) => p.key === key)
      if (!preset) refuse('not_found', 'Preset not found', 404)
      if (preset.builtIn) refuse('preset_built_in', 'The standard presets cannot be deleted.', 409)
      db.presets = db.presets.filter((p) => p.key !== key)
      audit('allowed', 'wall.preset.delete', key)
      if (db.wall.preset === key) bumpWall({ ...db.wall, preset: 'custom' })
    }),
  publishWallLayout: (revision) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Publishing to the wall')
      if (revision !== db.wall.revision)
        refuse('precondition_failed', 'Wall state changed since you loaded it', 412)
      const n = db.layoutPublications.length + 1
      const publication: WallLayoutPublication = {
        id: `wl-${n}`,
        ref: `WL-${String(4100 + n)}`,
        revision: db.wall.revision,
        preset: db.wall.preset,
        screens: clone(db.wall.screens),
        groups: clone(db.wall.groups),
        visitorMode: db.wall.visitorMode,
        adapter: 'simulator',
        publishedBy: devName(),
        publishedAt: new Date().toISOString(),
        delivered: true,
      }
      db.layoutPublications.unshift(publication)
      db.controller = {
        ...db.controller,
        inputsMuted: publication.visitorMode,
        routes: publication.visitorMode ? [] : db.controller.routes,
        layout: {
          publicationId: publication.id,
          publicationRef: publication.ref,
          preset: publication.preset,
          revision: publication.revision,
          screens: publication.screens,
          groups: publication.groups,
        },
        layoutActivatedAt: publication.publishedAt,
      }
      controllerNote(
        'activate-layout',
        `${publication.ref} · ${publication.preset} · v${publication.revision}`,
      )
      db.wall = {
        ...db.wall,
        published: {
          id: publication.id,
          ref: publication.ref,
          revision: publication.revision,
          preset: publication.preset,
          publishedBy: publication.publishedBy,
          publishedAt: publication.publishedAt,
        },
      }
      audit('allowed', 'wall.layout.publish', publication.ref)
      mockBus.emit('wall.state', clone(db.wall))
      return publication
    }),
  wallLayoutPublications: () => delay(() => db.layoutPublications),
  wallController: () => delay(() => db.controller),

  cctvRequests: (p) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Requesting CCTV footage')
      const all = session.getActiveRole() === 'supervisor'
      const items = db.cctv
        .filter((r) => all || r.requesterId === me().id)
        .filter((r) => !p?.status || r.status === p.status)
        .sort((x, y) => y.requestedAt.localeCompare(x.requestedAt))
      return { items, nextCursor: null }
    }),
  cctvRequest: (id) =>
    delay(() => {
      requireRole(['analyst', 'supervisor'], 'Requesting CCTV footage')
      const r = db.cctv.find((x) => x.id === id)
      if (!r || (r.requesterId !== me().id && session.getActiveRole() !== 'supervisor'))
        refuse('not_found', 'Request not found', 404)
      return { request: r, approval: db.approvals.find((a) => a.id === r.approvalId) }
    }),
  createCctvRequest: (caseId, input) =>
    delay(() => {
      cctvGate('cctv.request.create')
      cctvInvalid(cctvFieldErrors(input, false))
      const c = db.cases.find((x) => x.id === caseId)
      if (!c) refuse('validation_failed', 'Choose a case', 400)
      const r: CctvRequest = {
        ...input,
        id: `cctv-${crypto.randomUUID().slice(0, 8)}`,
        caseId,
        caseRef: c.ref,
        status: 'draft',
        requesterId: me().id,
        requesterName: devName(),
        requestedAt: new Date().toISOString(),
        etag: '"v1"',
      }
      db.cctv.push(r)
      audit('allowed', 'cctv.request.create', `${c.ref} · draft`)
      return r
    }),
  editCctvRequest: (id, input, etag) =>
    delay(() => {
      const r = ownCctv(id, etag)
      cctvGate('cctv.request.edit')
      if (r.status !== 'draft') refuse('conflict', 'Only a draft can be changed.', 409)
      cctvInvalid(cctvFieldErrors(input, false))
      Object.assign(r, input)
      cctvBump(r)
      audit('allowed', 'cctv.request.edit', `${r.caseRef} · draft`)
      return r
    }),
  submitCctvRequest: (id, etag) =>
    delay(() => {
      const r = ownCctv(id, etag)
      if (r.status !== 'draft') refuse('conflict', `This request is already ${r.status}.`, 409)
      if (!db.policies.find((p) => p.key === 'cctv_search_enabled')?.value) {
        Object.assign(r, {
          status: 'refused',
          refusalCode: 'capability_not_authorised',
          refusal: cctvRefusalText('capability_not_authorised'),
          decidedAt: new Date().toISOString(),
        })
        cctvBump(r)
        refuse('capability_not_authorised', 'CCTV search is switched off by policy.')
      }
      cctvInvalid(cctvFieldErrors(r, true))
      const basis = LAWFUL_BASES.find((b) => b.code === r.lawfulBasis)?.label ?? ''
      const approvalId = `ap-${crypto.randomUUID().slice(0, 6)}`
      db.approvals.unshift({
        id: approvalId,
        type: 'CCTV_SEARCH',
        subject: `${r.cameras.join(', ')} · ${r.location ?? 'CCTV'}`,
        justification: `${basis}${r.legalReference ? ` (${r.legalReference})` : ''}: ${r.reason}`,
        requesterId: r.requesterId,
        requesterName: r.requesterName,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        steps: [{ role: 'centre_lead' }, { role: 'evidence_officer' }],
        caseRef: r.caseRef,
        scope: `≤ 24 h window · ${r.cameras.length} camera${r.cameras.length === 1 ? '' : 's'}`,
      })
      Object.assign(r, {
        status: 'awaiting_approval',
        approvalId,
        submittedAt: new Date().toISOString(),
      })
      cctvBump(r)
      audit('allowed', 'cctv.request.submit', `${r.caseRef} · ${approvalId.toUpperCase()}`)
      return r
    }),
  cctvCameras: () => delay(() => CCTV_CAMERAS),
  cctvLawfulBases: () => delay(() => LAWFUL_BASES),

  // Missions (E29, ADR 0012): the same rules as casework.
  missionTemplates: (p) =>
    delay(() => {
      requireRole(MISSION_READERS, 'Reading mission templates')
      return missions.filter((t) => p?.retired || !t.retired)
    }),
  createMissionTemplate: (input) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Keeping mission templates')
      if (!input.key || missions.some((t) => t.key === input.key))
        refuse('conflict', 'A template with this key already exists.', 409)
      missionCategoriesFree(input.categories, input.key)
      const t = missionVersion(
        { key: input.key, currentVersion: 0, retired: false, isDefault: false, versions: [] },
        input,
      )
      missions.push(t)
      audit('allowed', 'mission.create', t.key)
      return t
    }),
  reviseMissionTemplate: (key, input, etag) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Keeping mission templates')
      const at = missions.findIndex((t) => t.key === key)
      if (at < 0) refuse('not_found', 'No such mission template.', 404)
      const t = missions[at]!
      if (t.etag !== etag) refuse('precondition_failed', 'This changed since you loaded it.', 412)
      if (t.retired) refuse('conflict', 'A retired template cannot be changed.', 409)
      missionCategoriesFree(input.categories, key)
      missions[at] = missionVersion(t, input)
      audit('allowed', 'mission.revise', key)
      return missions[at]
    }),
  retireMissionTemplate: (key, etag) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], 'Keeping mission templates')
      const t = missions.find((x) => x.key === key)
      if (!t) refuse('not_found', 'No such mission template.', 404)
      if (t.etag !== etag) refuse('precondition_failed', 'This changed since you loaded it.', 412)
      if (t.isDefault) refuse('conflict', 'The default template cannot be retired.', 409)
      t.retired = true
      t.categories = []
      t.etag = `"v${Number(t.etag.slice(2, -1)) + 1}"`
      audit('allowed', 'mission.retire', key)
      return t
    }),
  applyCaseMission: (caseId, templateKey) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], "Choosing a case's mission")
      const t = missions.find((x) => x.key === templateKey && !x.retired)
      if (!t) refuse('not_found', 'No such mission template.', 404)
      return applyMission(caseId, t)
    }),
  setCaseCategory: (caseId, category) =>
    delay(() => {
      requireRole(['supervisor', 'centre_lead'], "Setting a case's category")
      const c = db.cases.find((x) => x.id === caseId)
      if (!c) refuse('not_found', 'Case not found', 404)
      c.category = category.trim() || 'Unclassified'
      const t = missions.find(
        (x) => !x.retired && x.categories.some((k) => k.toLowerCase() === c.category.toLowerCase()),
      )
      const live = liveCase(caseId)
      if (t && ['triage', 'open', 'in_assessment', 'returned'].includes(live.state))
        return applyMission(caseId, t)
      audit('allowed', 'case.category', c.ref)
      return liveCase(caseId)
    }),
}

// ---------------------------------------------------------------- missions (E29, ADR 0012)

const MISSION_READERS: Role[] = [
  'analyst',
  'supervisor',
  'reviewer',
  'centre_lead',
  'evidence_officer',
]

const missions: MissionTemplate[] = fx.missionTemplates.map((t) => clone(t))

// ---------------------------------------------------------------- E38: corrections, lessons, outcomes

/** Who holds each brief, who opened each open correction, lessons, and the dashboard's facts. */
const e38 = {
  recipients: new Map<string, BriefRecipient[]>(),
  correctors: new Map<string, string>(),
  lessons: [] as Lesson[],
  facts: seedFacts(),
}

/** A month of plausible activity, so the dashboard has something to show offline. */
function seedFacts() {
  const facts: { kind: string; at: string; seconds?: number }[] = []
  const now = Date.now()
  for (let day = 0; day < 90; day++) {
    const at = (h: number) => new Date(now - day * 86_400_000 - h * 3_600_000).toISOString()
    if (day % 2 === 0) facts.push({ kind: 'release', at: at(3), seconds: (2 + (day % 7)) * 3600 })
    if (day % 11 === 4) facts.push({ kind: 'correction', at: at(5), seconds: (20 + day) * 3600 })
    if (day % 3 === 1) facts.push({ kind: 'case_closed', at: at(6) })
    if (day % 9 === 2) facts.push({ kind: 'lesson', at: at(7) })
    for (let i = 0; i < 1 + (day % 4); i++) {
      facts.push({ kind: 'alert_raised', at: at(i + 1) })
      facts.push({
        kind: 'alert_acknowledged',
        at: at(i + 1),
        seconds: 120 + ((day * 37 + i * 53) % 600),
      })
    }
  }
  return facts
}

function holds(b: Brief, id: string, source: BriefRecipient['source'], version = b.currentVersion) {
  const list = e38.recipients.get(b.id) ?? []
  if (list.some((r) => r.id === id)) return
  const name = id === me().id ? devName() : id === b.authorId ? b.authorName : id
  list.push({ id, name, source, firstVersion: version, recordedAt: new Date().toISOString() })
  e38.recipients.set(b.id, list)
}

function lessonAt(id: string, etag: string): Lesson {
  const l = e38.lessons.find((x) => x.id === id)
  if (!l) refuse('not_found', 'No such lesson.', 404)
  if (l.etag !== etag) refuse('precondition_failed', 'This changed since you loaded it.', 412)
  return l
}

function lessonValid(i: LessonInput) {
  if (!i.title.trim() || !i.observation.trim() || !i.recommendation.trim())
    refuse(
      'validation_failed',
      'A lesson needs a title, what happened and what to do differently.',
      400,
    )
}

const median = (xs: number[]) => {
  if (xs.length === 0) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1]! + s[m]!) / 2
}

/** The same arithmetic as reporting's OutcomeService: whole UTC days, today included. */
function mockOutcomes(period: OutcomePeriod): Outcomes {
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
  const end = new Date()
  end.setUTCHours(24, 0, 0, 0)
  const start = new Date(end.getTime() - days * 86_400_000)
  const rows = e38.facts.filter((f) => new Date(f.at) >= start && new Date(f.at) < end)
  const of = (kind: string) => rows.filter((f) => f.kind === kind)
  const timed = (kind: string) => median(of(kind).flatMap((f) => (f.seconds ? [f.seconds] : [])))
  const released = of('release').length
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)
    const count = (kind: string) => of(kind).filter((f) => f.at.slice(0, 10) === date).length
    return {
      date,
      released: count('release'),
      corrections: count('correction'),
      casesClosed: count('case_closed'),
      lessons: count('lesson'),
      alertsRaised: count('alert_raised'),
    }
  })
  return {
    period,
    from: start.toISOString(),
    to: end.toISOString(),
    briefsReleased: released,
    corrections: of('correction').length,
    correctionRate: released ? of('correction').length / released : undefined,
    medianTimeToRelease: timed('release'),
    medianTimeToCorrect: timed('correction'),
    casesClosed: of('case_closed').length,
    lessonsRecorded: of('lesson').length,
    alertsRaised: of('alert_raised').length,
    alertsAcknowledged: of('alert_acknowledged').length,
    medianTimeToAcknowledge: timed('alert_acknowledged'),
    daily,
  }
}

function missionCategoriesFree(categories: string[], self: string | undefined) {
  for (const category of categories) {
    const holder = missions.find(
      (t) =>
        t.key !== self &&
        !t.retired &&
        t.categories.some((k) => k.toLowerCase() === category.trim().toLowerCase()),
    )
    if (holder)
      refuse(
        'category_taken',
        `'${category.trim()}' is already covered by the template '${holder.name}'.`,
        409,
      )
  }
}

function missionVersion(
  t: Pick<MissionTemplate, 'key' | 'currentVersion' | 'retired' | 'isDefault' | 'versions'>,
  input: MissionTemplateInput,
): MissionTemplate {
  const number = t.currentVersion + 1
  const items = input.items.filter((i) => i.label.trim())
  const now = new Date().toISOString()
  return {
    key: t.key,
    name: input.name.trim(),
    description: input.description.trim(),
    categories: input.categories.map((c) => c.trim()).filter(Boolean),
    currentVersion: number,
    retired: t.retired,
    isDefault: t.isDefault,
    items,
    versions: [
      { number, name: input.name.trim(), items, createdBy: devName(), createdAt: now },
      ...t.versions,
    ],
    updatedBy: devName(),
    updatedAt: now,
    etag: `"v${number}"`,
  }
}

/** Copies the template's current version; lines both share keep their ticks and notes. */
function applyMission(caseId: string, t: MissionTemplate): CaseDetail {
  requireRole(['supervisor', 'centre_lead'], "Choosing a case's mission")
  const c = liveCase(caseId)
  if (!['triage', 'open', 'in_assessment', 'returned'].includes(c.state))
    refuse('conflict', `A ${c.state.replace('_', ' ')} case's mission is fixed.`, 409)
  const kept = new Map(c.checklist.map((i) => [i.key ?? i.label, i]))
  db.assessment.set(c.id, {
    ...db.assessment.get(c.id),
    checklist: t.items.map((line) => ({
      ...(kept.get(line.key) ?? { done: false }),
      key: line.key,
      label: line.label,
      required: line.required,
    })),
    mission: { templateKey: t.key, version: t.currentVersion, name: t.name },
  })
  audit('allowed', 'case.mission', c.ref)
  return liveCase(caseId)
}
