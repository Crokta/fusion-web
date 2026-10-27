/**
 * The seam between the services' DTOs and the screens' types.
 *
 * The screens were designed with a mock (src/api/mock), and their types say what a screen needs
 * to show. The services say what they own. Everything that translates between the two lives
 * here, as pure functions, so it can be tested without a network and so a service changing a
 * field is a one-line change in one place. Where a service has no data for a field yet, the
 * default is chosen to read as "not known" on screen, never as a made-up fact.
 */
import type {
  Alert,
  Approval,
  ApprovalStep,
  ApprovalType,
  AuditEvent,
  CaseDetail,
  CaseState,
  CaseSummary,
  EvidenceItem,
  ItemDetail,
  Marking,
  Priority,
  PolicyRecord,
  ReviewItem,
  Role,
  SearchHit,
  SearchKind,
  SearchResponse,
  SourceHealth,
  SourceKind,
  SourceRecord,
  SourceStatus,
  Reliability,
  Story,
  StoryGroup,
  TimelineEntry,
  TriageItem,
  TriageStatus,
  WallPreset,
  WallPublication,
  WallState,
  WatchFloorSummary,
} from './types'

/** How a person is shown: their name if the directory knows them, else a short id. */
export type NameOf = (id: string | null | undefined) => string

export const shortId = (id: string) => (id.length > 12 ? id.slice(-6).toUpperCase() : id)

/** Every service marks nothing yet; OFFICIAL is the floor until the marking model lands. */
const DEFAULT_MARKING: Marking = 'OFFICIAL'

// ---------------------------------------------------------------------------------------
// Service DTOs (camelCase from every service; .NET and Python alike)
// ---------------------------------------------------------------------------------------

export interface PageDto<T> {
  items: T[]
  nextCursor: string | null
}

export interface ChecklistItemDto {
  key: string
  label: string
  done: boolean
  doneBy: string | null
  doneAt: string | null
}

export interface CaseDto {
  id: string
  reference: string
  title: string
  state: string
  allowedTransitions: string[]
  ownerId: string | null
  priority: string
  deadline: string | null
  triageItemId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  closedAt: string | null
  checklistComplete: boolean
  checklist: ChecklistItemDto[]
  items: { evidenceId: string; attachedAt: string }[]
  version: number
}

export interface EvidenceDto {
  id: string
  caseId: string | null
  /** warc | screenshot | html | media for captures; null for uploads. */
  role?: string | null
  timestampGenTime?: string | null
  sourceUrl: string | null
  contentType: string
  sizeBytes: number
  sha256: string
  status: string
  registeredAt: string
  registeredBy: string
}

export interface ApprovalDecisionDto {
  step: number
  decidedBy: string
  role: string
  decision: 'approve' | 'reject'
  comment: string | null
  decidedAt: string
}

export interface ApprovalDto {
  id: string
  type: ApprovalType
  subjectType: string
  subjectId: string
  caseId: string | null
  requestedBy: string
  reason: string | null
  requestedAt: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  currentStep: number | null
  totalSteps: number
  awaitingRoles: string[]
  completedAt: string | null
  expiresAt: string | null
  windowStart: string | null
  windowEnd: string | null
  decisions: ApprovalDecisionDto[]
  version: number
}

export interface PolicyDto {
  key: string
  enabled: boolean
  version: number
  description: string | null
  authorityRef: string
  changedBy: string
  changedAt: string
  signatureValid: boolean
}

export interface AuditEntryDto {
  sequence: number
  auditId: string
  service: string
  action: string
  objectType: string
  objectId: string
  actor: string
  onBehalfOf: string | null
  activeRole: string | null
  caseId: string | null
  outcome: 'success' | 'refused'
  reasonCode: string | null
  occurredAt: string
  rowHash: string
}

export interface StoryDto {
  id: string
  sourceId: string
  storyGroupId: string
  url: string
  canonicalUrl: string
  headline: string
  summary: string | null
  /** intake's channel: security, public-safety, politics, economy, health or information. */
  channel?: string
  publishedAt: string
  fetchedAt: string
  triageItemId: string | null
  sentToTriageAt: string | null
}

