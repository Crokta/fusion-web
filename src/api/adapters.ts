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
  // E39
  Disposal,
  DisposalCertificate,
  DisposalExecution,
  DisposalItem,
  DisposalStatus,
  IntegrityCheck,
  IntegrityRun,
  IntegrityRunDetail,
  RetentionItem,
  RetentionSchedule,
  ReviewHistoryEntry,
  WallRendererToken,
  WallZone,
  WallZoneContent,
  WallZones,
  ChecklistLine,
  NameCluster,
  NameMention,
  NameReportData,
  NameSearch,
  MissionTemplate,
  MissionTemplateInput,
  CctvRequest,
  CctvRequestStatus,
  Alert,
  Approval,
  CaptureRequest,
  CaseMatrix,
  MatrixFlag,
  ApprovalStep,
  Brief,
  BriefRecipient,
  Lesson,
  LessonInput,
  OutcomeDay,
  Outcomes,
  SupportCheck,
  ApprovalType,
  AuditEvent,
  CaseDetail,
  CaseState,
  CaseStatement,
  CaseSummary,
  Claim,
  Confidence,
  Delivery,
  DeliveryChannel,
  DeliveryStatus,
  DutyShift,
  DutyTier,
  EvidenceItem,
  Finding,
  StatementChannel,
  ItemDetail,
  Marking,
  Priority,
  PolicyRecord,
  ReviewItem,
  Role,
  SearchHit,
  SearchKind,
  SearchResponse,
  SourceCollection,
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
  WallContentKey,
  WallControllerStatus,
  WallGroup,
  WallLayoutPublication,
  WallPreset,
  WallPublication,
  WallScreen,
  WallState,
  WatchFloorSummary,
  GazetteerDataset,
  GeoLocation,
  MapArea,
  MapEvent,
  MapFeature,
  MapLayer,
  Place,
  AcceptQuestionInput,
  BriefFeedback,
  FeedbackRating,
  Question,
  QuestionStatus,
  Requirement,
  RequirementStatus,
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
  // Missions (absent from a casework older than E29).
  required?: boolean
  note?: string | null
  noteBy?: string | null
  noteAt?: string | null
}

/** casework's CaseMatrixView (camelCase). */
export interface CaseMatrixDto {
  caseId: string
  sources: {
    id: string
    kind: string
    label: string | null
    contentType: string | null
    at: string
    screeningStatus: string | null
    verdict: string | null
    confidence: number | null
    citedBy: number
  }[]
  rows: {
    id: string
    kind: string
    text: string
    assessment: string
    cites: string[]
    flags: string[]
  }[]
}

const matrixFlags: readonly string[] = ['unsupported', 'cites_likely_synthetic']

export function toCaseMatrix(d: CaseMatrixDto): CaseMatrix {
  return {
    caseId: d.caseId,
    sources: d.sources.map((s) => ({
      ...s,
      kind: s.kind === 'statement' ? 'statement' : 'original',
      screeningStatus:
        s.screeningStatus === 'requested' ||
        s.screeningStatus === 'screened' ||
        s.screeningStatus === 'failed'
          ? s.screeningStatus
          : null,
    })),
    rows: d.rows.map((r) => ({
      ...r,
      kind: r.kind === 'claim' ? 'claim' : 'finding',
      // A flag this screen does not know yet is left out rather than shown raw.
      flags: r.flags.filter((f): f is MatrixFlag => matrixFlags.includes(f)),
    })),
  }
}

/** evidence's CaptureRequestView (camelCase; status lowercase). */
export interface CaptureRequestDto {
  id: string
  url: string
  caseId: string | null
  status: string
  failureReason: string | null
  evidenceId: string | null
  requestedAt: string
}

/** evidence's UploadView: where the browser sends the file, and with which headers. */
export interface UploadSlotDto {
  id: string
  uploadUrl: string
  method: string
  headers: Record<string, string>
  urlExpiresAt: string
}

const captureStatuses = ['requested', 'completed', 'failed'] as const

export function toCaptureRequest(d: CaptureRequestDto): CaptureRequest {
  const status = d.status.toLowerCase()
  return {
    id: d.id,
    url: d.url,
    caseId: d.caseId,
    // An unknown state is still in progress as far as the screen is concerned.
    status: (captureStatuses as readonly string[]).includes(status)
      ? (status as CaptureRequest['status'])
      : 'requested',
    failureReason: d.failureReason,
    evidenceId: d.evidenceId,
    requestedAt: d.requestedAt,
  }
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
  // Missions (absent from a casework older than E29).
  category?: string | null
  mission?: { templateKey: string | null; templateVersion: number | null; name: string | null }
  items: { evidenceId: string; attachedAt: string }[]
  // Assessment (absent from a casework older than E22).
  summary?: string | null
  summaryBy?: string | null
  summaryUpdatedAt?: string | null
  findings?: FindingDto[]
  claims?: ClaimDto[]
  statements?: StatementDto[]
  version: number
}

export interface FindingDto {
  id: string
  text: string
  confidence: string
  basis: string
  evidenceIds: string[]
  statementIds: string[]
  authorId: string
  recordedAt: string
  revisedBy: string | null
  updatedAt: string
  version: number
}

export interface ClaimDto {
  id: string
  text: string
  attributedTo: string
  outcome: string
  rationale: string | null
  evidenceIds: string[]
  statementIds: string[]
  recordedBy: string
  recordedAt: string
  outcomeSetBy: string | null
  outcomeSetAt: string | null
}

export interface StatementDto {
  id: string
  speaker: string
  speakerRole: string | null
  channel: string
  givenAt: string | null
  text: string
  evidenceId: string | null
  recordedBy: string
  recordedAt: string
}

export interface EvidenceDto {
  id: string
  caseId: string | null
  /** warc | screenshot | html | media | image | record for captures; null for uploads. */
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
  tier?: DutyTier
  lastEscalatedAt: string | null
  acknowledgedBy: string | null
  acknowledgedAt?: string | null
  version?: number
}

export interface ShiftDto {
  id: string
  tier: DutyTier
  userId: string
  name: string
  startsAt: string
  endsAt: string
  email: string | null
  phone: string | null
  createdBy: string
}

