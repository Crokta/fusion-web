import type {
  Alert,
  Approval,
  AuditEvent,
  CaseDetail,
  CaseState,
  CaseSummary,
  ItemDetail,
  PromoteInput,
  Me,
  Page,
  PolicyRecord,
  ReviewDecision,
  ReviewItem,
  SearchKind,
  SearchResponse,
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

  triage(params?: { status?: TriageStatus }): Promise<Page<TriageItem>>
  /** Opens a case from the item; resolves to the new case's id. */
  promoteTriage(id: string, input: PromoteInput): Promise<{ caseId: string }>

  cases(params?: { state?: CaseState | 'active'; q?: string }): Promise<Page<CaseSummary>>
  case(id: string): Promise<CaseDetail>
  submitCase(id: string, etag: string): Promise<CaseDetail>

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
