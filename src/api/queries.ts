import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './index'
import type {
  RetentionListView,
  AcceptQuestionInput,
  FeedbackRating,
  QuestionInput,
  QuestionStatus,
  RequirementStatus,
  Alert,
  AttachLocationInput,
  LocationSubject,
  MapQuery,
  AreaLevel,
  PlaceKind,
  NameSearchInput,
  CctvRequestInput,
  CctvRequestStatus,
  UploadProgress,
  BriefSentence,
  LessonInput,
  OutcomePeriod,
  CaseState,
  ClaimOutcomeInput,
  FindingInput,
  MissionTemplateInput,
  StatementInput,
  Page,
  PromoteInput,
  ReviewDecision,
  SearchKind,
  ProviderTermsInput,
  ShiftInput,
  SourceInput,
  SourceStatus,
  TriageStatus,
  WallContentKey,
  WallPresetKey,
  WallState,
} from './types'

/**
 * Query keys and hooks. Keys are hierarchical so a realtime event can invalidate a whole
 * family (`['cases']`) without knowing which filters are on screen.
 */
export const qk = {
  nameSearches: ['names', 'list'] as const,
  nameSearch: (id: string) => ['names', id] as const,
  nameMentions: (id: string, clusterId?: string) =>
    ['names', id, 'results', clusterId ?? 'all'] as const,
  nameClusters: (id: string) => ['names', id, 'clusters'] as const,
  nameReportData: (id: string) => ['names', id, 'report-data'] as const,
  me: ['me'] as const,
  watchFloor: ['watch-floor'] as const,
  feed: (channel?: string) => ['feed', channel ?? 'all'] as const,
  alerts: (status?: string) => ['alerts', status ?? 'all'] as const,
  alert: (id: string) => ['alert', id] as const,
  deliveries: (id: string) => ['alert', id, 'deliveries'] as const,
  notifications: ['notifications'] as const,
  roster: ['roster'] as const,
  onDuty: ['roster', 'now'] as const,
  provider: ['provider'] as const,
  caseMedia: (caseId: string) => ['case', caseId, 'media'] as const,
  capture: (id: string) => ['capture', id] as const,
  caseMatrix: (caseId: string) => ['case', caseId, 'matrix'] as const,
  mediaAnalysis: (evidenceId: string) => ['media', evidenceId] as const,
  briefs: (caseId?: string) => ['briefs', caseId ?? 'all'] as const,
  brief: (id: string) => ['brief', id] as const,
  supportCheck: (id: string) => ['brief', id, 'support-check'] as const,
  briefDistribution: (id: string) => ['brief', id, 'distribution'] as const,
  lessons: (p?: { caseId?: string; templateKey?: string }) =>
    ['lessons', p?.caseId ?? 'all', p?.templateKey ?? 'all'] as const,
  outcomes: (period: OutcomePeriod) => ['outcomes', period] as const,
  sources: (status?: string) => ['sources', status ?? 'all'] as const,
  triage: (status?: string) => ['triage', status ?? 'all'] as const,
  cases: (state?: string, q?: string) => ['cases', state ?? 'all', q ?? ''] as const,
  case: (id: string) => ['case', id] as const,
  reviews: ['reviews'] as const,
  approvals: ['approvals'] as const,
  policies: ['policies'] as const,
  audit: (actor?: string, action?: string) => ['audit', actor ?? '', action ?? ''] as const,
  search: (q: string, kind?: SearchKind) => ['search', q, kind ?? 'all'] as const,
  item: (id: string) => ['item', id] as const,
  wall: ['wall', 'state'] as const,
  wallPresets: ['wall', 'presets'] as const,
  wallPublications: ['wall', 'publications'] as const,
  wallLayoutPublications: ['wall', 'layout-publications'] as const,
  wallController: ['wall', 'controller'] as const,
  cctvRequests: (status?: string) => ['cctv', 'requests', status ?? 'all'] as const,
  cctvRequest: (id: string) => ['cctv', 'request', id] as const,
  cctvCameras: ['cctv', 'cameras'] as const,
  cctvLawfulBases: ['cctv', 'lawful-bases'] as const,
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: api.me, staleTime: Infinity })

export const useWatchFloor = () =>
  useQuery({ queryKey: qk.watchFloor, queryFn: api.watchFloor, refetchInterval: 60_000 })

export const useFeed = (channel?: string) =>
  useQuery({ queryKey: qk.feed(channel), queryFn: () => api.feed({ channel }) })

