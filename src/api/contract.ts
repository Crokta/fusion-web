import type {
  Alert,
  Brief,
  BriefSentence,
  CaptureRequest,
  CaseMatrix,
  SupportCheck,
  Approval,
  AuditEvent,
  CaseDetail,
  CaseState,
  CaseSummary,
  ClaimOutcomeInput,
  Delivery,
  DutyShift,
  OnDuty,
  PersonContact,
  ShiftInput,
  FindingInput,
  StatementInput,
  ItemDetail,
  PromoteInput,
  Me,
  Page,
  PolicyRecord,
  ReviewDecision,
  ReviewItem,
  MediaAnalysis,
  MediaScreening,
  ProviderBudget,
  ProviderReport,
  ProviderTerms,
  ProviderTermsInput,
  SearchKind,
  SearchResponse,
  SourceApproveResult,
  SourceImportResult,
  SourceInput,
  SourceRecord,
  SourceStatus,
  StoryGroup,
  TriageItem,
  TriageStatus,
  WallContentKey,
  WallPreset,
  WallPresetKey,
  WallPublication,
  WallState,
  WatchFloorSummary,
  UploadProgress,
  WorkingCopy,
} from './types'

/**
 * Everything the UI asks of the gateway. Two implementations exist: the HTTP client (real
 * gateway) and the in-memory mock adapter. Screens depend on this interface only.
 */
export interface FusionApi {
  me(): Promise<Me>

  watchFloor(): Promise<WatchFloorSummary>

  feed(params?: { channel?: string; cursor?: string }): Promise<Page<StoryGroup>>
  sendToTriage(storyGroupId: string): Promise<void>

  alerts(params?: { status?: string }): Promise<Page<Alert>>
  alert(id: string): Promise<Alert>
  acknowledgeAlert(id: string): Promise<Alert>
  /** Every message the alert produced, on every channel, with attempts and errors. */
  alertDeliveries(id: string): Promise<Delivery[]>

  /** The caller's own in-app notices, newest first. */
  notifications(params?: { unread?: boolean }): Promise<Delivery[]>
  markNotificationRead(id: string): Promise<Delivery>

  /** Shifts overlapping [from, to); by default the last 12 hours to a week ahead. */
  dutyRoster(params?: { from?: string; to?: string }): Promise<DutyShift[]>
  onDutyNow(): Promise<OnDuty[]>
  addShift(input: ShiftInput): Promise<DutyShift>
  removeShift(id: string): Promise<void>

  // Media: casework's screenings, media's analysis, evidence's working copy (audited).
  caseMedia(caseId: string): Promise<MediaScreening[]>
  /** null when media holds no job for it yet. */
  mediaAnalysis(evidenceId: string): Promise<MediaAnalysis | null>
  workingCopy(evidenceId: string): Promise<WorkingCopy>

  // Adding evidence to a case (E26). Evidence seals it as an original, casework attaches it,
  // and media screens an image or video, so it reaches the case like a capture does.
  /**
   * Hashes the file, sends it straight to the store through a presigned PUT (never through the
   * gateway, architecture §11) and commits it; evidence refuses it if the stored bytes differ.
   */
  uploadEvidence(
    caseId: string,
    file: File,
    onProgress?: (p: UploadProgress) => void,
  ): Promise<{ evidenceId: string }>
  /** Asks collector to capture a page (and, with includeMedia, its photos and video). */
  captureLink(caseId: string, url: string, includeMedia: boolean): Promise<CaptureRequest>
  capture(id: string): Promise<CaptureRequest>

  // The Bright Data screen (collector, ADR 0007).
  provider(): Promise<ProviderReport>
  setProviderBudget(monthlyCreditCap: number | null): Promise<ProviderBudget>
  setProviderTerms(sourceId: string, input: ProviderTermsInput): Promise<ProviderTerms>
  clearProviderHost(host: string): Promise<void>
  /** Directory search for the roster's person picker (roster.manage). */
  searchPeople(q: string): Promise<PersonContact[]>