export interface MessageDto {
  id: string
  alertId: string
  reference: string
  level: number
  recipientId: string
  recipientName: string
  channel: DeliveryChannel
  address: string | null
  subject: string
  link: string
  status: DeliveryStatus
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
  readAt: string | null
  fallbackFor: string | null
}

export function toShift(s: ShiftDto): DutyShift {
  return {
    id: s.id,
    tier: s.tier,
    userId: s.userId,
    name: s.name,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    email: s.email ?? undefined,
    phone: s.phone ?? undefined,
    createdBy: s.createdBy,
  }
}

export function toDelivery(m: MessageDto): Delivery {
  return {
    id: m.id,
    alertId: m.alertId,
    reference: m.reference,
    level: m.level,
    recipientId: m.recipientId,
    recipientName: m.recipientName,
    channel: m.channel,
    address: m.address ?? undefined,
    subject: m.subject,
    link: m.link,
    status: m.status,
    attempts: m.attempts,
    lastError: m.lastError ?? undefined,
    createdAt: m.createdAt,
    sentAt: m.sentAt ?? undefined,
    readAt: m.readAt ?? undefined,
    fallbackFor: m.fallbackFor ?? undefined,
  }
}

/** "ALT-" and the last six hex digits of the id, as the alerts service writes it in messages. */
export const alertReference = (id: string) => `ALT-${id.replace(/-/g, '').slice(-6).toUpperCase()}`

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
  /** Absent from intake before ADR 0007. */
  collection?: Partial<SourceCollection> | null
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

export interface WallStateDto extends Omit<
  WallState,
  'revision' | 'controller' | 'published' | 'screens'
> {
  version: number
  screens: WallScreenDto[]
  /** Absent from reporting before E33. */
  controller?: WallState['controller'] | null
  published?: WallPublishedDto | null
}

export interface WallPublishedDto {
  id: string
  ref: string
  layoutVersion: number
  preset: string
  publishedBy: string
  publishedAt: string
}

export interface WallLayoutPublicationDto extends Omit<
  WallLayoutPublication,
  'revision' | 'failure' | 'screens'
> {
  layoutVersion: number
  failure: string | null
  screens: WallScreenDto[]
}

export interface WallScreenDto {
  index: number
  content: WallContentKey
  contextRef?: string | null
  leaseExpiresAt?: string | null
}

export interface WallControllerDto extends Omit<
  WallControllerStatus,
  'layout' | 'layoutActivatedAt'
