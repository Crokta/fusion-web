/**
 * Wire types for the gateway's /api/v1 surface.
 *
 * These mirror the screen-shaped responses the gateway composes (Section 4.1: the case page is
 * case + findings + evidence + indicators in one call). When the OpenAPI contracts land these
 * are replaced by openapi-typescript output; until then this file is the contract the backend
 * matches. Timestamps are ISO 8601 strings in UTC; IDs are opaque strings (UUIDv7 server side,
 * human references such as INV-0264 travel in `ref`).
 */

export type Role =
  | 'analyst'
  | 'supervisor'
  | 'reviewer'
  | 'centre_lead'
  | 'evidence_officer'
  | 'leadership'
  | 'admin'

export const ROLE_LABEL: Record<Role, string> = {
  analyst: 'Analyst',
  supervisor: 'Supervisor',
  reviewer: 'Reviewer',
  centre_lead: 'Centre lead',
  evidence_officer: 'Evidence officer',
  leadership: 'Leadership',
  admin: 'Administrator',
}

/** Sensitivity marking carried by every record and printed on every surface that shows it. */
export type Marking = 'OFFICIAL' | 'OFFICIAL-SENSITIVE' | 'SECRET'

export type Priority = 'high' | 'medium' | 'low'

export interface Page<T> {
  items: T[]
  nextCursor: string | null
  total?: number
}

export interface Me {
  id: string
  name: string
  email: string
  roles: Role[]
  activeRole: Role
  device: string
}

// ---------------------------------------------------------------- watch floor

export interface Kpi {
  key: string
  label: string
  value: number
  unit?: string
  delta?: number
  /** Short series for the sparkline, oldest first. */
  trend: number[]
  tone: 'cyan' | 'green' | 'amber' | 'red'
}

export interface SourceHealth {
  key: string
  name: string
  status: 'healthy' | 'degraded' | 'down'
  lagSeconds: number
}

export interface MapEvent {
  id: string
  title: string
  place: string
  lat: number
  lon: number
  priority: Priority
  /** Locations are always marked confirmed or estimated (search rules, Section 7.1). */
  precision: 'confirmed' | 'estimated'
  caseRef?: string
}

export interface WatchFloorSummary {
  kpis: Kpi[]
  sources: SourceHealth[]
  events: MapEvent[]
  onDuty: { name: string; role: Role; desk: string }[]
}

// ---------------------------------------------------------------- feed

export interface Story {
  id: string
  outlet: string
  headline: string
  url: string
  publishedAt: string
  official: boolean
}

export interface StoryGroup {
  id: string
  headline: string
  summary: string
  place: string
  channel: 'security' | 'public-safety' | 'politics' | 'economy' | 'health' | 'information'
  priority: Priority
  firstSeen: string
  lastUpdated: string
  /** Independent outlets: repetition by syndicated copies does not count as corroboration. */
  independentOutlets: number
  stories: Story[]
  caseRef?: string
  marking: Marking
}

// ---------------------------------------------------------------- alerts

export type AlertStatus = 'open' | 'acknowledged' | 'escalated' | 'resolved'

export interface Alert {
  id: string
  title: string
  detail: string
  severity: Priority
  status: AlertStatus
  raisedAt: string
  rule: string
  /** Escalation tier currently responsible, 0 = duty analyst. */
  escalationLevel: number
  /** Who that tier is: analyst, supervisor or centre lead. */
  tier?: DutyTier
  escalatesAt?: string
  lastEscalatedAt?: string
  acknowledgedBy?: string
  acknowledgedAt?: string
  caseRef?: string
  /** "ALT-…": what a message about this alert calls it. */
  reference?: string
  etag?: string
}

// ---------------------------------------------------------------- duty roster and delivery

export type DutyTier = 'analyst' | 'supervisor' | 'centre_lead'

export const TIER_LABEL: Record<DutyTier, string> = {
  analyst: 'Duty analyst',
  supervisor: 'Supervisor',
  centre_lead: 'Centre lead',
}

export const TIERS: DutyTier[] = ['analyst', 'supervisor', 'centre_lead']