  sources(params?: { status?: SourceStatus }): Promise<Page<SourceRecord>>
  proposeSource(input: SourceInput): Promise<SourceRecord>
  /** A new address or kind sends the source back for someone else's approval. */
  editSource(id: string, input: SourceInput, etag: string): Promise<SourceRecord>
  approveSource(id: string, etag: string): Promise<SourceRecord>
  importSources(sources: SourceInput[]): Promise<SourceImportResult>
  /** `version` is the number in the source's ETag. */
  approveSources(items: { id: string; version: number }[]): Promise<SourceApproveResult>
  suspendSource(id: string, reason: string, etag: string): Promise<SourceRecord>
  reinstateSource(id: string, etag: string): Promise<SourceRecord>

  triage(params?: { status?: TriageStatus }): Promise<Page<TriageItem>>
  /** Opens a case from the item; resolves to the new case's id. */
  promoteTriage(id: string, input: PromoteInput): Promise<{ caseId: string }>

  cases(params?: { state?: CaseState | 'active'; q?: string }): Promise<Page<CaseSummary>>
  case(id: string): Promise<CaseDetail>
  submitCase(id: string, etag: string): Promise<CaseDetail>
  setChecklistItem(id: string, key: string, done: boolean): Promise<CaseDetail>

  // Assessment: each answers with the whole case, so the page redraws from one response.
  setCaseSummary(id: string, summary: string): Promise<CaseDetail>
  recordFinding(id: string, input: FindingInput): Promise<CaseDetail>
  /** `version` is the finding's own: a stale one is refused (412). */
  reviseFinding(
    id: string,
    findingId: string,
    input: FindingInput,
    version: number,
  ): Promise<CaseDetail>
  recordStatement(id: string, input: StatementInput): Promise<CaseDetail>
  recordClaim(id: string, input: { text: string; attributedTo: string }): Promise<CaseDetail>
  setClaimOutcome(caseId: string, claimId: string, input: ClaimOutcomeInput): Promise<CaseDetail>
  /** Findings and claims against what they cite, with each original's screening (E26). */
  caseMatrix(caseId: string): Promise<CaseMatrix>

  // Briefs (reporting). Drafting starts from a case's approved findings.
  briefs(params?: { caseId?: string }): Promise<Page<Brief>>
  brief(id: string): Promise<Brief>
  createBrief(caseId: string): Promise<Brief>
  redraftBrief(
    id: string,
    input: { title: string; sentences: BriefSentence[] },
    etag: string,
  ): Promise<Brief>
  supportCheck(id: string): Promise<SupportCheck>
  releaseBrief(id: string, etag: string): Promise<Brief>
  /** The PDF: the stored file once released, else a DRAFT-marked preview. */
  briefPdf(id: string, version?: number): Promise<Blob>

  reviews(): Promise<Page<ReviewItem>>
  decideReview(caseId: string, decision: ReviewDecision, comment: string): Promise<void>

  approvals(): Promise<Page<Approval>>
  decideApproval(id: string, decision: 'approve' | 'refuse', comment: string): Promise<Approval>

  policies(): Promise<PolicyRecord[]>
  updatePolicy(key: string, value: boolean, authorityRef: string): Promise<PolicyRecord>
  audit(params?: { actor?: string; action?: string; cursor?: string }): Promise<Page<AuditEvent>>

  search(q: string, kind?: SearchKind): Promise<SearchResponse>
  item(id: string): Promise<ItemDetail>

  wallState(): Promise<WallState>
  putWallState(state: WallState): Promise<WallState>
  wallPresets(): Promise<WallPreset[]>
  activatePreset(key: WallPresetKey): Promise<WallState>
  wallPublications(): Promise<WallPublication[]>
  requestPublication(input: {
    content: WallContentKey
    targets: number[]
    contextRef?: string
    note?: string
  }): Promise<WallPublication>
  decidePublication(id: string, decision: 'approve' | 'reject'): Promise<WallPublication>
}