export interface TriageItemDto {
  id: string
  storyId: string | null
  url: string
  title: string | null
  status: string
  caseId: string | null
  createdAt: string
  promotedAt: string | null
  promotedBy: string | null
  evidenceIds: string[]
  evidenceCount: number
  version: number
}

export interface AlertDto {
  id: string
  ruleId: string
  severity: 'low' | 'normal' | 'high' | 'critical'
  title: string
  caseId: string | null
  sourceEventType: string
  status: 'open' | 'acknowledged'
  raisedAt: string
  level: number
  lastEscalatedAt: string | null
  acknowledgedBy: string | null
}

export interface SourceDto {
  id: string
  name: string
  status: string
}

/** intake's SourceView. */
export interface SourceViewDto extends SourceDto {
  kind: string
  url: string
  reliability: string | null
  proposedBy: string
  proposedAt: string
  approvedBy: string | null
  approvedAt: string | null
  suspendedReason: string | null
  suspendedAt: string | null
  version: number
}

export interface SearchHitDto {
  type: string
  id: string
  caseId: string | null
  title: string
  at: string
  score: number
  /** The best-matching passage, matched words in <mark>; absent before full-text indexing. */
  snippet?: string | null
  /** Where it came from: an outlet host for a story. */
  source?: string | null
}

export interface WallStateDto extends Omit<WallState, 'revision' | 'controller'> {
  version: number
}

export interface WallPublicationDto extends WallPublication {
  decidedBy: string | null
  decidedAt: string | null
}

// ---------------------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------------------

const ROLES: readonly string[] = ['analyst', 'supervisor', 'reviewer', 'centre_lead', 'admin']

export const toRole = (r: string | null | undefined): Role =>
  (r && ROLES.includes(r) ? r : 'analyst') as Role

/** Services have four levels (low, normal, high, critical); the screens show three. */
export const toPriority = (p: string | null | undefined): Priority =>
  p === 'critical' || p === 'high' ? 'high' : p === 'low' ? 'low' : 'medium'

/** casework's priorities are low, normal, high and critical; the screens show three. */
export const fromPriority = (p: Priority): string => (p === 'medium' ? 'normal' : p)

const CASE_STATES: readonly string[] = [
  'triage',
  'open',
  'in_assessment',
  'submitted',
  'returned',
  'approved',
  'released',
  'closed',
]
export const toCaseState = (s: string): CaseState =>
  (CASE_STATES.includes(s) ? s : 'open') as CaseState

/** The roles each gate step needs, as governance's GateRule has them. */
const GATE_STEPS: Record<ApprovalType, ApprovalStep['role'][]> = {
  CASE_REVIEW: ['reviewer'],
  PI_SEARCH: ['centre_lead', 'evidence_officer'],
  CCTV_SEARCH: ['centre_lead', 'evidence_officer'],
  CORRECTION: ['reviewer'],
  RETENTION_EXTENSION: ['evidence_officer', 'centre_lead'],
}

// ---------------------------------------------------------------------------------------
// Cases and reviews
// ---------------------------------------------------------------------------------------

export function toCaseSummary(c: CaseDto, name: NameOf): CaseSummary {
  return {
    id: c.id,
    ref: c.reference,
    title: c.title,
    state: toCaseState(c.state),
    priority: toPriority(c.priority),
    // casework does not classify cases or place them yet.
    category: 'Unclassified',
    place: '—',
    owner: { id: c.ownerId ?? '', name: c.ownerId ? name(c.ownerId) : 'Unassigned' },
    deadline: c.deadline ?? c.updatedAt,
    updatedAt: c.updatedAt,
    signalCount: 0,
    evidenceCount: c.items.length,
    marking: DEFAULT_MARKING,
  }
}

/** What a capture's file is, in words an analyst reads. */
const EVIDENCE_ROLE_LABEL: Record<string, string> = {
  warc: 'Web archive (WARC)',
  html: 'Page HTML',
  screenshot: 'Full-page screenshot',
  media: 'Public video',
}

