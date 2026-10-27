import type {
  Alert,
  Brief,
  BriefSentence,
  SupportCheck,
  Approval,
  AuditEvent,
  CaseDetail,
  CaseState,
  CaseSummary,
  ClaimOutcomeInput,
  FindingInput,
  StatementInput,
  ItemDetail,
  PromoteInput,
  Me,
  Page,
  PolicyRecord,
  ReviewDecision,
  ReviewItem,
  SearchKind,
  SearchResponse,
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
  acknowledgeAlert(id: string): Promise<Alert>

  sources(params?: { status?: SourceStatus }): Promise<Page<SourceRecord>>
  proposeSource(input: SourceInput): Promise<SourceRecord>
  /** A new address or kind sends the source back for someone else's approval. */
  editSource(id: string, input: SourceInput, etag: string): Promise<SourceRecord>
  approveSource(id: string, etag: string): Promise<SourceRecord>
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
