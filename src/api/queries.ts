import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './index'
import type {
  Alert,
  BriefSentence,
  CaseState,
  ClaimOutcomeInput,
  FindingInput,
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
  mediaAnalysis: (evidenceId: string) => ['media', evidenceId] as const,
  briefs: (caseId?: string) => ['briefs', caseId ?? 'all'] as const,
  brief: (id: string) => ['brief', id] as const,
  supportCheck: (id: string) => ['brief', id, 'support-check'] as const,
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

export function useBriefAction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: BriefAction) =>
      a.kind === 'redraft'
        ? api.redraftBrief(id, { title: a.title, sentences: a.sentences }, a.etag)
        : api.releaseBrief(id, a.etag),
    onSuccess: (b) => {
      qc.setQueryData(qk.brief(id), b)
      qc.invalidateQueries({ queryKey: ['briefs'] })
      qc.invalidateQueries({ queryKey: qk.supportCheck(id) })
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
  | { kind: 'checklist'; key: string; done: boolean }
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
          return api.setChecklistItem(id, a.key, a.done)
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