export interface DutyShift {
  id: string
  tier: DutyTier
  userId: string
  name: string
  startsAt: string
  endsAt: string
  email?: string
  /** E.164, e.g. +2348012345678. */
  phone?: string
  createdBy: string
}

export interface ShiftInput {
  tier: DutyTier
  userId: string
  name: string
  startsAt: string
  endsAt: string
  email?: string
  phone?: string
}

export interface OnDuty {
  tier: DutyTier
  people: DutyShift[]
}

export type DeliveryChannel = 'in_app' | 'email' | 'sms'
export type DeliveryStatus = 'pending' | 'sent' | 'failed'

/** One message about one alert to one person on one channel. In-app ones are the notices. */
export interface Delivery {
  id: string
  alertId: string
  reference: string
  level: number
  recipientId: string
  recipientName: string
  channel: DeliveryChannel
  address?: string
  subject: string
  link: string
  status: DeliveryStatus
  attempts: number
  lastError?: string
  createdAt: string
  sentAt?: string
  readAt?: string
  /** Set on an email sent because this SMS failed. */
  fallbackFor?: string
}

/** Someone found in the directory, to put on the roster. */
export interface PersonContact {
  id: string
  name: string
  username?: string
  email?: string
}

// ---------------------------------------------------------------- cases

export type CaseState =
  | 'triage'
  | 'open'
  | 'in_assessment'
  | 'submitted'
  | 'returned'
  | 'approved'
  | 'released'
  | 'closed'

export interface CaseSummary {
  id: string
  ref: string
  title: string
  state: CaseState
  priority: Priority
  category: string
  place: string
  owner: { id: string; name: string }
  deadline: string
  updatedAt: string
  signalCount: number
  evidenceCount: number
  marking: Marking
}

export type Confidence = 'high' | 'moderate' | 'low'

export interface Finding {
  id: string
  /** The judgement itself, as it would read in a brief. */
  statement: string
  confidence: Confidence
  /** What it rests on and what limits it. */
  basis: string
  authorName: string
  recordedAt: string
  evidenceIds: string[]
  /** Statements it cites (casework); absent in the mock. */
  statementIds?: string[]
  revisedBy?: string
  /** The finding's own version, sent as If-Match when it is revised. */
  version?: number
}

export type StatementChannel = 'official' | 'witness' | 'interview' | 'press' | 'other'

/** A sourced account recorded on the case: who said what, when, and how it reached us. */
export interface CaseStatement {
  id: string
  speaker: string
  speakerRole?: string
  channel: StatementChannel
  givenAt?: string
  text: string
  evidenceId?: string
  recordedBy: string
  recordedAt: string
}

export interface EvidenceItem {
  id: string
  ref: string
  kind: 'image' | 'video' | 'document' | 'web-capture' | 'audio' | 'statement'
  title: string
  source: string
  capturedAt: string
  sha256: string
  custodyEvents: number
  marking: Marking
  /** What the file is, e.g. "Web archive (WARC)"; falls back to the kind. */
  label?: string
  /** The original link for captures; the title is then the label. */
  link?: string
  /** An RFC 3161 token is stored for the original. */
  timestamped?: boolean
}

/** Model output. Indicators inform analysts; they never set a finding (Section 7). */
export interface Indicator {
  id: string
  kind: string
  model: string
  modelVersion: string
  confidence: number
  result: string
  limitations: string
  evidenceId?: string
  producedAt: string
}

export type ClaimOutcome = 'unassessed' | 'supported' | 'contradicted' | 'inconclusive'

export interface Claim {
  id: string
  text: string
  attributedTo: string
  outcome: ClaimOutcome
  /** How many originals and statements the outcome cites. */
  supportingEvidence: number
  rationale?: string
  evidenceIds?: string[]
  statementIds?: string[]
  outcomeSetBy?: string
}

export interface TimelineEntry {
  id: string
  at: string
  actor: string
  kind: 'state' | 'evidence' | 'finding' | 'indicator' | 'note' | 'assignment' | 'review'
  text: string
}

export interface CaseDetail extends CaseSummary {
  summary: string
  authorId: string
  findings: Finding[]
  evidence: EvidenceItem[]
  indicators: Indicator[]
  claims: Claim[]
  timeline: TimelineEntry[]
  checklist: { key?: string; label: string; done: boolean }[]
  statements?: CaseStatement[]
  summaryBy?: string
  summaryUpdatedAt?: string
  /** ETag for If-Match on mutations. */
  etag: string
}