export const useAlerts = (status?: string) =>
  useQuery({ queryKey: qk.alerts(status), queryFn: () => api.alerts({ status }) })

export const useAlert = (id: string) =>
  useQuery({ queryKey: qk.alert(id), queryFn: () => api.alert(id), enabled: !!id })

export const useAlertDeliveries = (id: string) =>
  useQuery({
    queryKey: qk.deliveries(id),
    queryFn: () => api.alertDeliveries(id),
    enabled: !!id,
    // Retries and back-off happen on the server; the page follows them.
    refetchInterval: 10_000,
  })

export const useNotifications = () =>
  useQuery({ queryKey: qk.notifications, queryFn: () => api.notifications() })

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  })
}

export const useDutyRoster = () =>
  useQuery({ queryKey: qk.roster, queryFn: () => api.dutyRoster() })

export const useOnDutyNow = () =>
  useQuery({ queryKey: qk.onDuty, queryFn: () => api.onDutyNow(), refetchInterval: 60_000 })

export function useAddShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShiftInput) => api.addShift(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.roster }),
  })
}

export function useRemoveShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.removeShift(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.roster }),
  })
}

// Screening runs after the original lands: poll while any is still waiting.
export const useCaseMedia = (caseId: string) =>
  useQuery({
    queryKey: qk.caseMedia(caseId),
    queryFn: () => api.caseMedia(caseId),
    refetchInterval: (q) => (q.state.data?.some((m) => m.status === 'requested') ? 10_000 : false),
  })

export const useMediaAnalysis = (evidenceId: string, enabled = true) =>
  useQuery({
    queryKey: qk.mediaAnalysis(evidenceId),
    queryFn: () => api.mediaAnalysis(evidenceId),
    enabled,
    refetchInterval: (q) => (q.state.data?.job.status === 'running' ? 5_000 : false),
  })

/** The matrix is derived from the case and its screenings: refreshed whenever either is. */
export const useCaseMatrix = (caseId: string) =>
  useQuery({
    queryKey: qk.caseMatrix(caseId),
    queryFn: () => api.caseMatrix(caseId),
    // A verdict still to come lands in the matrix as it does on the evidence list.
    refetchInterval: (q) =>
      q.state.data?.sources.some((x) => x.screeningStatus === 'requested') ? 10_000 : false,
  })

/**
 * Adding evidence (E26). Casework attaches the sealed original when evidence's event arrives, a
 * moment after the commit, so the case and its screenings are refetched now and again shortly.
 */
function refreshCaseSoon(qc: ReturnType<typeof useQueryClient>, caseId: string) {
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.case(caseId) })
    void qc.invalidateQueries({ queryKey: qk.caseMedia(caseId) })
  }
  refresh()
  setTimeout(refresh, 2_000)
  setTimeout(refresh, 6_000)
}

export function useUploadEvidence(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { file: File; onProgress?: (p: UploadProgress) => void }) =>
      api.uploadEvidence(caseId, a.file, a.onProgress),
    onSuccess: () => refreshCaseSoon(qc, caseId),
  })
}

export function useCaptureLink(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: { url: string; includeMedia: boolean }) =>
      api.captureLink(caseId, a.url, a.includeMedia),
    onSuccess: (c) => qc.setQueryData(qk.capture(c.id), c),
  })
}

/** A capture takes collector a few seconds to a minute: poll until it ends, then refresh the case. */
export function useCapture(id: string, caseId: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: qk.capture(id),
    queryFn: async () => {
      const c = await api.capture(id)
      if (c.status === 'completed') refreshCaseSoon(qc, caseId)
      return c
    },
    refetchInterval: (q) => (q.state.data?.status === 'requested' ? 3_000 : false),
  })
}

/** A working copy is a read of the original: audited and a custody event, so only on request. */
export function useWorkingCopy() {
  return useMutation({ mutationFn: (evidenceId: string) => api.workingCopy(evidenceId) })
}

export const useProvider = () =>
  useQuery({ queryKey: qk.provider, queryFn: () => api.provider(), refetchInterval: 60_000 })

export type ProviderAction =
  | { kind: 'budget'; monthlyCreditCap: number | null }
  | { kind: 'terms'; sourceId: string; input: ProviderTermsInput }
  | { kind: 'clear-host'; host: string }

export function useProviderAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: ProviderAction): Promise<void> => {
      if (a.kind === 'budget') await api.setProviderBudget(a.monthlyCreditCap)
      else if (a.kind === 'terms') await api.setProviderTerms(a.sourceId, a.input)
      else await api.clearProviderHost(a.host)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.provider }),
  })
}