export function evidenceLabel(e: Pick<EvidenceDto, 'role' | 'contentType'>): string {
  if (e.role && EVIDENCE_ROLE_LABEL[e.role]) return EVIDENCE_ROLE_LABEL[e.role]!
  if (e.contentType.startsWith('image/')) return 'Image'
  if (e.contentType.startsWith('video/')) return 'Video'
  if (e.contentType.startsWith('audio/')) return 'Audio'
  if (e.contentType === 'application/pdf') return 'PDF document'
  return 'Document'
}

export function toEvidenceItem(e: EvidenceDto): EvidenceItem {
  const kind: EvidenceItem['kind'] = e.contentType.startsWith('image/')
    ? 'image'
    : e.contentType.startsWith('video/')
      ? 'video'
      : e.contentType.startsWith('audio/')
        ? 'audio'
        : e.contentType.includes('html') || e.contentType.includes('warc')
          ? 'web-capture'
          : 'document'
  const label = evidenceLabel(e)
  return {
    id: e.id,
    ref: `EV-${shortId(e.id)}`,
    kind,
    title: label,
    label,
    link: e.sourceUrl ?? undefined,
    source: e.sourceUrl ? hostOf(e.sourceUrl) : 'upload',
    capturedAt: e.registeredAt,
    sha256: e.sha256,
    custodyEvents: 1,
    marking: DEFAULT_MARKING,
    timestamped: !!e.timestampGenTime,
  }
}

/** A timeline from what casework records: creation, checklist ticks and the current state. */
export function caseTimeline(c: CaseDto, name: NameOf): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      id: `${c.id}-created`,
      at: c.createdAt,
      actor: name(c.createdBy),
      kind: 'state',
      text: 'Case opened from triage',
    },
    ...c.checklist
      .filter((i) => i.done && i.doneAt)
      .map((i) => ({
        id: `${c.id}-${i.key}`,
        at: i.doneAt!,
        actor: name(i.doneBy),
        kind: 'note' as const,
        text: `Checklist: ${i.label}`,
      })),
    ...c.items.map((i) => ({
      id: `${c.id}-${i.evidenceId}`,
      at: i.attachedAt,
      actor: 'evidence',
      kind: 'evidence' as const,
      text: `Evidence EV-${shortId(i.evidenceId)} attached`,
    })),
  ]
  if (c.state !== 'open' && c.state !== 'triage')
    entries.push({
      id: `${c.id}-state`,
      at: c.updatedAt,
      actor: '—',
      kind: 'state',
      text: `Now ${c.state.replace('_', ' ')}`,
    })
  return entries.sort((a, b) => b.at.localeCompare(a.at))
}

export function toCaseDetail(
  c: CaseDto,
  evidence: EvidenceDto[],
  name: NameOf,
  etag: string | null,
): CaseDetail {
  return {
    ...toCaseSummary(c, name),
    summary: '',
    authorId: c.createdBy,
    // casework records findings, indicators and claims in a later epic (E22).
    findings: [],
    evidence: evidence.map(toEvidenceItem),
    indicators: [],
    claims: [],
    timeline: caseTimeline(c, name),
    checklist: c.checklist.map((i) => ({ label: i.label, done: i.done })),
    etag: etag ?? `"v${c.version}"`,
  }
}

/** A review is governance's CASE_REVIEW gate, shown with its case. */
export function toReviewItem(a: ApprovalDto, c: CaseDto | undefined, name: NameOf): ReviewItem {
  return {
    caseId: a.caseId ?? a.subjectId,
    caseRef: c?.reference ?? `CASE ${shortId(a.subjectId)}`,
    title: c?.title ?? a.reason ?? 'Case review',
    authorId: a.requestedBy,
    authorName: name(a.requestedBy),
    submittedAt: a.requestedAt,
    dueAt: c?.deadline ?? a.requestedAt,
    findingCount: 0,
    evidenceCount: c?.items.length ?? 0,
    priority: toPriority(c?.priority),
    marking: DEFAULT_MARKING,
    revision: c?.version ?? a.version,
  }
}