/** A finding as written (also a revision, which replaces it whole). */
export interface FindingInput {
  statement: string
  confidence: Confidence
  basis: string
  evidenceIds: string[]
  statementIds: string[]
}

export interface StatementInput {
  speaker: string
  speakerRole?: string
  channel: StatementChannel
  givenAt?: string
  text: string
  evidenceId?: string
}

export interface ClaimOutcomeInput {
  outcome: ClaimOutcome
  rationale: string
  evidenceIds: string[]
  statementIds: string[]
}

// ---------------------------------------------------------------- briefs

export type BriefStatus = 'draft' | 'released'

/** One sentence and what it rests on: `finding:<id>`, `claim:<id>` or `evidence:<id>`. */
export interface BriefSentence {
  text: string
  supportRefs: string[]
}

export interface BriefVersion {
  number: number
  createdBy: string
  createdAt: string
  releasedBy?: string
  releasedAt?: string
  /** SHA-256 of the released PDF: what ProductReleased carries. */
  sha256?: string
  hasPdf: boolean
}

/** A brief (reporting's product): drafted from a case's approved findings, released by someone else. */
export interface Brief {
  id: string
  caseId: string
  title: string
  authorId: string
  authorName: string
  status: BriefStatus
  currentVersion: number
  sentences: BriefSentence[]
  versions: BriefVersion[]
  createdAt: string
  updatedAt: string
  etag: string
}

/** Something of the case a sentence can cite, labelled as the case page labels it (F1, C1, EV-…). */
export interface Citable {
  ref: string
  kind: 'finding' | 'claim' | 'evidence'
  label: string
  text: string
}

/** The support check: each sentence's references resolved against the case as it stands. */
export interface SupportCheck {
  caseReference: string
  caseState: string
  ready: boolean
  blockers: string[]
  sentences: {
    order: number
    supported: boolean
    refs: { ref: string; resolves: boolean; label?: string }[]
  }[]
  citable: Citable[]
}

// ---------------------------------------------------------------- sources

export type SourceKind = 'feed' | 'site' | 'social' | 'official'
export type SourceStatus = 'proposed' | 'approved' | 'suspended'
/** Admiralty-style source reliability, A (reliable) to F (cannot be judged). */
export type Reliability = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

/** An entry in intake's source register: only approved sources are collected from. */
export interface SourceRecord {
  id: string
  name: string
  kind: SourceKind
  url: string
  host: string
  reliability: Reliability | null
  status: SourceStatus
  proposedBy: { id: string; name: string }
  proposedAt: string
  approvedBy: { id: string; name: string } | null
  approvedAt: string | null
  suspendedReason: string | null
  suspendedAt: string | null
  etag: string
}

export interface SourceInput {
  name: string
  kind: SourceKind
  url: string
  reliability: Reliability | null
}

// ---------------------------------------------------------------- triage

export type TriageStatus = 'pending' | 'promoted' | 'dismissed'

/** A story an analyst sent to triage; its originals are preserved while it waits. */
export interface TriageItem {
  id: string
  storyId: string | null
  headline: string
  summary: string
  url: string
  outlet: string
  status: TriageStatus
  sentAt: string
  caseId: string | null
  promotedAt: string | null
  promotedBy: string | null
  evidence: EvidenceItem[]
  /** Preservation runs after the item is created; until it lands, there is nothing to show. */
  evidenceCount: number
  etag: string
}

export interface PromoteInput {
  title: string
  ownerId: string
  priority: Priority
  deadline: string
}

// ---------------------------------------------------------------- review

export interface ReviewItem {
  caseId: string
  caseRef: string
  title: string
  authorId: string
  authorName: string
  submittedAt: string
  dueAt: string
  findingCount: number
  evidenceCount: number
  priority: Priority
  marking: Marking
  revision: number
}

export type ReviewDecision = 'approve' | 'return'

// ---------------------------------------------------------------- governance

export type ApprovalType =
  'CASE_REVIEW' | 'PI_SEARCH' | 'CCTV_SEARCH' | 'CORRECTION' | 'RETENTION_EXTENSION'