export const usePeopleSearch = (q: string) =>
  useQuery({
    queryKey: ['people-search', q.trim().toLowerCase()],
    queryFn: () => api.searchPeople(q),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  })

export function useAcknowledgeAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.acknowledgeAlert(id),
    // Acknowledgement stops an escalation timer, so the floor should see it instantly.
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['alerts'] })
      const snapshots = qc.getQueriesData<Page<Alert>>({ queryKey: ['alerts'] })
      qc.setQueriesData<Page<Alert>>({ queryKey: ['alerts'] }, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((a) =>
                a.id === id ? { ...a, status: 'acknowledged', acknowledgedBy: 'You' } : a,
              ),
            }
          : old,
      )
      return { snapshots }
    },
    onError: (_e, _id, ctx) => ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (_a, _e, id) => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: qk.alert(id) })
      qc.invalidateQueries({ queryKey: qk.watchFloor })
    },
  })
}

export const useBriefs = (caseId?: string) =>
  useQuery({ queryKey: qk.briefs(caseId), queryFn: () => api.briefs({ caseId }) })

export const useBrief = (id: string) =>
  useQuery({ queryKey: qk.brief(id), queryFn: () => api.brief(id), enabled: !!id })

export const useSupportCheck = (id: string) =>
  useQuery({ queryKey: qk.supportCheck(id), queryFn: () => api.supportCheck(id), enabled: !!id })

export function useCreateBrief() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (caseId: string) => api.createBrief(caseId),
    onSuccess: (b) => {
      qc.setQueryData(qk.brief(b.id), b)
      qc.invalidateQueries({ queryKey: ['briefs'] })
    },
  })
}

export type BriefAction =
  | { kind: 'redraft'; title: string; sentences: BriefSentence[]; etag: string }
  | { kind: 'release'; etag: string }
  | { kind: 'correct'; reason: string; etag: string }

export function useBriefAction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: BriefAction) =>
      a.kind === 'redraft'
        ? api.redraftBrief(id, { title: a.title, sentences: a.sentences }, a.etag)
        : a.kind === 'correct'
          ? api.correctBrief(id, a.reason, a.etag)
          : api.releaseBrief(id, a.etag),
    onSuccess: (b) => {
      qc.setQueryData(qk.brief(id), b)
      qc.invalidateQueries({ queryKey: ['briefs'] })
      qc.invalidateQueries({ queryKey: qk.supportCheck(id) })
      qc.invalidateQueries({ queryKey: qk.briefDistribution(id) })
      qc.invalidateQueries({ queryKey: ['outcomes'] })
      // A release moves the case to Released once casework has the event.
      qc.invalidateQueries({ queryKey: qk.case(b.caseId) })
      qc.invalidateQueries({ queryKey: ['cases'] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: qk.brief(id) })
      qc.invalidateQueries({ queryKey: qk.supportCheck(id) })
    },
  })
}

// ---------------------------------------------------------------- E38: corrections, lessons, outcomes

/** Who holds a brief: the people a released correction notifies. */
export const useBriefDistribution = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.briefDistribution(id),
    queryFn: () => api.briefDistribution(id),
    enabled: !!id && enabled,
  })

export function useCloseCase(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (etag: string) => api.closeCase(id, etag),
    onSuccess: (data) => {
      qc.setQueryData(qk.case(id), data)
      qc.invalidateQueries({ queryKey: ['cases'] })
      qc.invalidateQueries({ queryKey: ['outcomes'] })
    },
  })
}

export const useLessons = (p?: { caseId?: string; templateKey?: string }, enabled = true) =>
  useQuery({ queryKey: qk.lessons(p), queryFn: () => api.lessons(p), enabled })

export type LessonAction =
  | { kind: 'record'; caseId: string; input: LessonInput }
  | { kind: 'revise'; id: string; input: LessonInput; etag: string }
  | { kind: 'apply'; id: string; templateKey: string; etag: string }

export function useLessonAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: LessonAction) =>
      a.kind === 'record'
        ? api.recordLesson(a.caseId, a.input)
        : a.kind === 'revise'
          ? api.reviseLesson(a.id, a.input, a.etag)
          : api.applyLesson(a.id, a.templateKey, a.etag),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['lessons'] })
      qc.invalidateQueries({ queryKey: ['outcomes'] })
    },
  })
}

export const useOutcomes = (period: OutcomePeriod) =>
  useQuery({ queryKey: qk.outcomes(period), queryFn: () => api.outcomes(period) })