// ---------------------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------------------

export function toApproval(a: ApprovalDto, name: NameOf, caseRef?: string): Approval {
  const roles = GATE_STEPS[a.type] ?? []
  const steps: ApprovalStep[] = Array.from(
    { length: Math.max(a.totalSteps, roles.length) },
    (_, i) => {
      const d = a.decisions.find((x) => x.step === i + 1)
      if (d)
        return {
          role: d.role as ApprovalStep['role'],
          decidedBy: name(d.decidedBy),
          decision: d.decision === 'reject' ? 'refuse' : 'approve',
          decidedAt: d.decidedAt,
        }
      const awaiting = a.currentStep === i + 1 ? a.awaitingRoles : []
      const role = (roles[i] ?? awaiting[0] ?? 'reviewer') as ApprovalStep['role']
      return { role }
    },
  )
  const scope =
    a.windowStart && a.windowEnd
      ? `${new Date(a.windowStart).toLocaleString()} – ${new Date(a.windowEnd).toLocaleString()}`
      : `${a.subjectType} ${shortId(a.subjectId)}`
  return {
    id: a.id,
    type: a.type,
    subject: caseRef ? `${caseRef}` : `${a.subjectType.replace('_', ' ')} ${shortId(a.subjectId)}`,
    justification: a.reason ?? '',
    requesterId: a.requestedBy,
    requesterName: name(a.requestedBy),
    requestedAt: a.requestedAt,
    expiresAt: a.expiresAt ?? undefined,
    status: a.status === 'rejected' ? 'refused' : a.status,
    steps,
    caseRef,
    scope,
  }
}

/** pi_search → "PI search", external_ai.detectors → "External AI · detectors". */
export function policyLabel(key: string): string {
  const acronyms = new Set(['pi', 'ai', 'cctv'])
  const text = key
    .split('.')
    .map((part) =>
      part
        .split('_')
        .map((w) => (acronyms.has(w) ? w.toUpperCase() : w))
        .join(' '),
    )
    .join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function toPolicy(p: PolicyDto, name: NameOf): PolicyRecord {
  return {
    key: p.key,
    label: policyLabel(p.key),
    // A record whose signature does not hold is off to every service; say so here too.
    description:
      (p.description ?? '') +
      (p.signatureValid ? '' : ' — signature does not verify; treated as off.'),
    value: p.enabled && p.signatureValid,
    version: p.version,
    authorityRef: p.authorityRef,
    changedBy: name(p.changedBy),
    changedAt: p.changedAt,
  }
}

export function toAuditEvent(e: AuditEntryDto, name: NameOf): AuditEvent {
  const person = e.onBehalfOf ?? e.actor
  return {
    id: e.auditId,
    at: e.occurredAt,
    actor: name(person),
    role: e.activeRole ? toRole(e.activeRole) : 'service',
    action: e.action,
    target: `${e.objectType} ${e.objectId.length > 20 ? shortId(e.objectId) : e.objectId}`,
    outcome: e.outcome === 'refused' ? 'refused' : 'allowed',
    purpose: e.reasonCode ?? undefined,
    rowHash: e.rowHash,
  }
}

// ---------------------------------------------------------------------------------------
// Feed, alerts, watch floor
// ---------------------------------------------------------------------------------------

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

const CHANNELS: readonly StoryGroup['channel'][] = [
  'security',
  'public-safety',
  'politics',
  'economy',
  'health',
  'information',
]

/** A channel intake doesn't know (or an older intake that sends none) reads as Information. */
export const toChannel = (c: string | null | undefined): StoryGroup['channel'] =>
  CHANNELS.includes(c as StoryGroup['channel']) ? (c as StoryGroup['channel']) : 'information'

/** intake lists stories; the feed shows their story groups, newest activity first. */
export function toStoryGroups(stories: StoryDto[]): StoryGroup[] {
  const groups = new Map<string, StoryDto[]>()
  for (const s of stories) groups.set(s.storyGroupId, [...(groups.get(s.storyGroupId) ?? []), s])
  return [...groups.entries()]
    .map(([id, members]) => {
      const sorted = [...members].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
      const lead = sorted[0]!
      return {
        id,
        headline: lead.headline,
        summary: lead.summary ?? '',
        place: '—',
        channel: toChannel(lead.channel),
        priority: 'medium' as const,
        firstSeen: lead.publishedAt,
        lastUpdated: sorted[sorted.length - 1]!.publishedAt,
        independentOutlets: new Set(members.map((m) => hostOf(m.url))).size,
        stories: sorted.map((m): Story => ({
          id: m.id,
          outlet: hostOf(m.url),
          headline: m.headline,
          url: m.url,
          publishedAt: m.publishedAt,
          official: false,
        })),
        marking: DEFAULT_MARKING,
      }
    })
    .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated))
}