export interface ApprovalStep {
  role: Role | 'evidence_officer'
  decidedBy?: string
  decision?: 'approve' | 'refuse'
  decidedAt?: string
}

export interface Approval {
  id: string
  type: ApprovalType
  subject: string
  justification: string
  requesterId: string
  requesterName: string
  requestedAt: string
  expiresAt?: string
  status: 'pending' | 'approved' | 'refused' | 'expired'
  steps: ApprovalStep[]
  caseRef?: string
  /** Scope limits the gate enforces, e.g. "≤ 14 days" or "24 h window". */
  scope: string
}

export interface PolicyRecord {
  key: string
  label: string
  description: string
  value: boolean
  version: number
  authorityRef: string
  changedBy: string
  changedAt: string
}

export interface AuditEvent {
  id: string
  at: string
  actor: string
  role: Role | 'service'
  action: string
  target: string
  outcome: 'allowed' | 'refused'
  purpose?: string
  rowHash: string
}

// ---------------------------------------------------------------- search and items

export type SearchKind = 'person' | 'location' | 'news' | 'social' | 'media' | 'alert' | 'case'

export interface SearchHit {
  id: string
  kind: SearchKind
  title: string
  summary: string
  /** The summary with the matched words wrapped in <mark>…</mark>, as the index returns it. */
  highlight?: string
  place: string
  source: string
  caseRef?: string
  at: string
  marking: Marking
}

export interface SearchResponse {
  items: SearchHit[]
  facets: Record<SearchKind, number>
  tookMs: number
}

export interface ItemDetail extends SearchHit {
  detail: string
  images: { id: string; caption: string; hue: number }[]
  similar: { id: string; title: string; score: number; firstSeen: string }[]
  metadata: { key: string; value: string }[]
  entities: {
    name: string
    type: 'person' | 'organisation' | 'location' | 'event'
    mentions: number
  }[]
  locations: { name: string; lat: number; lon: number; precision: 'confirmed' | 'estimated' }[]
  related: SearchHit[]
}

// ---------------------------------------------------------------- wall

export type WallContentKey =
  | 'news'
  | 'news-analytics'
  | 'social'
  | 'trending'
  | 'map-ng'
  | 'map-region'
  | 'events'
  | 'risk'
  | 'media-images'
  | 'video'
  | 'alerts'
  | 'verification'
  | 'cases'
  | 'entities'
  | 'system'
  | 'live-feeds'

export type WallPresetKey = 'standing' | 'incident' | 'verification' | 'briefing'

export interface WallPreset {
  key: WallPresetKey
  name: string
  description: string
  /** Content for each of the 16 physical screens, row-major. */
  screens: WallContentKey[]
  groups: Omit<WallGroup, 'id'>[]
}

export interface WallGroup {
  id: string
  /** Physical screen indexes (row-major, 0-15) forming a rectangle. */
  cells: number[]
  content: WallContentKey
}

export interface WallScreen {
  index: number
  content: WallContentKey
  /** Optional incident key or case reference the content is filtered to. */
  contextRef?: string
  leaseExpiresAt?: string
}

export interface WallState {
  revision: number
  preset: WallPresetKey | 'custom'
  rows: number
  cols: number
  screens: WallScreen[]
  groups: WallGroup[]
  visitorMode: boolean
  controller: 'online' | 'simulated' | 'offline'
  updatedAt: string
  updatedBy: string
}

export interface WallPublication {
  id: string
  ref: string
  content: WallContentKey
  targets: number[]
  contextRef?: string
  requestedBy: string
  requestedAt: string
  note?: string
  status: 'pending' | 'approved' | 'rejected'
}

// ---------------------------------------------------------------- realtime

export interface JobProgress {
  jobId: string
  label: string
  percent: number
  caseRef?: string
}

export interface LiveEventMap {
  'story.published': StoryGroup
  'alert.raised': Alert
  /** A notice reached someone. The payload is ids only; each screen refetches its own. */
  'notification.delivered': { alertId: string; channel: DeliveryChannel }
  'job.progress': JobProgress
  'wall.state': WallState
}

export type LiveEventName = keyof LiveEventMap
