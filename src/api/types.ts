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
  escalatesAt?: string
  acknowledgedBy?: string
  caseRef?: string
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

export interface Finding {
  id: string
  statement: string
  confidence: 'high' | 'moderate' | 'low'
  basis: string
  authorName: string
  recordedAt: string
  evidenceIds: string[]
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

export interface Claim {
  id: string
  text: string
  attributedTo: string
  outcome: 'unassessed' | 'supported' | 'contradicted' | 'inconclusive'
  supportingEvidence: number
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
  checklist: { label: string; done: boolean }[]
  /** ETag for If-Match on mutations. */
  etag: string
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
  'job.progress': JobProgress
  'wall.state': WallState
}

export type LiveEventName = keyof LiveEventMap