export const useSources = (status?: SourceStatus) =>
  useQuery({ queryKey: qk.sources(status), queryFn: () => api.sources({ status }) })

export type SourceAction =
  | { kind: 'propose'; input: SourceInput }
  | { kind: 'edit'; id: string; input: SourceInput; etag: string }
  | { kind: 'approve' | 'reinstate'; id: string; etag: string }
  | { kind: 'suspend'; id: string; reason: string; etag: string }

/** Every change to the register; each refreshes the list and the watch floor's source health. */
export function useSourceAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: SourceAction) => {
      switch (a.kind) {
        case 'propose':
          return api.proposeSource(a.input)
        case 'edit':
          return api.editSource(a.id, a.input, a.etag)
        case 'approve':
          return api.approveSource(a.id, a.etag)
        case 'reinstate':
          return api.reinstateSource(a.id, a.etag)
        case 'suspend':
          return api.suspendSource(a.id, a.reason, a.etag)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['sources'] })
      qc.invalidateQueries({ queryKey: qk.watchFloor })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

/** Many sources at once: an import (proposals) or approving many. */
export function useSourceBatch() {
  const qc = useQueryClient()
  const settle = () => {
    qc.invalidateQueries({ queryKey: ['sources'] })
    qc.invalidateQueries({ queryKey: qk.watchFloor })
    qc.invalidateQueries({ queryKey: ['audit'] })
  }
  return {
    importing: useMutation({
      mutationFn: (s: SourceInput[]) => api.importSources(s),
      onSettled: settle,
    }),
    approving: useMutation({
      mutationFn: (items: { id: string; version: number }[]) => api.approveSources(items),
      onSettled: settle,
    }),
  }
}

// Preservation lands a few seconds after an item arrives, so the queue polls while it is open.
export const useTriage = (status?: TriageStatus) =>
  useQuery({
    queryKey: qk.triage(status),
    queryFn: () => api.triage({ status }),
    refetchInterval: 15_000,
  })

export function usePromoteTriage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; input: PromoteInput }) => api.promoteTriage(v.id, v.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['triage'] })
      qc.invalidateQueries({ queryKey: ['cases'] })
      qc.invalidateQueries({ queryKey: qk.watchFloor })
    },
  })
}

export const useCases = (state?: CaseState | 'active', q?: string) =>
  useQuery({ queryKey: qk.cases(state, q), queryFn: () => api.cases({ state, q }) })

export const useCase = (id: string) =>
  useQuery({ queryKey: qk.case(id), queryFn: () => api.case(id), enabled: !!id })

export type CaseAction =
  | { kind: 'checklist'; key: string; done: boolean; note?: string }
  | { kind: 'mission'; templateKey: string }
  | { kind: 'category'; category: string }
  | { kind: 'summary'; summary: string }
  | { kind: 'finding'; input: FindingInput }
  | { kind: 'revise'; findingId: string; input: FindingInput; version: number }
  | { kind: 'statement'; input: StatementInput }
  | { kind: 'claim'; input: { text: string; attributedTo: string } }
  | { kind: 'outcome'; claimId: string; input: ClaimOutcomeInput }

/** Every assessment change; each answers with the case, which replaces the cached one. */
export function useCaseAction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: CaseAction) => {
      switch (a.kind) {
        case 'checklist':
          return api.setChecklistItem(id, a.key, a.done, a.note)
        case 'mission':
          return api.applyCaseMission(id, a.templateKey)
        case 'category':
          return api.setCaseCategory(id, a.category)
        case 'summary':
          return api.setCaseSummary(id, a.summary)
        case 'finding':
          return api.recordFinding(id, a.input)
        case 'revise':
          return api.reviseFinding(id, a.findingId, a.input, a.version)
        case 'statement':
          return api.recordStatement(id, a.input)
        case 'claim':
          return api.recordClaim(id, a.input)
        case 'outcome':
          return api.setClaimOutcome(id, a.claimId, a.input)
      }
    },
    onSuccess: (data) => {
      qc.setQueryData(qk.case(id), data)
      // A new finding or outcome changes what is cited.
      qc.invalidateQueries({ queryKey: qk.caseMatrix(id) })
      // State can move (open → in assessment, approved → submitted): lists and the queue follow.
      qc.invalidateQueries({ queryKey: ['cases'] })
      qc.invalidateQueries({ queryKey: qk.reviews })
    },
    // A 412 or a refused change means the cached case is out of date: read it again.
    onError: () => qc.invalidateQueries({ queryKey: qk.case(id) }),
  })
}

