import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './index'
import type {
  Alert,
  CaseState,
  Page,
  ReviewDecision,
  SearchKind,
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      qc.invalidateQueries({ queryKey: qk.watchFloor })
    },
  })
}

export const useCases = (state?: CaseState | 'active', q?: string) =>
  useQuery({ queryKey: qk.cases(state, q), queryFn: () => api.cases({ state, q }) })

export const useCase = (id: string) =>
  useQuery({ queryKey: qk.case(id), queryFn: () => api.case(id), enabled: !!id })

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
