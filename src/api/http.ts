import {
  type AlertDto,
  type ApprovalDto,
  type AuditEntryDto,
  type CaseDto,
  type EvidenceDto,
  type NameOf,
  type PageDto,
  type PolicyDto,
  type SearchHitDto,
  type SourceDto,
  type SourceViewDto,
  type StoryDto,
  type TriageItemDto,
  type WallPublicationDto,
  type WallStateDto,
  fromPriority,
  fromWallState,
  shortId,
  toAlert,
  toApproval,
  toAuditEvent,
  toCaseDetail,
  toCaseSummary,
  toItemDetail,
  toPolicy,
  toReviewItem,
  toSearchResponse,
  toSourceRecord,
  toStoryGroups,
  toTriageItem,
  toWallPublication,
  toWallState,
  toWatchFloor,
} from './adapters'
import type { FusionApi } from './contract'
import { ApiError, toProblem } from './problem'
import { session } from './session'
import type { Kpi, Me, SearchHit, WallPreset } from './types'

export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://localhost:5100').replace(
  /\/$/,
  '',
)

type Query = Record<string, string | undefined>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
  ifMatch?: string
}

interface Raw<T> {
  body: T
  etag: string | null
}

async function send<T>(path: string, opts: RequestOptions = {}): Promise<Raw<T>> {
  const url = new URL(`${API_BASE}/api/v1${path}`)
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v) url.searchParams.set(k, v)

  const headers = new Headers({ Accept: 'application/json, application/problem+json' })
  const token = await session.getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json')
  if (opts.ifMatch) headers.set('If-Match', opts.ifMatch)
  // Mutations are idempotent so a retried click never applies twice.
  if (opts.method && opts.method !== 'GET') headers.set('Idempotency-Key', crypto.randomUUID())

  let response: Response
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch (cause) {
    throw new ApiError({
      title: 'Gateway unreachable',
      status: 0,
      code: 'network_error',
      detail: cause instanceof Error ? cause.message : undefined,
    })
  }

  const etag = response.headers.get('ETag')
  if (response.status === 204) return { body: undefined as T, etag }
  const text = await response.text()
  let body: unknown = undefined
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    body = undefined
  }
  if (!response.ok) throw new ApiError(toProblem(response.status, body, response.statusText))
  return { body: body as T, etag }
}

const request = async <T>(path: string, opts?: RequestOptions) => (await send<T>(path, opts)).body

const enc = encodeURIComponent

// ---------------------------------------------------------------------------------------
// People: services store user ids; the gateway's /people turns them into names. Cached for
// the session, and a page waits for the names it needs in one call.
// ---------------------------------------------------------------------------------------

const names = new Map<string, string>()

async function nameOf(ids: (string | null | undefined)[]): Promise<NameOf> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id && !names.has(id)))]
  if (wanted.length > 0) {
    try {
      const people = await request<{ id: string; name: string }[]>('/people', {
        query: { ids: wanted.join(',') },
      })
      for (const p of people) names.set(p.id, p.name)
    } catch {
      // Names are a nicety: a page still renders with short ids if the directory is down.
    }
  }
  return (id) => (id ? (names.get(id) ?? shortId(id)) : '—')
}

/** Search hits from the last search, so an item can open without an item endpoint. */
const lastHits = new Map<string, SearchHit>()

async function sourceCall(path: string, opts: RequestOptions) {
  const s = await request<SourceViewDto>(path, opts)
  return toSourceRecord(s, await nameOf([s.proposedBy, s.approvedBy]))
}

async function fetchCase(id: string) {
  return send<CaseDto>(`/cases/${enc(id)}`)
}