export function useSubmitCase(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (etag: string) => api.submitCase(id, etag),
    onSuccess: (data) => {
      qc.setQueryData(qk.case(id), data)
      qc.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

export const useReviews = () => useQuery({ queryKey: qk.reviews, queryFn: api.reviews })

export function useDecideReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { caseId: string; decision: ReviewDecision; comment: string }) =>
      api.decideReview(v.caseId, v.decision, v.comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.reviews })
      qc.invalidateQueries({ queryKey: ['cases'] })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export const useApprovals = () => useQuery({ queryKey: qk.approvals, queryFn: api.approvals })

export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'refuse'; comment: string }) =>
      api.decideApproval(v.id, v.decision, v.comment),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.approvals })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export const usePolicies = () => useQuery({ queryKey: qk.policies, queryFn: api.policies })

export function useUpdatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { key: string; value: boolean; authorityRef: string }) =>
      api.updatePolicy(v.key, v.value, v.authorityRef),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.policies })
      qc.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export const useAudit = (actor?: string, action?: string) =>
  useQuery({ queryKey: qk.audit(actor, action), queryFn: () => api.audit({ actor, action }) })

export const useSearch = (q: string, kind?: SearchKind) =>
  useQuery({
    queryKey: qk.search(q, kind),
    queryFn: () => api.search(q, kind),
    placeholderData: (prev) => prev,
  })

export const useItem = (id: string | null) =>
  useQuery({ queryKey: qk.item(id ?? ''), queryFn: () => api.item(id!), enabled: !!id })

// ---------------------------------------------------------------- wall

export const useWallState = () => useQuery({ queryKey: qk.wall, queryFn: api.wallState })
export const useWallPresets = () =>
  useQuery({ queryKey: qk.wallPresets, queryFn: api.wallPresets, staleTime: Infinity })
export const useWallPublications = () =>
  useQuery({ queryKey: qk.wallPublications, queryFn: api.wallPublications })

/**
 * Wall edits are optimistic: the planner must feel like moving physical screens. The server
 * answers with the next revision; a 412 means someone else moved first, and we roll back.
 */
export function useUpdateWall() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (next: WallState) => api.putWallState(next),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: qk.wall })
      const previous = qc.getQueryData<WallState>(qk.wall)
      qc.setQueryData(qk.wall, next)
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.wall, ctx.previous)
      qc.invalidateQueries({ queryKey: qk.wall })
    },
    onSuccess: (data) => qc.setQueryData(qk.wall, data),
  })
}

export function useActivatePreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: WallPresetKey) => api.activatePreset(key),
    onSuccess: (data) => qc.setQueryData(qk.wall, data),
  })
}

export function useRequestPublication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: {
      content: WallContentKey
      targets: number[]
      contextRef?: string
      note?: string
    }) => api.requestPublication(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wallPublications }),
  })
}

export function useDecidePublication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; decision: 'approve' | 'reject' }) =>
      api.decidePublication(v.id, v.decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.wallPublications })
      qc.invalidateQueries({ queryKey: qk.wall })
    },
  })
}

// Presets stored server-side, publication to the controller and the simulator (E33, ADR 0015).

export function useSaveWallPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { name: string; description?: string }) => api.saveWallPreset(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.wallPresets }),
  })
}

export function useDeleteWallPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: WallPresetKey) => api.deleteWallPreset(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.wallPresets })
      qc.invalidateQueries({ queryKey: qk.wall })
    },
  })
}

export function usePublishWallLayout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (revision: number) => api.publishWallLayout(revision),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.wall })
      qc.invalidateQueries({ queryKey: qk.wallLayoutPublications })
      qc.invalidateQueries({ queryKey: qk.wallController })
    },
  })
}

export const useWallLayoutPublications = () =>
  useQuery({ queryKey: qk.wallLayoutPublications, queryFn: api.wallLayoutPublications })

/**
 * What the controller shows. The hub does not push publications yet (gateway forwards only
 * WallStateChanged), so the simulator view polls.
 */
export const useWallController = () =>
  useQuery({ queryKey: qk.wallController, queryFn: api.wallController, refetchInterval: 3000 })

// ---------------------------------------------------------------- missions (E29, ADR 0012)

export const missionKeys = {
  all: ['missions'] as const,
  list: (retired: boolean) => ['missions', retired ? 'with-retired' : 'live'] as const,
}

export const useMissionTemplates = (retired = false, enabled = true) =>
  useQuery({
    queryKey: missionKeys.list(retired),
    queryFn: () => api.missionTemplates({ retired }),
    enabled,
  })