> {
  layout: {
    publicationId: string
    publicationRef: string
    preset: string
    layoutVersion: number
    screens: WallScreenDto[]
    groups: WallGroup[]
  } | null
  layoutActivatedAt: string | null
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
    // casework does not place cases yet; the category decides the mission template (E29).
    category: c.category ?? 'Unclassified',
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
  media: 'Video',
  image: 'Image',
  record: 'Post record (provider)',
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

const CONFIDENCES: readonly Confidence[] = ['high', 'moderate', 'low']
const OUTCOMES: readonly Claim['outcome'][] = [
  'unassessed',
  'supported',
  'contradicted',
  'inconclusive',
]
const CHANNELS_OF_STATEMENT: readonly StatementChannel[] = [
  'official',
  'witness',
  'interview',
  'press',
  'other',
]
const oneOf = <T extends string>(all: readonly T[], value: string, fallback: T): T =>
  all.includes(value as T) ? (value as T) : fallback

export function toFinding(f: FindingDto, name: NameOf): Finding {
  return {
    id: f.id,
    statement: f.text,
    confidence: oneOf(CONFIDENCES, f.confidence, 'low'),
    basis: f.basis,
    authorName: name(f.authorId),
    recordedAt: f.recordedAt,
    evidenceIds: f.evidenceIds,
    statementIds: f.statementIds,
    revisedBy: f.revisedBy ? name(f.revisedBy) : undefined,
    version: f.version,
  }
}

export function toClaim(c: ClaimDto, name: NameOf): Claim {
  return {
    id: c.id,
    text: c.text,
    attributedTo: c.attributedTo,
    outcome: oneOf(OUTCOMES, c.outcome, 'unassessed'),
    supportingEvidence: c.evidenceIds.length + c.statementIds.length,
    rationale: c.rationale ?? undefined,
    evidenceIds: c.evidenceIds,
    statementIds: c.statementIds,
    outcomeSetBy: c.outcomeSetBy ? name(c.outcomeSetBy) : undefined,
  }
}

export function toStatement(s: StatementDto, name: NameOf): CaseStatement {
  return {
    id: s.id,
    speaker: s.speaker,
    speakerRole: s.speakerRole ?? undefined,
    channel: oneOf(CHANNELS_OF_STATEMENT, s.channel, 'other'),
    givenAt: s.givenAt ?? undefined,
    text: s.text,
    evidenceId: s.evidenceId ?? undefined,
    recordedBy: name(s.recordedBy),
    recordedAt: s.recordedAt,
  }
}

/** Everyone a case page names, for one /people lookup. */
export const peopleOfCase = (c: CaseDto) => [
  c.ownerId,
  c.createdBy,
  c.summaryBy,
  ...c.checklist.flatMap((i) => [i.doneBy, i.noteBy]),
  ...(c.findings ?? []).flatMap((f) => [f.authorId, f.revisedBy]),
  ...(c.claims ?? []).flatMap((x) => [x.recordedBy, x.outcomeSetBy]),
  ...(c.statements ?? []).map((x) => x.recordedBy),
]

/** A timeline from what casework records: creation, assessment, checklist ticks and the current state. */
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
    ...(c.findings ?? []).map((f, i) => ({
      id: `${c.id}-${f.id}`,
      at: f.updatedAt,
      actor: name(f.revisedBy ?? f.authorId),
      kind: 'finding' as const,
      text:
        f.version > 1 ? `Finding F${i + 1} revised (v${f.version})` : `Finding F${i + 1} recorded`,
    })),
    ...(c.statements ?? []).map((x, i) => ({
      id: `${c.id}-${x.id}`,
      at: x.recordedAt,
      actor: name(x.recordedBy),
      kind: 'note' as const,
      text: `Statement S${i + 1} recorded: ${x.speaker}`,
    })),
    ...(c.claims ?? []).flatMap((x) => [
      {
        id: `${c.id}-${x.id}`,
        at: x.recordedAt,
        actor: name(x.recordedBy),
        kind: 'note' as const,
        text: `Claim recorded: “${x.text.length > 60 ? `${x.text.slice(0, 60)}…` : x.text}”`,
      },
      ...(x.outcomeSetAt
        ? [
            {
              id: `${c.id}-${x.id}-outcome`,
              at: x.outcomeSetAt,
              actor: name(x.outcomeSetBy),
              kind: 'review' as const,
              text: `Claim assessed: ${x.outcome}`,
            },
          ]
        : []),
    ]),
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
    summary: c.summary ?? '',
    summaryBy: c.summaryBy ? name(c.summaryBy) : undefined,
    summaryUpdatedAt: c.summaryUpdatedAt ?? undefined,
    authorId: c.createdBy,
    findings: (c.findings ?? []).map((f) => toFinding(f, name)),
    evidence: evidence.map(toEvidenceItem),
    // Indicators come from the analysis services, which report nothing yet (E19–E21).
    indicators: [],
    claims: (c.claims ?? []).map((x) => toClaim(x, name)),
    statements: (c.statements ?? []).map((x) => toStatement(x, name)),
    timeline: caseTimeline(c, name),
    checklist: c.checklist.map((i) => toChecklistLine(i, name)),
    mission: c.mission
      ? {
          templateKey: c.mission.templateKey,
          version: c.mission.templateVersion,
          name: c.mission.name,
        }
      : undefined,
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
    findingCount: c?.findings?.length ?? 0,
    evidenceCount: c?.items.length ?? 0,
    priority: toPriority(c?.priority),
    marking: DEFAULT_MARKING,
    // The case's version counts every edit, not submissions; casework doesn't count submissions
    // yet, so no resubmission badge rather than a misleading one.
    revision: 1,
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
          comment: d.comment ?? undefined,
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
    subjectType: a.subjectType,
    subjectId: a.subjectId,
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
// Briefs
// ---------------------------------------------------------------------------------------

export interface ProductDto {
  id: string
  caseId: string
  title: string
  authorId: string
  status: string
  currentVersion: number
  sentences: { order: number; text: string; supportRefs: string[]; section?: string | null }[]
  unsupportedSentences: number[]
  versions: {
    number: number
    createdBy: string
    createdAt: string
    releasedBy: string | null
    releasedAt: string | null
    sha256: string | null
    contentSha256?: string | null
    hasPdf?: boolean
    correctsVersion?: number | null
    correctionReason?: string | null
    supersededBy?: number | null
    supersededAt?: string | null
  }[]
  createdAt: string
  updatedAt: string
  version: number
}

export type SupportCheckDto = Omit<SupportCheck, 'sentences' | 'citable'> & {
  productId: string
  sentences: {
    order: number
    supported: boolean
    refs: { ref: string; resolves: boolean; label: string | null }[]
  }[]
  citable: { ref: string; kind: string; label: string; text: string }[]
}

export function toBrief(p: ProductDto, name: NameOf): Brief {
  return {
    id: p.id,
    caseId: p.caseId,
    title: p.title,
    authorId: p.authorId,
    authorName: name(p.authorId),
    status: p.status === 'released' || p.status === 'correcting' ? p.status : 'draft',
    currentVersion: p.currentVersion,
    sentences: [...p.sentences]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        text: s.text,
        supportRefs: s.supportRefs,
        ...(s.section ? { section: s.section } : {}),
      })),
    versions: p.versions.map((v) => ({
      number: v.number,
      createdById: v.createdBy,
      createdBy: name(v.createdBy),
      createdAt: v.createdAt,
      releasedBy: v.releasedBy ? name(v.releasedBy) : undefined,
      releasedAt: v.releasedAt ?? undefined,
      sha256: v.sha256 ?? undefined,
      hasPdf: !!v.hasPdf,
      correctsVersion: v.correctsVersion ?? undefined,
      correctionReason: v.correctionReason ?? undefined,
      supersededBy: v.supersededBy ?? undefined,
      supersededAt: v.supersededAt ?? undefined,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    etag: `"v${p.version}"`,
  }
}

export interface RecipientDto {
  recipientId: string
  source: string
  firstVersion: number
  recordedAt: string
}

const RECIPIENT_SOURCES = ['author', 'releaser', 'corrector', 'download'] as const

export function toRecipient(r: RecipientDto, name: NameOf): BriefRecipient {
  return {
    id: r.recipientId,
    name: name(r.recipientId),
    source: RECIPIENT_SOURCES.find((s) => s === r.source) ?? 'download',
    firstVersion: r.firstVersion,
    recordedAt: r.recordedAt,
  }
}

const CITABLE_KINDS = ['finding', 'claim', 'evidence'] as const

export function toSupportCheck(c: SupportCheckDto): SupportCheck {
  return {
    caseReference: c.caseReference,
    caseState: c.caseState,
    ready: c.ready,
    blockers: c.blockers,
    sentences: c.sentences.map((s) => ({
      ...s,
      refs: s.refs.map((r) => ({ ref: r.ref, resolves: r.resolves, label: r.label ?? undefined })),
    })),
    citable: c.citable
      .filter((x) => (CITABLE_KINDS as readonly string[]).includes(x.kind))
      .map((x) => ({ ...x, kind: x.kind as (typeof CITABLE_KINDS)[number] })),
  }
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
    tier: a.tier,
    lastEscalatedAt: a.lastEscalatedAt ?? undefined,
    acknowledgedBy: a.acknowledgedBy ? name(a.acknowledgedBy) : undefined,
    acknowledgedAt: a.acknowledgedAt ?? undefined,
    caseRef: a.caseId ? `CASE ${shortId(a.caseId)}` : undefined,
    reference: alertReference(a.id),
    etag: a.version === undefined ? undefined : `"v${a.version}"`,
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
    collection: {
      lastCrawlAt: s.collection?.lastCrawlAt ?? null,
      lastStoryAt: s.collection?.lastStoryAt ?? null,
      lastError: s.collection?.lastError ?? null,
      lastErrorAt: s.collection?.lastErrorAt ?? null,
    },
  }
}