// ---------------------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------------------

const TRIAGE_STATUSES: readonly TriageStatus[] = ['pending', 'promoted', 'dismissed']

/**
 * casework knows the link and its originals; intake knows the headline. The story is optional
 * because casework keeps the item if intake can't answer.
 */
export function toTriageItem(
  t: TriageItemDto,
  story: Pick<StoryDto, 'headline' | 'summary'> | null,
  evidence: EvidenceDto[],
  name: NameOf,
): TriageItem {
  return {
    id: t.id,
    storyId: t.storyId,
    headline: story?.headline ?? t.title ?? hostOf(t.url),
    summary: story?.summary ?? '',
    url: t.url,
    outlet: hostOf(t.url),
    status: TRIAGE_STATUSES.includes(t.status as TriageStatus)
      ? (t.status as TriageStatus)
      : 'pending',
    sentAt: t.createdAt,
    caseId: t.caseId,
    promotedAt: t.promotedAt,
    promotedBy: t.promotedBy ? name(t.promotedBy) : null,
    evidence: evidence.map(toEvidenceItem),
    evidenceCount: t.evidenceCount,
    etag: `"v${t.version}"`,
  }
}

export function toAlert(a: AlertDto, name: NameOf): Alert {
  return {
    id: a.id,
    title: a.title,
    detail: `Raised on ${a.sourceEventType}`,
    severity: toPriority(a.severity),
    status: a.status === 'acknowledged' ? 'acknowledged' : a.level > 0 ? 'escalated' : 'open',
    raisedAt: a.raisedAt,
    rule: `Rule ${shortId(a.ruleId)}`,
    escalationLevel: a.level,
    acknowledgedBy: a.acknowledgedBy ? name(a.acknowledgedBy) : undefined,
    caseRef: a.caseId ? `CASE ${shortId(a.caseId)}` : undefined,
  }
}

export function toSourceHealth(s: SourceDto): SourceHealth {
  return {
    key: s.id,
    name: s.name,
    status: s.status === 'approved' ? 'healthy' : s.status === 'suspended' ? 'down' : 'degraded',
    lagSeconds: 0,
  }
}

const SOURCE_KINDS: readonly SourceKind[] = ['feed', 'site', 'social', 'official']
const SOURCE_STATUSES: readonly SourceStatus[] = ['proposed', 'approved', 'suspended']
const GRADES: readonly Reliability[] = ['A', 'B', 'C', 'D', 'E', 'F']

export function toSourceRecord(s: SourceViewDto, name: NameOf): SourceRecord {
  return {
    id: s.id,
    name: s.name,
    kind: SOURCE_KINDS.includes(s.kind as SourceKind) ? (s.kind as SourceKind) : 'site',
    url: s.url,
    host: hostOf(s.url),
    reliability: GRADES.includes(s.reliability as Reliability)
      ? (s.reliability as Reliability)
      : null,
    // An unknown status is shown as proposed: never as collecting when we can't tell.
    status: SOURCE_STATUSES.includes(s.status as SourceStatus)
      ? (s.status as SourceStatus)
      : 'proposed',
    proposedBy: { id: s.proposedBy, name: name(s.proposedBy) },
    proposedAt: s.proposedAt,
    approvedBy: s.approvedBy ? { id: s.approvedBy, name: name(s.approvedBy) } : null,
    approvedAt: s.approvedAt,
    suspendedReason: s.suspendedReason,
    suspendedAt: s.suspendedAt,
    etag: `"v${s.version}"`,
  }
}