export const httpApi: FusionApi = {
  me: () => request<Me>('/me'),

  watchFloor: async () =>
    toWatchFloor(await request<{ kpis: Kpi[]; sources: SourceDto[] }>('/watch-floor')),

  feed: async (p) => {
    const page = await request<PageDto<StoryDto>>('/feed', {
      query: { cursor: p?.cursor, limit: '200' },
    })
    const groups = toStoryGroups(page.items)
    return {
      items: p?.channel ? groups.filter((g) => g.channel === p.channel) : groups,
      nextCursor: page.nextCursor,
    }
  },
  sendToTriage: async (id) => {
    await request(`/story-groups/${enc(id)}/send-to-triage`, { method: 'POST' })
  },

  sources: async (p) => {
    const page = await request<PageDto<SourceViewDto>>('/sources', {
      query: { status: p?.status, limit: '200' },
    })
    const name = await nameOf(page.items.flatMap((s) => [s.proposedBy, s.approvedBy]))
    return { items: page.items.map((s) => toSourceRecord(s, name)), nextCursor: page.nextCursor }
  },
  proposeSource: (input) => sourceCall('/sources', { method: 'POST', body: input }),
  editSource: (id, input, etag) =>
    sourceCall(`/sources/${enc(id)}`, { method: 'PUT', body: input, ifMatch: etag }),
  approveSource: (id, etag) =>
    sourceCall(`/sources/${enc(id)}/approve`, { method: 'POST', ifMatch: etag }),
  suspendSource: (id, reason, etag) =>
    sourceCall(`/sources/${enc(id)}/suspend`, { method: 'POST', body: { reason }, ifMatch: etag }),
  reinstateSource: (id, etag) =>
    sourceCall(`/sources/${enc(id)}/reinstate`, { method: 'POST', ifMatch: etag }),

  triage: async (p) => {
    const page = await request<PageDto<TriageItemDto>>('/triage', {
      query: { status: p?.status, limit: '100' },
    })
    // Headlines come from intake and originals from evidence; either missing still lists the item.
    const items = await Promise.all(
      page.items.map(async (t) => {
        const [story, evidence] = await Promise.all([
          t.storyId
            ? request<StoryDto>(`/stories/${enc(t.storyId)}`).catch(() => null)
            : Promise.resolve(null),
          Promise.all(
            t.evidenceIds.map((id) =>
              request<EvidenceDto>(`/evidence/${enc(id)}`).catch(() => null),
            ),
          ).then((list) => list.filter((e): e is EvidenceDto => e !== null)),
        ])
        return { t, story, evidence }
      }),
    )
    const name = await nameOf(page.items.map((t) => t.promotedBy))
    return {
      items: items.map(({ t, story, evidence }) => toTriageItem(t, story, evidence, name)),
      nextCursor: page.nextCursor,
    }
  },
  promoteTriage: async (id, input) => {
    const c = await request<CaseDto>(`/triage/${enc(id)}/promote`, {
      method: 'POST',
      body: { ...input, priority: fromPriority(input.priority) },
    })
    return { caseId: c.id }
  },

  alerts: async (p) => {
    const page = await request<PageDto<AlertDto>>('/alerts', {
      query: { status: p?.status === 'escalated' ? 'open' : p?.status },
    })
    const name = await nameOf(page.items.map((a) => a.acknowledgedBy))
    return { items: page.items.map((a) => toAlert(a, name)), nextCursor: page.nextCursor }
  },
  acknowledgeAlert: async (id) => {
    const a = await request<AlertDto>(`/alerts/${enc(id)}/ack`, { method: 'POST' })
    return toAlert(a, await nameOf([a.acknowledgedBy]))
  },

  cases: async (p) => {
    const page = await request<PageDto<CaseDto>>('/cases', {
      query: { state: p?.state, limit: '200' },
    })
    const name = await nameOf(page.items.map((c) => c.ownerId))
    const q = p?.q?.trim().toLowerCase()
    const items = page.items
      .filter(
        (c) => !q || c.title.toLowerCase().includes(q) || c.reference.toLowerCase().includes(q),
      )
      .map((c) => toCaseSummary(c, name))
    return { items, nextCursor: page.nextCursor }
  },
  case: async (id) => {
    const { body: c, etag } = await fetchCase(id)
    // Evidence an analyst may not read is left out rather than failing the case page.
    const evidence = (
      await Promise.all(
        c.items.map((i) =>
          request<EvidenceDto>(`/evidence/${enc(i.evidenceId)}`).catch(() => null),
        ),
      )
    ).filter((e): e is EvidenceDto => e !== null)
    const name = await nameOf([c.ownerId, c.createdBy, ...c.checklist.map((i) => i.doneBy)])
    return toCaseDetail(c, evidence, name, etag)
  },
  submitCase: async (id, etag) => {
    await send(`/cases/${enc(id)}/submit`, { method: 'POST', ifMatch: etag })
    return httpApi.case(id)
  },

  // A review is governance's CASE_REVIEW gate waiting on the caller's active role.
  reviews: async () => {
    const page = await request<PageDto<ApprovalDto>>('/approvals', {
      query: { assignee: 'me', type: 'CASE_REVIEW' },
    })
    const cases = await Promise.all(
      page.items.map((a) =>
        a.caseId
          ? fetchCase(a.caseId)
              .then((r) => r.body)
              .catch(() => undefined)
          : undefined,
      ),
    )
    const name = await nameOf(page.items.map((a) => a.requestedBy))
    return {
      items: page.items.map((a, i) => toReviewItem(a, cases[i], name)),
      nextCursor: page.nextCursor,
    }
  },
  decideReview: async (caseId, decision, comment) => {
    const open = await request<PageDto<ApprovalDto>>('/approvals', {
      query: { caseId, type: 'CASE_REVIEW', status: 'pending' },
    })
    const gate = open.items[0]
    if (!gate)
      throw new ApiError({
        title: 'This case has no review waiting.',
        status: 404,
        code: 'not_found',
      })
    await request(`/approvals/${enc(gate.id)}/decisions`, {
      method: 'POST',
      body: { decision: decision === 'return' ? 'reject' : 'approve', comment: comment || null },
    })
  },

  approvals: async () => {
    const page = await request<PageDto<ApprovalDto>>('/approvals', { query: { assignee: 'me' } })
    const cases = await Promise.all(
      page.items.map((a) =>
        a.caseId
          ? fetchCase(a.caseId)
              .then((r) => r.body.reference)
              .catch(() => undefined)
          : undefined,
      ),
    )
    const name = await nameOf(
      page.items.flatMap((a) => [a.requestedBy, ...a.decisions.map((d) => d.decidedBy)]),
    )
    return {
      items: page.items.map((a, i) => toApproval(a, name, cases[i])),
      nextCursor: page.nextCursor,
    }
  },
  decideApproval: async (id, decision, comment) => {
    const a = await request<ApprovalDto>(`/approvals/${enc(id)}/decisions`, {
      method: 'POST',
      body: { decision: decision === 'refuse' ? 'reject' : 'approve', comment: comment || null },
    })
    return toApproval(a, await nameOf([a.requestedBy, ...a.decisions.map((d) => d.decidedBy)]))
  },

  policies: async () => {
    const list = await request<PolicyDto[]>('/policies')
    const name = await nameOf(list.map((p) => p.changedBy))
    return list.map((p) => toPolicy(p, name))
  },
  updatePolicy: async (key, value, authorityRef) => {
    const p = await request<PolicyDto>(`/policies/${enc(key)}`, {
      method: 'PUT',
      body: { enabled: value, authorityRef },
    })
    return toPolicy(p, await nameOf([p.changedBy]))
  },
  audit: async (p) => {
    const page = await request<PageDto<AuditEntryDto>>('/audit', {
      query: { actor: p?.actor, action: p?.action, cursor: p?.cursor },
    })
    const name = await nameOf(page.items.map((e) => e.onBehalfOf ?? e.actor))
    return { items: page.items.map((e) => toAuditEvent(e, name)), nextCursor: page.nextCursor }
  },

  search: async (q, kind) => {
    const started = performance.now()
    const page = await request<PageDto<SearchHitDto>>('/search', { query: { q } })
    const result = toSearchResponse(page, Math.round(performance.now() - started))
    for (const hit of result.items) lastHits.set(hit.id, hit)
    return kind ? { ...result, items: result.items.filter((i) => i.kind === kind) } : result
  },
  item: async (id) => {
    const hit = lastHits.get(id)
    if (!hit)
      throw new ApiError({
        title: 'Search again to open this item.',
        status: 404,
        code: 'not_found',
      })
    if (hit.kind === 'news') {
      const story = await request<StoryDto>(`/stories/${enc(id)}`).catch(() => null)
      if (story)
        return toItemDetail(hit, {
          detail: story.summary ?? story.headline,
          metadata: [
            { key: 'Link', value: story.url },
            { key: 'Published', value: new Date(story.publishedAt).toLocaleString() },
          ],
        })
    }
    return toItemDetail(hit)
  },

  wallState: async () => {
    const w = await request<WallStateDto>('/wall/state')
    return toWallState(w, await nameOf([w.updatedBy]))
  },
  putWallState: async (state) => {
    const w = await request<WallStateDto>('/wall/state', {
      method: 'PUT',
      body: fromWallState(state),
      ifMatch: `"v${state.revision}"`,
    })
    return toWallState(w, await nameOf([w.updatedBy]))
  },
  wallPresets: () => request<WallPreset[]>('/wall/presets'),
  activatePreset: async (key) => {
    const w = await request<WallStateDto>(`/wall/presets/${enc(key)}/activate`, { method: 'POST' })
    return toWallState(w, await nameOf([w.updatedBy]))
  },
  wallPublications: async () => {
    const list = await request<WallPublicationDto[]>('/wall/publications')
    const name = await nameOf(list.map((p) => p.requestedBy))
    return list.map((p) => toWallPublication(p, name))
  },
  requestPublication: async (input) => {
    const p = await request<WallPublicationDto>('/wall/publications', {
      method: 'POST',
      body: input,
    })
    return toWallPublication(p, await nameOf([p.requestedBy]))
  },
  decidePublication: async (id, decision) => {
    const p = await request<WallPublicationDto>(`/wall/publications/${enc(id)}/decision`, {
      method: 'POST',
      body: { decision },
    })
    return toWallPublication(p, await nameOf([p.requestedBy]))
  },
}