export function toWatchFloor(raw: {
  kpis: WatchFloorSummary['kpis']
  sources: SourceDto[]
  /** Placed cases and stories of the last week, which the gateway shapes from search's /geo/events. */
  events?: MapEvent[]
}): WatchFloorSummary {
  return {
    kpis: raw.kpis,
    sources: raw.sources.map(toSourceHealth),
    events: raw.events ?? [],
    onDuty: [],
  }
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
    recordType: h.type,
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

const toWallScreen = (s: WallScreenDto): WallScreen => ({
  ...s,
  contextRef: s.contextRef ?? undefined,
  leaseExpiresAt: s.leaseExpiresAt ?? undefined,
})

/** The controller adapter is the simulator until the AV vendor's hardware is wired (E36). */
export function toWallState(w: WallStateDto, name: NameOf): WallState {
  const { version, published, controller, ...rest } = w
  return {
    ...rest,
    screens: rest.screens.map(toWallScreen),
    revision: version,
    controller: controller ?? 'simulated',
    updatedBy: name(w.updatedBy),
    published: published
      ? {
          id: published.id,
          ref: published.ref,
          revision: published.layoutVersion,
          preset: published.preset,
          publishedBy: name(published.publishedBy),
          publishedAt: published.publishedAt,
        }
      : undefined,
  }
}

export function toWallLayoutPublication(
  p: WallLayoutPublicationDto,
  name: NameOf,
): WallLayoutPublication {
  const { layoutVersion, failure, ...rest } = p
  return {
    ...rest,
    screens: p.screens.map(toWallScreen),
    revision: layoutVersion,
    publishedBy: name(p.publishedBy),
    failure: failure ?? undefined,
  }
}

export function toWallController(c: WallControllerDto): WallControllerStatus {
  return {
    ...c,
    layout: c.layout
      ? {
          publicationId: c.layout.publicationId,
          publicationRef: c.layout.publicationRef,
          preset: c.layout.preset,
          revision: c.layout.layoutVersion,
          screens: c.layout.screens.map(toWallScreen),
          groups: c.layout.groups,
        }
      : undefined,
    layoutActivatedAt: c.layoutActivatedAt ?? undefined,
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

// ---------------------------------------------------------------- CCTV requests (E31, ADR 0014)

export interface CctvRequestDto {
  id: string
  caseId: string
  status: CctvRequestStatus
  approvalId: string | null
  cameras: string[]
  location: string | null
  windowStart: string | null
  windowEnd: string | null
  attributes: string[]
  freeText: string | null
  lawfulBasis: string | null
  legalReference: string | null
  reason: string | null
  requestedBy: string
  requestedAt: string
  submittedAt: string | null
  decidedAt: string | null
  refusalCode: string | null
  version: number
}

/** A refusal code from cctv, in plain words for the analyst. */
export function cctvRefusalText(code: string): string {
  switch (code) {
    case 'approver_refused':
      return 'An approver refused the request.'
    case 'capability_not_authorised':
      return 'Refused by rule: CCTV search is switched off by policy, or your role may not ask for it.'
    case 'self_approval_forbidden':
      return 'Refused by governance: the approver cannot be the requester.'
    default:
      return `Refused by governance (${code}).`
  }
}

export function toCctvRequest(r: CctvRequestDto, name: NameOf, caseRef?: string): CctvRequest {
  return {
    id: r.id,
    caseId: r.caseId,
    caseRef,
    status: r.status,
    approvalId: r.approvalId ?? undefined,
    cameras: r.cameras,
    location: r.location ?? undefined,
    windowStart: r.windowStart ?? undefined,
    windowEnd: r.windowEnd ?? undefined,
    attributes: r.attributes,
    freeText: r.freeText ?? undefined,
    lawfulBasis: r.lawfulBasis ?? undefined,
    legalReference: r.legalReference ?? undefined,
    reason: r.reason ?? undefined,
    requesterId: r.requestedBy,
    requesterName: name(r.requestedBy),
    requestedAt: r.requestedAt,
    submittedAt: r.submittedAt ?? undefined,
    decidedAt: r.decidedAt ?? undefined,
    refusalCode: r.refusalCode ?? undefined,
    refusal: r.status === 'refused' && r.refusalCode ? cctvRefusalText(r.refusalCode) : undefined,
    etag: `"v${r.version}"`,
  }
}

// ---------------------------------------------------------------------------------------
// Missions (E29, ADR 0012)
// ---------------------------------------------------------------------------------------

export function toChecklistLine(i: ChecklistItemDto, name: NameOf): ChecklistLine {
  return {
    key: i.key,
    label: i.label,
    done: i.done,
    // Lines from before templates were all needed for Submit.
    required: i.required ?? true,
    doneBy: i.doneBy ? name(i.doneBy) : undefined,
    doneAt: i.doneAt ?? undefined,
    note: i.note ?? undefined,
    noteBy: i.noteBy ? name(i.noteBy) : undefined,
  }
}

/** casework's MissionTemplateView (camelCase). */
export interface MissionTemplateDto {
  id: string
  key: string
  name: string
  description: string | null
  categories: string[]
  currentVersion: number
  retired: boolean
  isDefault: boolean
  items: { key: string; label: string; required: boolean }[]
  versions: {
    number: number
    name: string
    items: { key: string; label: string; required: boolean }[]
    createdBy: string
    createdAt: string
  }[]
  createdBy: string
  createdAt: string
  updatedBy: string
  updatedAt: string
  version: number
}

export function toMissionTemplate(t: MissionTemplateDto, name: NameOf): MissionTemplate {
  return {
    key: t.key,
    name: t.name,
    description: t.description ?? '',
    categories: t.categories,
    currentVersion: t.currentVersion,
    retired: t.retired,
    isDefault: t.isDefault,
    items: t.items,
    versions: t.versions.map((v) => ({ ...v, createdBy: name(v.createdBy) })),
    updatedBy: name(t.updatedBy),
    updatedAt: t.updatedAt,
    etag: `"v${t.version}"`,
  }
}

/** The body casework expects: blanks dropped, labels and categories trimmed. */
export function fromMissionTemplateInput(input: MissionTemplateInput) {
  return {
    ...(input.key ? { key: input.key } : {}),
    name: input.name.trim(),
    description: input.description.trim() || null,
    categories: input.categories.map((c) => c.trim()).filter(Boolean),
    items: input.items
      .filter((i) => i.label.trim())
      .map((i) => ({ key: i.key, label: i.label.trim(), required: i.required })),
  }
}

// ---------------------------------------------------------------- name searches (E30, ADR 0013)

export interface NameSearchDto {
  id: string
  name: string
  kind: string
  caseId: string | null
  reason: string | null
  requestedBy: string
  requestedAt: string
  status: string
  approvalId: string | null
  approvalExpiresAt: string | null
  resultCount: number
  completedAt: string | null
  version: number
}

export interface NameMentionDto {
  id: string
  documentType: string
  documentId: string
  caseId: string | null
  title: string
  at: string
  source: string | null
  snippet: string | null
  score: number
  clusterId: string | null
}

export interface NameClusterDto {
  id: string
  terms: string[]
  mentionCount: number
  firstSeen: string
  lastSeen: string
  status: string
  decidedBy: string | null
  decidedAt: string | null
}

export interface NameReportDataDto {
  id: string
  nameSearchId: string
  name: string
  kind: string
  caseId: string | null
  createdBy: string
  createdAt: string
  retentionClass: string
  aggregates: {
    basis: string
    mentionCount: number
    clusterCount: number
    firstSeen: string | null
    lastSeen: string | null
    breakdowns: Record<string, { key: string; count: number }[]>
    caseIds: string[]
    clusters: { id: string; status: string; terms: string[]; mentionCount: number }[]
  }
}

const nameKind = (k: string): NameSearch['kind'] =>
  k === 'private_individual' ? 'private_individual' : 'public'

const clusterStatus = (s: string): NameCluster['status'] =>
  s === 'confirmed' || s === 'rejected' ? s : 'suggested'

export function toNameSearch(d: NameSearchDto, name: NameOf): NameSearch {
  return {
    id: d.id,
    name: d.name,
    kind: nameKind(d.kind),
    caseId: d.caseId ?? undefined,
    reason: d.reason ?? undefined,
    requestedBy: name(d.requestedBy),
    requestedAt: d.requestedAt,
    status: d.status as NameSearch['status'],
    approvalExpiresAt: d.approvalExpiresAt ?? undefined,
    resultCount: d.resultCount,
    completedAt: d.completedAt ?? undefined,
    etag: `"v${d.version}"`,
  }
}

export function toNameMention(d: NameMentionDto): NameMention {
  return {
    id: d.id,
    documentType: d.documentType,
    documentId: d.documentId,
    caseId: d.caseId ?? undefined,
    title: d.title,
    at: d.at,
    source: d.source ?? undefined,
    snippet: d.snippet ?? undefined,
    clusterId: d.clusterId ?? undefined,
  }
}

export function toNameCluster(d: NameClusterDto, name: NameOf): NameCluster {
  return {
    id: d.id,
    terms: d.terms,
    mentionCount: d.mentionCount,
    firstSeen: d.firstSeen,
    lastSeen: d.lastSeen,
    status: clusterStatus(d.status),
    decidedBy: d.decidedBy ? name(d.decidedBy) : undefined,
    decidedAt: d.decidedAt ?? undefined,
  }
}

export function toNameReportData(d: NameReportDataDto, name: NameOf): NameReportData {
  const a = d.aggregates
  return {
    id: d.id,
    nameSearchId: d.nameSearchId,
    name: d.name,
    kind: nameKind(d.kind),
    caseId: d.caseId ?? undefined,
    createdBy: name(d.createdBy),
    createdAt: d.createdAt,
    retentionClass: d.retentionClass === 'short' ? 'short' : 'standard',
    basis: a.basis === 'confirmed_clusters' ? 'confirmed_clusters' : 'all_results',
    mentionCount: a.mentionCount,
    clusterCount: a.clusterCount,
    firstSeen: a.firstSeen ?? undefined,
    lastSeen: a.lastSeen ?? undefined,
    breakdowns: a.breakdowns,
    caseIds: a.caseIds,
    clusters: a.clusters.map((c) => ({ ...c, status: clusterStatus(c.status) })),
  }
}

// ---------------------------------------------------------------------------------------
// Lessons and outcomes (E38)
// ---------------------------------------------------------------------------------------

export interface LessonDto {
  id: string
  caseId: string
  caseReference: string
  title: string
  observation: string
  recommendation: string
  templateKey: string | null
  appliedTemplateVersion: number | null
  appliedBy: string | null
  appliedAt: string | null
  recordedBy: string
  recordedAt: string
  updatedBy: string
  updatedAt: string
  version: number
}

export function toLesson(l: LessonDto, name: NameOf): Lesson {
  return {
    id: l.id,
    caseId: l.caseId,
    caseRef: l.caseReference,
    title: l.title,
    observation: l.observation,
    recommendation: l.recommendation,
    templateKey: l.templateKey ?? undefined,
    appliedVersion: l.appliedTemplateVersion ?? undefined,
    appliedBy: l.appliedBy ? name(l.appliedBy) : undefined,
    appliedAt: l.appliedAt ?? undefined,
    recordedById: l.recordedBy,
    recordedBy: name(l.recordedBy),
    recordedAt: l.recordedAt,
    updatedAt: l.updatedAt,
    etag: `"v${l.version}"`,
  }
}

/** Blank template keys are left out, so casework falls back to the case's own template. */
export function fromLessonInput(i: LessonInput) {
  return {
    title: i.title.trim(),
    observation: i.observation.trim(),
    recommendation: i.recommendation.trim(),
    templateKey: i.templateKey?.trim() || null,
  }
}

export interface OutcomesDto {
  period: string
  from: string
  to: string
  briefsReleased: number
  corrections: number
  correctionRate: number | null
  medianTimeToReleaseSeconds: number | null
  medianTimeToCorrectSeconds: number | null
  casesClosed: number
  lessonsRecorded: number
  alertsRaised: number
  alertsAcknowledged: number
  medianTimeToAcknowledgeSeconds: number | null
  feedbackRecorded: number | null
  daily: OutcomeDay[]
}

const PERIODS = ['7d', '30d', '90d'] as const

export function toOutcomes(o: OutcomesDto): Outcomes {
  return {
    period: PERIODS.find((p) => p === o.period) ?? '30d',
    from: o.from,
    to: o.to,
    briefsReleased: o.briefsReleased,
    corrections: o.corrections,
    correctionRate: o.correctionRate ?? undefined,
    medianTimeToRelease: o.medianTimeToReleaseSeconds ?? undefined,
    medianTimeToCorrect: o.medianTimeToCorrectSeconds ?? undefined,
    casesClosed: o.casesClosed,
    lessonsRecorded: o.lessonsRecorded,
    alertsRaised: o.alertsRaised,
    alertsAcknowledged: o.alertsAcknowledged,
    medianTimeToAcknowledge: o.medianTimeToAcknowledgeSeconds ?? undefined,
    feedbackRecorded: o.feedbackRecorded ?? undefined,
    daily: o.daily,
  }
}

// ---------------------------------------------------------------- geo (E32, ADR 0018)

export interface PlaceDto {
  id: string
  name: string
  kind: Place['kind']
  featureCode: string
  country: string
  admin1Id: string | null
  admin1Name: string | null
  admin2Id: string | null
  admin2Name: string | null
  lat: number
  lon: number
  population: number
  aliases: string[]
}

export function toPlace(p: PlaceDto): Place {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    featureCode: p.featureCode,
    country: p.country,
    admin1Id: p.admin1Id ?? undefined,
    admin1Name: p.admin1Name ?? undefined,
    admin2Id: p.admin2Id ?? undefined,
    admin2Name: p.admin2Name ?? undefined,
    lat: p.lat,
    lon: p.lon,
    population: p.population,
    aliases: p.aliases ?? [],
  }
}

export type GazetteerDatasetDto = GazetteerDataset

export interface GeoLocationDto {
  id: string
  subjectType: GeoLocation['subjectType']
  subjectId: string
  caseId: string | null
  subjectTitle: string
  subjectAt: string
  placeId: string | null
  admin1Id: string | null
  label: string
  lat: number
  lon: number
  precision: GeoLocation['precision']
  origin: GeoLocation['origin']
  note: string | null
  addedBy: string
  addedAt: string
  confirmedBy: string | null
  confirmedAt: string | null
  removed: boolean
  version: number
}

/** `name` turns the account ids in addedBy / confirmedBy into people's names. */
export function toGeoLocation(
  l: GeoLocationDto,
  name: (id?: string | null) => string,
): GeoLocation {
  return {
    id: l.id,
    subjectType: l.subjectType,
    subjectId: l.subjectId,
    caseId: l.caseId ?? undefined,
    subjectTitle: l.subjectTitle,
    subjectAt: l.subjectAt,
    placeId: l.placeId ?? undefined,
    admin1Id: l.admin1Id ?? undefined,
    label: l.label,
    lat: l.lat,
    lon: l.lon,
    precision: l.precision,
    origin: l.origin,
    note: l.note ?? undefined,
    addedBy: l.origin === 'extracted' ? 'Place extraction' : name(l.addedBy),
    addedAt: l.addedAt,
    confirmedBy: l.confirmedBy ? name(l.confirmedBy) : undefined,
    confirmedAt: l.confirmedAt ?? undefined,
    version: l.version,
  }
}

export type MapLayerDto = MapLayer

/** GeoJSON as search returns it (RFC 7946). */
export interface MapFeatureCollectionDto {
  type: 'FeatureCollection'
  truncated: boolean
  features: {
    type: 'Feature'
    id: string
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: {
      layer: MapFeature['layer']
      subjectType: MapFeature['subjectType']
      subjectId: string
      caseId: string | null
      title: string
      label: string
      placeId: string | null
      precision: MapFeature['precision']
      origin: MapFeature['origin']
      at: string
    }
  }[]
}

export function toMapFeatures(c: MapFeatureCollectionDto): {
  features: MapFeature[]
  truncated: boolean
} {
  return {
    truncated: c.truncated,
    features: c.features.map((f) => ({
      id: f.id,
      layer: f.properties.layer,
      subjectType: f.properties.subjectType,
      subjectId: f.properties.subjectId,
      caseId: f.properties.caseId ?? undefined,
      title: f.properties.title,
      label: f.properties.label,
      placeId: f.properties.placeId ?? undefined,
      precision: f.properties.precision,
      origin: f.properties.origin,
      at: f.properties.at,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    })),
  }
}

export type MapAreaDto = MapArea

// ---------------------------------------------------------------- leadership questions and feedback (E37, ADR 0020)

export interface RequirementDto {
  id: string
  title: string
  detail: string | null
  status: string
  expiresAt: string
  createdBy: string
  createdAt: string
  questionId: string | null
  closedReason: string | null
  closedAt: string | null
  version: number
}

export interface QuestionDto {
  id: string
  text: string
  context: string | null
  neededBy: string | null
  status: string
  askedBy: string
  askedAt: string
  requirement: { id: string; title: string; status: string; expiresAt: string } | null
  acceptedBy: string | null
  acceptedAt: string | null
  answer: string | null
  briefIds: string[] | null
  answeredBy: string | null
  answeredAt: string | null
  declinedReason: string | null
  declinedBy: string | null
  declinedAt: string | null
  version: number
}

export interface FeedbackDto {
  id: string
  productId: string
  productVersion: number
  rating: string
  comment: string | null
  givenBy: string
  givenAt: string
  changedAt: string | null
}

const QUESTION_STATUSES: QuestionStatus[] = ['asked', 'accepted', 'answered', 'declined']
const REQUIREMENT_STATUSES: RequirementStatus[] = ['active', 'expired', 'closed']
const FEEDBACK_RATINGS: FeedbackRating[] = ['useful', 'partly_useful', 'not_useful']

// An unknown requirement status is shown as expired: never as live when we can't tell.
const requirementStatus = (s: string): RequirementStatus =>
  REQUIREMENT_STATUSES.includes(s as RequirementStatus) ? (s as RequirementStatus) : 'expired'

const personOrNull = (id: string | null, name: NameOf) => (id ? { id, name: name(id) } : null)

export function toRequirement(r: RequirementDto, name: NameOf): Requirement {
  return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    status: requirementStatus(r.status),
    expiresAt: r.expiresAt,
    createdBy: { id: r.createdBy, name: name(r.createdBy) },
    createdAt: r.createdAt,
    questionId: r.questionId,
    closedReason: r.closedReason,
    etag: `"v${r.version}"`,
  }
}

export function toQuestion(q: QuestionDto, name: NameOf): Question {
  return {
    id: q.id,
    text: q.text,
    context: q.context,
    neededBy: q.neededBy,
    // An unknown status is shown as asked: still waiting, never as settled.
    status: QUESTION_STATUSES.includes(q.status as QuestionStatus)
      ? (q.status as QuestionStatus)
      : 'asked',
    askedBy: { id: q.askedBy, name: name(q.askedBy) },
    askedAt: q.askedAt,
    requirement: q.requirement
      ? { ...q.requirement, status: requirementStatus(q.requirement.status) }
      : null,
    acceptedBy: personOrNull(q.acceptedBy, name),
    acceptedAt: q.acceptedAt,
    answer: q.answer,
    briefIds: q.briefIds ?? [],
    answeredBy: personOrNull(q.answeredBy, name),
    answeredAt: q.answeredAt,
    declinedReason: q.declinedReason,
    declinedBy: personOrNull(q.declinedBy, name),
    declinedAt: q.declinedAt,
    etag: `"v${q.version}"`,
  }
}

export function toBriefFeedback(f: FeedbackDto, name: NameOf): BriefFeedback {
  return {
    id: f.id,
    productId: f.productId,
    productVersion: f.productVersion,
    // An unknown rating is shown as partly useful rather than dropped.
    rating: FEEDBACK_RATINGS.includes(f.rating as FeedbackRating)
      ? (f.rating as FeedbackRating)
      : 'partly_useful',
    comment: f.comment,
    givenBy: { id: f.givenBy, name: name(f.givenBy) },
    givenAt: f.givenAt,
    changedAt: f.changedAt,
  }
}

/** The body of POST /questions/{id}/accept: an existing requirement, or a new one. */
export function fromAcceptQuestionInput(input: AcceptQuestionInput) {
  return 'requirementId' in input
    ? { requirementId: input.requirementId }
    : {
        title: input.title?.trim() || undefined,
        detail: input.detail?.trim() || undefined,
        expiresAt: input.expiresAt,
      }
}

// ---------------------------------------------------------------------------------------
// E34: review history and the wall renderer (ADR 0019)
// ---------------------------------------------------------------------------------------

/** A case's CASE_REVIEW gates, newest first; a rejected gate is a return to the analyst. */
export function toReviewHistory(gates: ApprovalDto[], name: NameOf): ReviewHistoryEntry[] {
  return [...gates]
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
    .map((a) => {
      const d = a.decisions[a.decisions.length - 1]
      return {
        approvalId: a.id,
        requestedAt: a.requestedAt,
        outcome:
          a.status === 'approved'
            ? 'approved'
            : a.status === 'rejected'
              ? 'returned'
              : a.status === 'expired'
                ? 'expired'
                : 'pending',
        decidedBy: d ? name(d.decidedBy) : undefined,
        decidedAt: d?.decidedAt,
        comment: d?.comment ?? undefined,
      }
    })
}

export interface WallRendererTokenDto {
  id: string
  ref: string
  label: string
  issuedBy: string
  issuedAt: string
  revokedBy: string | null
  revokedAt: string | null
  lastSeenAt: string | null
  version: number
}

export function toRendererToken(t: WallRendererTokenDto, name: NameOf): WallRendererToken {
  return {
    id: t.id,
    ref: t.ref,
    label: t.label,
    issuedBy: name(t.issuedBy),
    issuedAt: t.issuedAt,
    revokedBy: t.revokedBy ? name(t.revokedBy) : undefined,
    revokedAt: t.revokedAt ?? undefined,
    lastSeenAt: t.lastSeenAt ?? undefined,
  }
}

export interface WallZoneDto {
  id: string
  cells: number[]
  content: WallContentKey
  contextRef: string | null
  muted: boolean
}

export interface WallZonesDto {
  published: WallPublishedDto | null
  visitorMode: boolean
  rows: number
  cols: number
  zones: WallZoneDto[]
  at: string
}

export interface WallZoneContentDto {
  zone: WallZoneDto
  source: WallZoneContent['source']
  items: { kind: 'brief'; ref: string; title: string; detail: string | null; at: string | null }[]
  counts: { key: string; label: string; count: number }[]
  at: string
}

const toWallZone = (z: WallZoneDto): WallZone => ({
  id: z.id,
  cells: z.cells,
  content: z.content,
  contextRef: z.contextRef ?? undefined,
  muted: z.muted,
})

/** A display has no account to look names up with, so who published stays as the id. */
export function toWallZones(w: WallZonesDto): WallZones {
  const p = w.published
  return {
    published: p
      ? {
          id: p.id,
          ref: p.ref,
          revision: p.layoutVersion,
          preset: p.preset,
          publishedBy: p.publishedBy,
          publishedAt: p.publishedAt,
        }
      : undefined,
    visitorMode: w.visitorMode,
    rows: w.rows,
    cols: w.cols,
    zones: w.zones.map(toWallZone),
    at: w.at,
  }
}

export function toWallZoneContent(c: WallZoneContentDto): WallZoneContent {
  return {
    zone: toWallZone(c.zone),
    source: c.source,
    items: c.items.map((i) => ({
      kind: i.kind,
      ref: i.ref,
      title: i.title,
      detail: i.detail ?? undefined,
      at: i.at ?? undefined,
    })),
    counts: c.counts,
    at: c.at,
  }
}

// ---------------------------------------------------------------------------------------
// Retention, disposal and integrity (evidence, E39, ADR 0021)
// ---------------------------------------------------------------------------------------

export interface RetentionScheduleDto {
  evidenceId: string
  caseId: string | null
  retentionClass: string
  classLabel: string
  placeholder: boolean
  anchorAt: string
  expiresAt: string | null
  lockedUntil: string
  dueAt: string | null
  due: boolean
  legalHold: boolean
  legalHoldReason: string | null
  legalHoldBy: string | null
  legalHoldAt: string | null
  disposalId: string | null
  disposedAt: string | null
  version: number
}

export interface RetentionItemDto {
  retention: RetentionScheduleDto
  contentType: string
  sizeBytes: number
  sha256: string
  role: string | null
  sourceUrl: string | null
  status: RetentionItem['status']
  registeredAt: string
}

export interface DisposalItemDto {
  evidenceId: string
  sha256: string
  sizeBytes: number
  contentType: string
  caseId: string | null
  retentionClass: string
  dueAt: string
  status: DisposalItem['status']
  disposedAt: string | null
  certificateId: string | null
}

export interface DisposalDto {
  id: string
  status: DisposalStatus
  reason: string
  requestedBy: string
  requestedAt: string
  approvalId: string | null
  approvalType: string | null
  settledAt: string | null
  completedAt: string | null
  items: DisposalItemDto[]
  version: number
}

export interface DisposalExecutionDto {
  disposal: DisposalDto
  certificateId: string | null
  disposed: string[]
  blocked: { evidenceId: string; code: string; message: string }[]
}

export interface DisposalCertificateDto {
  id: string
  disposalId: string
  approvalId: string
  issuedAt: string
  issuedBy: string
  itemCount: number
  sha256: string
  previousSha256: string | null
  verified: boolean
  body: string
}

export interface IntegrityRunDto {
  id: string
  trigger: IntegrityRun['trigger']
  startedBy: string
  startedAt: string
  finishedAt: string | null
  rate: number
  checked: number
  passed: number
  failed: number
  unreachable: number
}

export interface IntegrityCheckDto {
  evidenceId: string
  checkedAt: string
  outcome: IntegrityCheck['outcome']
  expectedSha256: string
  actualSha256: string | null
  timestampStatus: string
  detail: string | null
}

export function toRetentionSchedule(s: RetentionScheduleDto, name: NameOf): RetentionSchedule {
  return {
    evidenceId: s.evidenceId,
    caseId: s.caseId ?? undefined,
    retentionClass: s.retentionClass,
    classLabel: s.classLabel,
    placeholder: s.placeholder,
    anchorAt: s.anchorAt,
    expiresAt: s.expiresAt ?? undefined,
    lockedUntil: s.lockedUntil,
    dueAt: s.dueAt ?? undefined,
    due: s.due,
    legalHold: s.legalHold,
    legalHoldReason: s.legalHoldReason ?? undefined,
    legalHoldBy: s.legalHoldBy ? name(s.legalHoldBy) : undefined,
    legalHoldAt: s.legalHoldAt ?? undefined,
    disposalId: s.disposalId ?? undefined,
    disposedAt: s.disposedAt ?? undefined,
    etag: `"v${s.version}"`,
  }
}

export function toRetentionItem(i: RetentionItemDto, name: NameOf): RetentionItem {
  return {
    schedule: toRetentionSchedule(i.retention, name),
    contentType: i.contentType,
    sizeBytes: i.sizeBytes,
    sha256: i.sha256,
    role: i.role ?? undefined,
    sourceUrl: i.sourceUrl ?? undefined,
    status: i.status,
    registeredAt: i.registeredAt,
  }
}

export function toDisposal(d: DisposalDto, name: NameOf): Disposal {
  return {
    id: d.id,
    status: d.status,
    reason: d.reason,
    requesterId: d.requestedBy,
    requesterName: name(d.requestedBy),
    requestedAt: d.requestedAt,
    approvalId: d.approvalId ?? undefined,
    approvalType: (d.approvalType ?? undefined) as ApprovalType | undefined,
    settledAt: d.settledAt ?? undefined,
    completedAt: d.completedAt ?? undefined,
    items: d.items.map((i) => ({
      evidenceId: i.evidenceId,
      sha256: i.sha256,
      sizeBytes: i.sizeBytes,
      contentType: i.contentType,
      caseId: i.caseId ?? undefined,
      retentionClass: i.retentionClass,
      dueAt: i.dueAt,
      status: i.status,
      disposedAt: i.disposedAt ?? undefined,
      certificateId: i.certificateId ?? undefined,
    })),
    etag: `"v${d.version}"`,
  }
}

export function toDisposalExecution(e: DisposalExecutionDto, name: NameOf): DisposalExecution {
  return {
    disposal: toDisposal(e.disposal, name),
    certificateId: e.certificateId ?? undefined,
    disposed: e.disposed,
    blocked: e.blocked,
  }
}

export function toDisposalCertificate(
  c: DisposalCertificateDto,
  name: NameOf,
): DisposalCertificate {
  return {
    id: c.id,
    disposalId: c.disposalId,
    approvalId: c.approvalId,
    issuedAt: c.issuedAt,
    issuedById: c.issuedBy,
    issuedByName: name(c.issuedBy),
    itemCount: c.itemCount,
    sha256: c.sha256,
    previousSha256: c.previousSha256 ?? undefined,
    verified: c.verified,
    body: c.body,
  }
}

export function toIntegrityRun(r: IntegrityRunDto, name: NameOf): IntegrityRun {
  return { ...r, startedBy: name(r.startedBy), finishedAt: r.finishedAt ?? undefined }
}

export function toIntegrityRunDetail(
  d: { run: IntegrityRunDto; checks: IntegrityCheckDto[] },
  name: NameOf,
): IntegrityRunDetail {
  return {
    run: toIntegrityRun(d.run, name),
    checks: d.checks.map((c) => ({
      ...c,
      actualSha256: c.actualSha256 ?? undefined,
      detail: c.detail ?? undefined,
    })),
  }
}