export function toWatchFloor(raw: {
  kpis: WatchFloorSummary['kpis']
  sources: SourceDto[]
}): WatchFloorSummary {
  return { kpis: raw.kpis, sources: raw.sources.map(toSourceHealth), events: [], onDuty: [] }
}

// ---------------------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------------------

const KIND_OF: Record<string, SearchKind> = {
  story: 'news',
  product: 'news',
  case: 'case',
  finding: 'case',
  claim: 'case',
  lesson: 'case',
  evidence: 'media',
  alert: 'alert',
}

const MARK = /<\/?mark>/g

export function toSearchHit(h: SearchHitDto): SearchHit {
  return {
    id: h.id,
    kind: KIND_OF[h.type] ?? 'news',
    title: h.title,
    summary: h.snippet?.replace(MARK, '') ?? '',
    highlight: h.snippet ?? undefined,
    place: '—',
    source: h.source ?? h.type,
    caseRef: h.caseId ? `CASE ${shortId(h.caseId)}` : undefined,
    at: h.at,
    marking: DEFAULT_MARKING,
  }
}

export function toSearchResponse(page: PageDto<SearchHitDto>, tookMs: number): SearchResponse {
  const items = page.items.map(toSearchHit)
  const facets = {
    person: 0,
    location: 0,
    news: 0,
    social: 0,
    media: 0,
    alert: 0,
    case: 0,
  } as Record<SearchKind, number>
  for (const i of items) facets[i.kind] += 1
  return { items, facets, tookMs }
}

/** The search service has no item endpoint yet: a hit's detail is what the hit carries. */
export function toItemDetail(
  hit: SearchHit,
  extra: { detail?: string; metadata?: { key: string; value: string }[] } = {},
): ItemDetail {
  return {
    ...hit,
    detail: extra.detail ?? hit.title,
    images: [],
    similar: [],
    metadata: extra.metadata ?? [
      { key: 'Type', value: hit.source },
      { key: 'Seen', value: new Date(hit.at).toLocaleString() },
    ],
    entities: [],
    locations: [],
    related: [],
  }
}

// ---------------------------------------------------------------------------------------
// The wall (reporting)
// ---------------------------------------------------------------------------------------

/** The controller adapter is the simulator until the AV vendor's hardware is wired (E36). */
export function toWallState(w: WallStateDto, name: NameOf): WallState {
  const { version, ...rest } = w
  return {
    ...rest,
    screens: rest.screens.map((s) => ({
      ...s,
      contextRef: s.contextRef ?? undefined,
      leaseExpiresAt: s.leaseExpiresAt ?? undefined,
    })),
    revision: version,
    controller: 'simulated',
    updatedBy: name(w.updatedBy),
  }
}

export function fromWallState(w: WallState) {
  return {
    preset: w.preset,
    screens: w.screens.map((s) => ({
      index: s.index,
      content: s.content,
      contextRef: s.contextRef,
      leaseExpiresAt: s.leaseExpiresAt,
    })),
    groups: w.groups.map((g) => ({ cells: g.cells, content: g.content })),
    visitorMode: w.visitorMode,
  }
}

export const toWallPreset = (p: WallPreset): WallPreset => p

export function toWallPublication(p: WallPublicationDto, name: NameOf): WallPublication {
  return {
    id: p.id,
    ref: p.ref,
    content: p.content,
    targets: p.targets,
    contextRef: p.contextRef ?? undefined,
    requestedBy: name(p.requestedBy),
    requestedAt: p.requestedAt,
    note: p.note ?? undefined,
    status: p.status,
  }
}