export type MissionAction =
  | { kind: 'create'; input: MissionTemplateInput }
  | { kind: 'revise'; key: string; input: MissionTemplateInput; etag: string }
  | { kind: 'retire'; key: string; etag: string }

export function useMissionAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: MissionAction) => {
      switch (a.kind) {
        case 'create':
          return api.createMissionTemplate(a.input)
        case 'revise':
          return api.reviseMissionTemplate(a.key, a.input, a.etag)
        case 'retire':
          return api.retireMissionTemplate(a.key, a.etag)
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: missionKeys.all }),
  })
}

// ---------------------------------------------------------------- CCTV requests (E31, ADR 0014)

export const useCctvRequests = (status?: CctvRequestStatus) =>
  useQuery({ queryKey: qk.cctvRequests(status), queryFn: () => api.cctvRequests({ status }) })

export const useCctvRequest = (id: string | undefined) =>
  useQuery({
    queryKey: qk.cctvRequest(id ?? ''),
    queryFn: () => api.cctvRequest(id!),
    enabled: !!id,
  })

export const useCctvCameras = () =>
  useQuery({ queryKey: qk.cctvCameras, queryFn: () => api.cctvCameras(), staleTime: 300_000 })

export const useCctvLawfulBases = () =>
  useQuery({
    queryKey: qk.cctvLawfulBases,
    queryFn: () => api.cctvLawfulBases(),
    staleTime: Infinity,
  })

/** Creates a draft, or saves one with its ETag; every change refreshes the list and the request. */
export function useSaveCctvRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id?: string; caseId: string; input: CctvRequestInput; etag?: string }) =>
      v.id && v.etag
        ? api.editCctvRequest(v.id, v.input, v.etag)
        : api.createCctvRequest(v.caseId, v.input),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cctv', 'requests'] })
      qc.invalidateQueries({ queryKey: qk.cctvRequest(r.id) })
    },
  })
}

export function useSubmitCctvRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; etag: string }) => api.submitCctvRequest(v.id, v.etag),
    // A refusal changes the request too (it ends refused), so refresh either way.
    onSettled: (_r, _e, v) => {
      qc.invalidateQueries({ queryKey: ['cctv', 'requests'] })
      qc.invalidateQueries({ queryKey: qk.cctvRequest(v.id) })
      qc.invalidateQueries({ queryKey: qk.approvals })
    },
  })
}

// Name-of-interest searches (E30, ADR 0013).

export const useNameSearches = (enabled = true) =>
  useQuery({ queryKey: qk.nameSearches, queryFn: api.nameSearches, enabled })

export const useNameSearch = (id: string, enabled = true) =>
  useQuery({ queryKey: qk.nameSearch(id), queryFn: () => api.nameSearch(id), enabled })

export const useNameMentions = (id: string, clusterId?: string, enabled = true) =>
  useQuery({
    queryKey: qk.nameMentions(id, clusterId),
    queryFn: () => api.nameMentions(id, { clusterId }),
    enabled,
    retry: false,
  })

export const useNameClusters = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.nameClusters(id),
    queryFn: () => api.nameClusters(id),
    enabled,
    retry: false,
  })

export const useNameReportData = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.nameReportData(id),
    queryFn: () => api.nameReportData(id),
    enabled,
    retry: false,
  })

export function useStartNameSearch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: NameSearchInput) => api.startNameSearch(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nameSearches }),
  })
}

export function useDecideNameCluster(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { clusterId: string; confirmed: boolean }) =>
      api.decideNameCluster(id, v.clusterId, v.confirmed),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.nameClusters(id) }),
  })
}

export function useTakeNameReportData(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.takeNameReportData(id),
    onSuccess: (r) => qc.setQueryData(qk.nameReportData(id), r),
  })
}

// ---------------------------------------------------------------- geo (E32, ADR 0018)

export const geoKeys = {
  all: ['geo'] as const,
  places: (q: string, kind?: PlaceKind) => ['geo', 'places', q, kind ?? 'any'] as const,
  place: (id: string) => ['geo', 'place', id] as const,
  datasets: ['geo', 'datasets'] as const,
  locations: (subjectType: LocationSubject, subjectId: string) =>
    ['geo', 'locations', subjectType, subjectId] as const,
  layers: ['geo', 'layers'] as const,
  features: (q: MapQuery) => ['geo', 'features', q] as const,
  areas: (q: Omit<MapQuery, 'bbox'>, level: AreaLevel = 'state') =>
    ['geo', 'areas', level, q] as const,
  boundaries: (level: AreaLevel) => ['geo', 'boundaries', level] as const,
}

