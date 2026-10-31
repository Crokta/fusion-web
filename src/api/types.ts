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
  checklist: ChecklistLine[]
  /** The mission template version the checklist was copied from (E29, ADR 0012). */
  mission?: CaseMission
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
  collection: SourceCollection
}

/** How collection of a source is going (intake records the crawl scheduler and the collector's results). */
export interface SourceCollection {
  lastCrawlAt: string | null
  lastStoryAt: string | null
  /** The collector's stable error code for the last failed crawl, until a story comes in again. */
  lastError: string | null
  lastErrorAt: string | null
}

/** intake's POST /sources/import: each new address becomes a proposal; duplicates and bad rows are reported. */
export interface SourceImportResult {
  created: SourceRecord[]
  skipped: { index: number; url: string; reason: string }[]
  invalid: { index: number; field: string; message: string }[]
}

/** intake's POST /sources/approve: each source approved under the same rules as one at a time. */
export interface SourceApproveResult {
  approved: SourceRecord[]
  refused: { id: string; code: string; message: string }[]
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
  /** Decides the case's mission template (E29). */
  category?: string
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
  /** What the approver wrote; a refusal always says why. */
  comment?: string
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

/** The four standard presets, which reporting seeds and never deletes (ADR 0015). */
export type StandardWallPresetKey = 'standing' | 'incident' | 'verification' | 'briefing'

/** A stored preset's key: a standard one, or one an operator saved (lower-case, hyphenated). */
export type WallPresetKey = StandardWallPresetKey | (string & {})

export interface WallPreset {
  key: WallPresetKey
  name: string
  description: string
  /** Content for each of the 16 physical screens, row-major. */
  screens: WallContentKey[]
  groups: Omit<WallGroup, 'id'>[]
  /** One of the standard four: cannot be deleted. */
  builtIn: boolean
  createdBy?: string
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
  /** The layout the physical wall shows: the last publication the controller accepted. */
  published?: WallPublishedRef
}

/** Which publication is on the wall; `revision` is the layout revision that was sent. */
export interface WallPublishedRef {
  id: string
  ref: string
  revision: number
  preset: string
  publishedBy: string
  publishedAt: string
}

/** One push of the stored layout to the wall controller (ADR 0015). */
export interface WallLayoutPublication {
  id: string
  ref: string
  revision: number
  preset: string
  screens: WallScreen[]
  groups: WallGroup[]
  visitorMode: boolean
  adapter: string
  publishedBy: string
  publishedAt: string
  delivered: boolean
  failure?: string
}

/** What the wall controller (the simulator until E36) reports it is doing. */
export interface WallControllerStatus {
  adapter: string
  online: boolean
  inputsMuted: boolean
  layout?: {
    publicationId: string
    publicationRef: string
    preset: string
    revision: number
    screens: WallScreen[]
    groups: WallGroup[]
  }
  layoutActivatedAt?: string
  routes: { input: string; screens: number[] }[]
  log: { at: string; command: string; detail: string; accepted: boolean }[]
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

/** The Bright Data screen (collector's /provider, ADR 0007). One credit = one post or one Unlocker request. */
export interface ProviderTerms {
  maxPosts: number | null
  minIntervalMinutes: number | null
  paused: boolean
  updatedBy: string | null
  updatedAt: string | null
}

export interface ProviderSourceUsage {
  sourceId: string
  creditsThisMonth: number
  jobsThisMonth: number
  lastJobAt: string | null
  terms: ProviderTerms
  pendingSnapshot: string | null
}

export interface ProviderHost {
  host: string
  creditsThisMonth: number
  /** Seconds left of fetching through the Unlocker without a direct try; null when tried directly. */
  unlockedForSeconds: number | null
}

export interface ProviderBudget {
  monthlyCreditCap: number | null
  usedThisMonth: number
  scraperThisMonth: number
  unlockerThisMonth: number
  left: number | null
  monthStarts: string
  updatedBy: string | null
  updatedAt: string | null
}

export interface ProviderReport {
  provider: 'brightdata'
  configured: boolean
  unlockerZone: string | null
  defaults: { maxPosts: number; waitSeconds: number; unlockerBlockedHours: number }
  budget: ProviderBudget
  days: { date: string; scraper: number; unlocker: number }[]
  sources: ProviderSourceUsage[]
  hosts: ProviderHost[]
}

export interface ProviderTermsInput {
  maxPosts: number | null
  minIntervalMinutes: number | null
  paused: boolean
}

/** casework's screening of one image or video in a case (GET /cases/{id}/media). */
export interface MediaScreening {
  jobId: string
  evidenceId: string
  contentType: string
  status: 'requested' | 'screened' | 'failed'
  requestedAt: string
  screenedAt: string | null
  /** media's own words, its code first (sha256_mismatch, too_large…). */
  failure: string | null
  c2paPresent: boolean | null
  /** The combined verdict: LikelySynthetic, LikelyAuthentic or Inconclusive. */
  verdict: string | null
  confidence: number | null
  indicators: {
    detector: string
    modelVersion: string
    verdict: string
    confidence: number | null
  }[]
}

/** media's analysis of one original (GET /media/evidence/{id}); null parts while it runs. */
export interface MediaAnalysis {
  evidenceId: string
  job: {
    id: string
    kind: 'screen' | 'analyse'
    status: 'running' | 'completed' | 'failed'
    receivedAt: string
    completedAt: string | null
    failure: { code: string; message: string } | null
    detectorsRun: boolean
    note: string | null
  }
  role: string | null
  sourceUrl: string | null
  contentType: string
  sizeBytes: number
  sha256: string
  sha256Verified: boolean
  mediaKind: 'image' | 'video' | 'other'
  metadata: {
    format: string | null
    width: number | null
    height: number | null
    durationSeconds: number | null
    videoCodec: string | null
    audioCodec: string | null
    frameRate: number | null
    cameraMake: string | null
    cameraModel: string | null
    capturedAt: string | null
    software: string | null
    exifPresent: boolean
    xmpPresent: boolean
    metadataStripped: boolean
    location: { present: boolean; latitude: number | null; longitude: number | null }
  } | null
  c2pa: {
    status: 'absent' | 'present_not_validated' | 'valid' | 'invalid'
    claimGenerator: string | null
    signedBy: string | null
    digitalSourceType: string | null
    aiGenerated: boolean | null
    validationErrors: string[]
  } | null
  fingerprints: { kind: string; value: string; atSeconds: number | null }[] | null
  indicators: {
    detector: string
    modelVersion: string
    verdict: string
    confidence: number | null
    limitations: string | null
  }[]
  combined: { verdict: string; confidence: number | null } | null
}

/** evidence's working copy: a read-only copy and a short-lived link; reading it is audited. */
/**
 * The evidence matrix (casework /cases/{id}/matrix): each finding and claim against the originals
 * and statements it cites, with media's verdict on each original.
 */
export interface CaseMatrix {
  caseId: string
  sources: MatrixSource[]
  rows: MatrixRow[]
}

export interface MatrixSource {
  id: string
  kind: 'original' | 'statement'
  /** A statement's speaker; an original is named from the case's evidence list. */
  label: string | null
  contentType: string | null
  at: string
  screeningStatus: MediaScreening['status'] | null
  verdict: string | null
  confidence: number | null
  /** How many rows cite it: 0 means it has not been weighed yet. */
  citedBy: number
}

export type MatrixFlag = 'unsupported' | 'cites_likely_synthetic'

export interface MatrixRow {
  id: string
  kind: 'finding' | 'claim'
  text: string
  /** A finding's confidence (low, moderate, high) or a claim's outcome. */
  assessment: string
  cites: string[]
  flags: MatrixFlag[]
}

/** A link sent for capture into a case (evidence's capture request; collector does the fetching). */
export interface CaptureRequest {
  id: string
  url: string
  caseId: string | null
  status: 'requested' | 'completed' | 'failed'
  failureReason: string | null
  /** The sealed original, once the capture completed. */
  evidenceId: string | null
  requestedAt: string
}

/** Bytes sent so far of a file going to the store. */
export interface UploadProgress {
  loaded: number
  total: number
}

export interface WorkingCopy {
  url: string
  expiresAt: string
  contentType: string
  sizeBytes: number
}

// ---------------------------------------------------------------- CCTV requests (E31, ADR 0014)

/** draft → awaiting_approval → approved, refused or expired (governance's CCTV_SEARCH gate). */
export type CctvRequestStatus = 'draft' | 'awaiting_approval' | 'approved' | 'refused' | 'expired'

export interface CctvRequest {
  id: string
  caseId: string
  caseRef?: string
  status: CctvRequestStatus
  approvalId?: string
  cameras: string[]
  location?: string
  windowStart?: string
  windowEnd?: string
  attributes: string[]
  freeText?: string
  lawfulBasis?: string
  legalReference?: string
  reason?: string
  requesterId: string
  requesterName: string
  requestedAt: string
  submittedAt?: string
  decidedAt?: string
  /** approver_refused, capability_not_authorised, or governance's own code. */
  refusalCode?: string
  /** The refusal in plain words, when refused. */
  refusal?: string
  etag: string
}

/** What a draft may hold; everything is checked again on submit. No file field, ever (§7.5). */
export interface CctvRequestInput {
  cameras: string[]
  location?: string
  windowStart?: string
  windowEnd?: string
  attributes: string[]
  freeText?: string
  lawfulBasis?: string
  legalReference?: string
  reason?: string
}

export interface LawfulBasisOption {
  code: string
  label: string
}

// ---------------------------------------------------------------- missions (E29, ADR 0012)

/** One line of a case's mission checklist. */
export interface ChecklistLine {
  key?: string
  label: string
  done: boolean
  /** Submit waits for required lines; optional ones are shown to the reviewer either way. Absent means required. */
  required?: boolean
  doneBy?: string
  doneAt?: string
  note?: string
  noteBy?: string
}

export interface CaseMission {
  templateKey: string | null
  version: number | null
  name: string | null
}

export interface MissionLine {
  key: string
  label: string
  required: boolean
}

export interface MissionVersion {
  number: number
  name: string
  items: MissionLine[]
  createdBy: string
  createdAt: string
}

/** A mission template: ordered lines, the categories it covers, and every saved version. */
export interface MissionTemplate {
  key: string
  name: string
  description: string
  categories: string[]
  currentVersion: number
  retired: boolean
  isDefault: boolean
  items: MissionLine[]
  versions: MissionVersion[]
  updatedBy: string
  updatedAt: string
  etag: string
}

export interface MissionTemplateInput {
  /** Only when creating: the key never changes. */
  key?: string
  name: string
  description: string
  categories: string[]
  items: MissionLine[]
}

// ---------------------------------------------------------------- name searches (E30, ADR 0013)

export type NameSearchKind = 'public' | 'private_individual'
export type NameSearchStatus = 'created' | 'awaiting_approval' | 'completed' | 'refused' | 'expired'

export interface NameSearch {
  id: string
  name: string
  kind: NameSearchKind
  caseId?: string
  reason?: string
  requestedBy: string
  requestedAt: string
  status: NameSearchStatus
  approvalExpiresAt?: string
  /** Every indexed document that mentions the name; the results keep the best 200. */
  resultCount: number
  completedAt?: string
  etag: string
}

export interface NameSearchInput {
  name: string
  kind: NameSearchKind
  caseId?: string
  reason?: string
}

/** One document that mentions the name, with the passage around it (`<mark>` around the name). */
export interface NameMention {
  id: string
  documentType: string
  documentId: string
  caseId?: string
  title: string
  at: string
  source?: string
  snippet?: string
  clusterId?: string
}

export type NameClusterStatus = 'suggested' | 'confirmed' | 'rejected'

export interface NameCluster {
  id: string
  /** The context words its mentions share: why the cluster exists. */
  terms: string[]
  mentionCount: number
  firstSeen: string
  lastSeen: string
  status: NameClusterStatus
  decidedBy?: string
  decidedAt?: string
}

export interface NameBucket {
  key: string
  count: number
}

/** A snapshot of the numbers reporting and the wall use. Breakdowns: type, source, day (and later location). */
export interface NameReportData {
  id: string
  nameSearchId: string
  name: string
  kind: NameSearchKind
  caseId?: string
  createdBy: string
  createdAt: string
  retentionClass: 'standard' | 'short'
  basis: 'confirmed_clusters' | 'all_results'
  mentionCount: number
  clusterCount: number
  firstSeen?: string
  lastSeen?: string
  breakdowns: Record<string, NameBucket[]>
  caseIds: string[]
  clusters: { id: string; status: NameClusterStatus; terms: string[]; mentionCount: number }[]
}