export const usePlaces = (q: string, kind?: PlaceKind) =>
  useQuery({
    queryKey: geoKeys.places(q, kind),
    queryFn: () => api.places(q, { kind }),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
  })

export const usePlace = (id: string | undefined) =>
  useQuery({
    queryKey: geoKeys.place(id ?? ''),
    queryFn: () => api.place(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })

export const useGazetteerDatasets = () =>
  useQuery({ queryKey: geoKeys.datasets, queryFn: api.gazetteerDatasets, staleTime: 60 * 60_000 })

export const useLocations = (subjectType: LocationSubject, subjectId: string, enabled = true) =>
  useQuery({
    queryKey: geoKeys.locations(subjectType, subjectId),
    queryFn: () => api.locations(subjectType, subjectId),
    enabled,
  })

export const useMapLayers = (enabled = true) =>
  useQuery({ queryKey: geoKeys.layers, queryFn: api.mapLayers, enabled })

export const useMapFeatures = (q: MapQuery, enabled = true) =>
  useQuery({
    queryKey: geoKeys.features(q),
    queryFn: () => api.mapFeatures(q),
    enabled,
    placeholderData: (previous) => previous,
  })

export const useMapAreas = (
  q: Omit<MapQuery, 'bbox'>,
  enabled = true,
  level: AreaLevel = 'state',
) => useQuery({ queryKey: geoKeys.areas(q, level), queryFn: () => api.mapAreas(q, level), enabled })

/** Public boundaries that change only with a new edition: fetched once a session. */
export const useMapBoundaries = (level: AreaLevel, enabled = true) =>
  useQuery({
    queryKey: geoKeys.boundaries(level),
    queryFn: () => api.mapBoundaries(level),
    enabled,
    staleTime: Infinity,
    retry: false,
  })

/** Placing, confirming and removing change the subject's list and every map view. */
function useGeoMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: geoKeys.all }),
  })
}

export const useAttachLocation = () =>
  useGeoMutation((input: AttachLocationInput) => api.attachLocation(input))

export const useConfirmLocation = () =>
  useGeoMutation((l: { id: string; version: number }) => api.confirmLocation(l.id, l.version))

export const useRemoveLocation = () =>
  useGeoMutation((l: { id: string; version: number }) => api.removeLocation(l.id, l.version))

// ---------------------------------------------------------------- E37: leadership questions and feedback (ADR 0020)

export const leadershipKeys = {
  questions: (p?: { status?: QuestionStatus; briefId?: string }) =>
    ['questions', p?.status ?? 'all', p?.briefId ?? 'any'] as const,
  requirements: (status?: RequirementStatus) => ['requirements', status ?? 'all'] as const,
  feedback: (productId?: string) => ['feedback', productId ?? 'all'] as const,
}

export const useQuestions = (p?: { status?: QuestionStatus; briefId?: string }, enabled = true) =>
  useQuery({ queryKey: leadershipKeys.questions(p), queryFn: () => api.questions(p), enabled })

export const useRequirements = (status?: RequirementStatus, enabled = true) =>
  useQuery({
    queryKey: leadershipKeys.requirements(status),
    queryFn: () => api.requirements({ status }),
    enabled,
  })

export const useBriefFeedback = (productId?: string, enabled = true) =>
  useQuery({
    queryKey: leadershipKeys.feedback(productId),
    queryFn: () => api.briefFeedback({ productId }),
    enabled,
  })

export type QuestionAction =
  | { kind: 'ask'; input: QuestionInput }
  | { kind: 'accept'; id: string; input: AcceptQuestionInput; etag: string }
  | { kind: 'answer'; id: string; answer: string; briefIds: string[]; etag: string }
  | { kind: 'decline'; id: string; reason: string; etag: string }

/** Every step of a question; accepting one may create a requirement, so both lists refresh. */
export function useQuestionAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: QuestionAction) =>
      a.kind === 'ask'
        ? api.askQuestion(a.input)
        : a.kind === 'accept'
          ? api.acceptQuestion(a.id, a.input, a.etag)
          : a.kind === 'answer'
            ? api.answerQuestion(a.id, a.answer, a.briefIds, a.etag)
            : api.declineQuestion(a.id, a.reason, a.etag),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['questions'] })
      qc.invalidateQueries({ queryKey: ['requirements'] })
    },
  })
}

export function useGiveFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (f: { productId: string; rating: FeedbackRating; comment?: string }) =>
      api.giveFeedback(f.productId, f.rating, f.comment),
    onSettled: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

// ---------------------------------------------------------------------------------------
// E34: review history, briefs waiting for release, and the wall renderer (ADR 0019)
// ---------------------------------------------------------------------------------------

export const useReviewHistory = (caseId: string | undefined) =>
  useQuery({
    queryKey: ['reviews', 'history', caseId ?? ''] as const,
    queryFn: () => api.reviewHistory(caseId!),
    enabled: !!caseId,
  })

/** Drafts and corrections: what a reviewer may be asked to release. */
export const useBriefsAwaitingRelease = (enabled = true) =>
  useQuery({
    queryKey: ['briefs', 'awaiting-release'] as const,
    queryFn: () => api.briefs({ status: ['draft', 'correcting'] }),
    enabled,
  })

export const useRendererTokens = (enabled = true) =>
  useQuery({
    queryKey: ['wall', 'renderer-tokens'] as const,
    queryFn: api.wallRendererTokens,
    enabled,
  })

export function useRendererTokenAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      a: { kind: 'issue'; label: string } | { kind: 'revoke'; id: string },
    ): Promise<{ secret?: string }> =>
      a.kind === 'issue'
        ? api.issueWallRendererToken(a.label)
        : api.revokeWallRendererToken(a.id).then(() => ({})),
    onSettled: () => qc.invalidateQueries({ queryKey: ['wall', 'renderer-tokens'] }),
  })
}

/** A display polls: the hub needs an account, and a display has only its token (ADR 0019). */
export const useWallZones = (token?: string) =>
  useQuery({
    queryKey: ['wall', 'zones', token ?? 'session'] as const,
    queryFn: () => api.wallZones(token),
    refetchInterval: 10_000,
  })

export const useWallZoneContent = (zoneId: string, token?: string) =>
  useQuery({
    queryKey: ['wall', 'zones', token ?? 'session', zoneId] as const,
    queryFn: () => api.wallZoneContent(zoneId, token),
    refetchInterval: 15_000,
  })

// ---------------------------------------------------------------- retention (E39, ADR 0021)
// Keys live under ['retention'], so one invalidation refreshes lists, disposals and certificates.

export const useRetentionClasses = () =>
  useQuery({
    queryKey: ['retention', 'classes'] as const,
    queryFn: () => api.retentionClasses(),
    staleTime: 300_000,
  })

export const useRetention = (view: RetentionListView) =>
  useQuery({ queryKey: ['retention', 'list', view] as const, queryFn: () => api.retention(view) })

export const useDisposals = () =>
  useQuery({ queryKey: ['retention', 'disposals'] as const, queryFn: () => api.disposals() })

export const useDisposalCertificates = () =>
  useQuery({
    queryKey: ['retention', 'certificates'] as const,
    queryFn: () => api.disposalCertificates(),
  })

export const useDisposalCertificate = (id: string | undefined) =>
  useQuery({
    queryKey: ['retention', 'certificate', id ?? ''] as const,
    queryFn: () => api.disposalCertificate(id!),
    enabled: !!id,
  })

export const useIntegrityRuns = () =>
  useQuery({ queryKey: ['retention', 'integrity'] as const, queryFn: () => api.integrityRuns() })

export const useIntegrityRun = (id: string | undefined) =>
  useQuery({
    queryKey: ['retention', 'integrity', id ?? ''] as const,
    queryFn: () => api.integrityRun(id!),
    enabled: !!id,
  })

export function useLegalHold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { evidenceId: string; place: boolean; reason: string; etag: string }) =>
      v.place
        ? api.placeLegalHold(v.evidenceId, v.reason, v.etag)
        : api.releaseLegalHold(v.evidenceId, v.reason, v.etag),
    onSettled: () => qc.invalidateQueries({ queryKey: ['retention'] }),
  })
}

export function useRequestDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { evidenceIds: string[]; reason: string }) =>
      api.requestDisposal(v.evidenceIds, v.reason),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['retention'] })
      qc.invalidateQueries({ queryKey: ['approvals'] })
    },
  })
}

export function useExecuteDisposal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; etag: string }) => api.executeDisposal(v.id, v.etag),
    onSettled: () => qc.invalidateQueries({ queryKey: ['retention'] }),
  })
}

export function useStartIntegrityRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (rate?: number) => api.startIntegrityRun(rate),
    onSettled: () => qc.invalidateQueries({ queryKey: ['retention', 'integrity'] }),
  })
}
