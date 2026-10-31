import {
  type NameClusterDto,
  type NameMentionDto,
  type NameReportDataDto,
  type NameSearchDto,
  toNameCluster,
  toNameMention,
  toNameReportData,
  toNameSearch,
  type AlertDto,
  type ApprovalDto,
  type CaptureRequestDto,
  type CaseMatrixDto,
  type CctvRequestDto,
  type UploadSlotDto,
  type AuditEntryDto,
  type CaseDto,
  type MissionTemplateDto,
  toMissionTemplate,
  fromMissionTemplateInput,
  type EvidenceDto,
  type MessageDto,
  type ShiftDto,
  type NameOf,
  type PageDto,
  type ProductDto,
  type SupportCheckDto,
  type PolicyDto,
  type SearchHitDto,
  type SourceDto,
  type SourceViewDto,
  type StoryDto,
  type TriageItemDto,
  type WallControllerDto,
  type WallLayoutPublicationDto,
  type WallPublicationDto,
  type WallStateDto,
  fromPriority,
  peopleOfCase,
  fromWallState,
  shortId,
  toAlert,
  toDelivery,
  toShift,
  toApproval,
  toBrief,
  toCaptureRequest,
  toCaseMatrix,
  toCctvRequest,
  toSupportCheck,
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
  toWallController,
  toWallLayoutPublication,
  toWallPublication,
  toWallState,
  toWatchFloor,
} from './adapters'
import type { FusionApi } from './contract'
import { ApiError, toProblem } from './problem'
import { session } from './session'
import { sha256Hex } from '@/lib/sha256'
import type {
  CctvRequest,
  DutyTier,
  FindingInput,
  Kpi,
  Me,
  MediaAnalysis,
  MediaScreening,
  PersonContact,
  ProviderBudget,
  ProviderReport,
  ProviderTerms,
  SearchHit,
  SourceApproveResult,
  SourceImportResult,
  UploadProgress,
  WallPreset,
  WorkingCopy,
} from './types'

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

/**
 * The file itself goes straight to the store on the presigned URL, never through the gateway
 * (architecture §11). XMLHttpRequest rather than fetch, for upload progress. The store answers in
 * S3's XML, so a refusal becomes a plain problem here.
 */
function putToStore(
  slot: UploadSlotDto,
  file: File,
  onProgress?: (p: UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(slot.method || 'PUT', slot.uploadUrl)
    for (const [k, v] of Object.entries(slot.headers ?? {})) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: e.loaded, total: e.total })
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(
            new ApiError({
              title: 'The file store refused the upload',
              status: xhr.status,
              code: xhr.status === 403 ? 'upload_expired' : 'upload_failed',
              detail:
                xhr.status === 403
                  ? 'The upload link was refused or has expired. Try again.'
                  : `The store answered ${xhr.status}.`,
            }),
          )
    xhr.onerror = () =>
      reject(
        new ApiError({
          title: 'File store unreachable',
          status: 0,
          code: 'network_error',
          detail: `Could not reach ${new URL(slot.uploadUrl).host}.`,
        }),
      )
    xhr.send(file)
  })
}

/** A binary download (a brief's PDF), with the same token and the same problem handling. */
async function download(path: string): Promise<Blob> {
  const headers = new Headers({ Accept: 'application/pdf, application/problem+json' })
  const token = await session.getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, { headers })
  } catch (cause) {
    throw new ApiError({
      title: 'Gateway unreachable',
      status: 0,
      code: 'network_error',
      detail: cause instanceof Error ? cause.message : undefined,
    })
  }
  if (!response.ok) {
    const text = await response.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = undefined
    }
    throw new ApiError(toProblem(response.status, body, response.statusText))
  }
  return response.blob()
}

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

/** casework calls the judgement `text`; the screens call it the finding's statement. */
const findingBody = (f: FindingInput) => ({
  text: f.statement,
  confidence: f.confidence,
  basis: f.basis,
  evidenceIds: f.evidenceIds,
  statementIds: f.statementIds,
})

const briefPeople = (b: ProductDto) => [
  b.authorId,
  ...b.versions.flatMap((v) => [v.createdBy, v.releasedBy]),
]

async function briefCall(path: string, opts?: RequestOptions) {
  const b = await request<ProductDto>(path, opts)
  return toBrief(b, await nameOf(briefPeople(b)))
}

async function fetchCase(id: string) {
  return send<CaseDto>(`/cases/${enc(id)}`)
}

/** Case references for a set of case ids; a case the person cannot open keeps its short id. */
async function caseRefs(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  const refs = await Promise.all(
    unique.map((id) =>
      fetchCase(id)
        .then((r) => r.body.reference)
        .catch(() => undefined),
    ),
  )
  return new Map(unique.flatMap((id, i) => (refs[i] ? [[id, refs[i]] as const] : [])))
}

async function cctvCall(path: string, opts?: RequestOptions): Promise<CctvRequest> {
  const r = await request<CctvRequestDto>(path, opts)
  const [name, refs] = await Promise.all([nameOf([r.requestedBy]), caseRefs([r.caseId])])
  return toCctvRequest(r, name, refs.get(r.caseId))
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
    // The whole register: a starting set is about a hundred, and intake pages at 200.
    const all: SourceViewDto[] = []
    let cursor: string | undefined
    do {
      const page: PageDto<SourceViewDto> = await request<PageDto<SourceViewDto>>('/sources', {
        query: { status: p?.status, limit: '200', cursor },
      })
      all.push(...page.items)
      cursor = page.nextCursor ?? undefined
    } while (cursor && all.length < 2000)
    const name = await nameOf(all.flatMap((s) => [s.proposedBy, s.approvedBy]))
    return { items: all.map((s) => toSourceRecord(s, name)), nextCursor: null }
  },
  proposeSource: (input) => sourceCall('/sources', { method: 'POST', body: input }),
  editSource: (id, input, etag) =>
    sourceCall(`/sources/${enc(id)}`, { method: 'PUT', body: input, ifMatch: etag }),
  approveSource: (id, etag) =>
    sourceCall(`/sources/${enc(id)}/approve`, { method: 'POST', ifMatch: etag }),
  importSources: async (sources) => {
    const r = await request<{
      created: SourceViewDto[]
      skipped: SourceImportResult['skipped']
      invalid: SourceImportResult['invalid']
    }>('/sources/import', { method: 'POST', body: { sources } })
    const name = await nameOf(r.created.flatMap((s) => [s.proposedBy, s.approvedBy]))
    return { ...r, created: r.created.map((s) => toSourceRecord(s, name)) }
  },
  approveSources: async (items) => {
    const r = await request<{ approved: SourceViewDto[]; refused: SourceApproveResult['refused'] }>(
      '/sources/approve',
      { method: 'POST', body: { items } },
    )
    const name = await nameOf(r.approved.flatMap((s) => [s.proposedBy, s.approvedBy]))
    return { ...r, approved: r.approved.map((s) => toSourceRecord(s, name)) }
  },
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
  alert: async (id) => {
    const a = await request<AlertDto>(`/alerts/${enc(id)}`)
    return toAlert(a, await nameOf([a.acknowledgedBy]))
  },
  acknowledgeAlert: async (id) => {
    const a = await request<AlertDto>(`/alerts/${enc(id)}/ack`, { method: 'POST' })
    return toAlert(a, await nameOf([a.acknowledgedBy]))
  },
  alertDeliveries: async (id) =>
    (await request<MessageDto[]>(`/alerts/${enc(id)}/messages`)).map(toDelivery),

  notifications: async (p) =>
    (
      await request<MessageDto[]>('/notifications', {
        query: { unread: p?.unread ? 'true' : undefined },
      })
    ).map(toDelivery),
  markNotificationRead: async (id) =>
    toDelivery(await request<MessageDto>(`/notifications/${enc(id)}/read`, { method: 'POST' })),

  dutyRoster: async (p) =>
    (await request<ShiftDto[]>('/duty-roster', { query: { from: p?.from, to: p?.to } })).map(
      toShift,
    ),
  onDutyNow: async () =>
    (await request<{ tier: DutyTier; people: ShiftDto[] }[]>('/duty-roster/now')).map((t) => ({
      tier: t.tier,
      people: t.people.map(toShift),
    })),
  addShift: async (input) =>
    toShift(await request<ShiftDto>('/duty-roster/shifts', { method: 'POST', body: input })),
  removeShift: async (id) => {
    await request<void>(`/duty-roster/shifts/${enc(id)}`, { method: 'DELETE' })
  },

  // casework, media and evidence answer camelCase in the screens' own shapes.
  caseMedia: (caseId) => request<MediaScreening[]>(`/cases/${enc(caseId)}/media`),
  mediaAnalysis: async (evidenceId) => {
    try {
      return await request<MediaAnalysis>(`/media/evidence/${enc(evidenceId)}`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },
  workingCopy: (evidenceId) => request<WorkingCopy>(`/evidence/${enc(evidenceId)}/working-copy`),

  caseMatrix: async (caseId) =>
    toCaseMatrix(await request<CaseMatrixDto>(`/cases/${enc(caseId)}/matrix`)),

  uploadEvidence: async (caseId, file, onProgress) => {
    // Hash first: a file that changes on disk mid-upload is then refused rather than sealed.
    const sha256 = await sha256Hex(file)
    const slot = await request<UploadSlotDto>('/evidence/uploads', {
      method: 'POST',
      body: {
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        caseId,
      },
    })
    await putToStore(slot, file, onProgress)
    const sealed = await request<EvidenceDto>(`/evidence/uploads/${enc(slot.id)}/commit`, {
      method: 'POST',
      body: { caseId, sha256 },
    })
    return { evidenceId: sealed.id }
  },
  captureLink: async (caseId, url, includeMedia) =>
    toCaptureRequest(
      await request<CaptureRequestDto>('/evidence/captures', {
        method: 'POST',
        body: { url, caseId, includeMedia },
      }),
    ),
  capture: async (id) =>
    toCaptureRequest(await request<CaptureRequestDto>(`/evidence/captures/${enc(id)}`)),

  // collector's API is camelCase already (fusion_web ApiModel): no adapter needed.
  provider: () => request<ProviderReport>('/provider'),
  setProviderBudget: (monthlyCreditCap) =>
    request<ProviderBudget>('/provider/budget', { method: 'PUT', body: { monthlyCreditCap } }),
  setProviderTerms: (sourceId, input) =>
    request<ProviderTerms>(`/provider/sources/${enc(sourceId)}`, { method: 'PUT', body: input }),
  clearProviderHost: async (host) => {
    await request<void>(`/provider/hosts/${enc(host)}`, { method: 'DELETE' })
  },
  searchPeople: async (q) =>
    (
      await request<(PersonContact & { username: string | null; email: string | null })[]>(
        '/people/search',
        { query: { q } },
      )
    ).map((p) => ({
      id: p.id,
      name: p.name,
      username: p.username ?? undefined,
      email: p.email ?? undefined,
    })),

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
    const name = await nameOf(peopleOfCase(c))
    return toCaseDetail(c, evidence, name, etag)
  },
  submitCase: async (id, etag) => {
    await send(`/cases/${enc(id)}/submit`, { method: 'POST', ifMatch: etag })
    return httpApi.case(id)
  },
  // Each assessment call answers with the case; the page needs evidence and names on top, so it
  // is read again through case() — one more request for a page that stays consistent.
  setChecklistItem: async (id, key, done, note) => {
    await send(`/cases/${enc(id)}/checklist/${enc(key)}`, { method: 'PUT', body: { done, note } })
    return httpApi.case(id)
  },
  setCaseSummary: async (id, summary) => {
    await send(`/cases/${enc(id)}/summary`, { method: 'PUT', body: { summary } })
    return httpApi.case(id)
  },
  recordFinding: async (id, input) => {
    await send(`/cases/${enc(id)}/findings`, { method: 'POST', body: findingBody(input) })
    return httpApi.case(id)
  },
  reviseFinding: async (id, findingId, input, version) => {
    await send(`/cases/${enc(id)}/findings/${enc(findingId)}`, {
      method: 'PUT',
      body: findingBody(input),
      ifMatch: `"v${version}"`,
    })
    return httpApi.case(id)
  },
  recordStatement: async (id, input) => {
    await send(`/cases/${enc(id)}/statements`, { method: 'POST', body: input })
    return httpApi.case(id)
  },
  recordClaim: async (id, input) => {
    await send(`/cases/${enc(id)}/claims`, { method: 'POST', body: input })
    return httpApi.case(id)
  },
  setClaimOutcome: async (caseId, claimId, input) => {
    await send(`/claims/${enc(claimId)}/outcome`, { method: 'PUT', body: input })
    return httpApi.case(caseId)
  },

  briefs: async (p) => {
    const page = await request<PageDto<ProductDto>>('/products', {
      query: { caseId: p?.caseId, limit: '100' },
    })
    const name = await nameOf(page.items.flatMap(briefPeople))
    return { items: page.items.map((b) => toBrief(b, name)), nextCursor: page.nextCursor }
  },
  brief: (id) => briefCall(`/products/${enc(id)}`),
  // No sentences: reporting seeds the draft from the case's findings and assessed claims.
  createBrief: (caseId) => briefCall('/products', { method: 'POST', body: { caseId } }),
  redraftBrief: (id, input, etag) =>
    briefCall(`/products/${enc(id)}/draft`, { method: 'PUT', body: input, ifMatch: etag }),
  supportCheck: async (id) =>
    toSupportCheck(await request<SupportCheckDto>(`/products/${enc(id)}/support-check`)),
  releaseBrief: (id, etag) =>
    briefCall(`/products/${enc(id)}/release`, { method: 'POST', ifMatch: etag }),
  briefPdf: (id, version) =>
    download(
      version ? `/products/${enc(id)}/versions/${version}/pdf` : `/products/${enc(id)}/preview.pdf`,
    ),

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
  saveWallPreset: (input) => request<WallPreset>('/wall/presets', { method: 'POST', body: input }),
  deleteWallPreset: async (key) => {
    await request<void>(`/wall/presets/${enc(key)}`, { method: 'DELETE' })
  },
  publishWallLayout: async (revision) => {
    const p = await request<WallLayoutPublicationDto>('/wall/layout-publications', {
      method: 'POST',
      ifMatch: `"v${revision}"`,
    })
    return toWallLayoutPublication(p, await nameOf([p.publishedBy]))
  },
  wallLayoutPublications: async () => {
    const list = await request<WallLayoutPublicationDto[]>('/wall/layout-publications')
    const name = await nameOf(list.map((p) => p.publishedBy))
    return list.map((p) => toWallLayoutPublication(p, name))
  },
  wallController: async () =>
    toWallController(await request<WallControllerDto>('/wall/controller')),

  cctvRequests: async (p) => {
    const page = await request<PageDto<CctvRequestDto>>('/cctv/requests', {
      query: { status: p?.status, limit: '200' },
    })
    const [name, refs] = await Promise.all([
      nameOf(page.items.map((r) => r.requestedBy)),
      caseRefs(page.items.map((r) => r.caseId)),
    ])
    return {
      items: page.items.map((r) => toCctvRequest(r, name, refs.get(r.caseId))),
      nextCursor: page.nextCursor,
    }
  },
  cctvRequest: async (id) => {
    const found = await cctvCall(`/cctv/requests/${enc(id)}`)
    if (!found.approvalId) return { request: found }
    // The approvers' decisions, and a refusal's reason, live in governance.
    const a = await request<ApprovalDto>(`/approvals/${enc(found.approvalId)}`).catch(
      () => undefined,
    )
    if (!a) return { request: found }
    const name = await nameOf([a.requestedBy, ...a.decisions.map((d) => d.decidedBy)])
    return { request: found, approval: toApproval(a, name, found.caseRef) }
  },
  createCctvRequest: (caseId, input) =>
    cctvCall('/cctv/requests', { method: 'POST', body: { caseId, ...input } }),
  editCctvRequest: (id, input, etag) =>
    cctvCall(`/cctv/requests/${enc(id)}`, { method: 'PUT', body: input, ifMatch: etag }),
  submitCctvRequest: (id, etag) =>
    cctvCall(`/cctv/requests/${enc(id)}/submit`, { method: 'POST', ifMatch: etag }),
  cctvCameras: async () => (await request<{ id: string }[]>('/cctv/cameras')).map((c) => c.id),
  cctvLawfulBases: () => request<{ code: string; label: string }[]>('/cctv/lawful-bases'),

  // Missions (E29, ADR 0012).
  missionTemplates: async (p) => {
    const list = await request<{ items: MissionTemplateDto[] }>('/missions', {
      query: { retired: p?.retired ? 'true' : undefined },
    })
    const name = await nameOf(
      list.items.flatMap((t) => [t.updatedBy, ...t.versions.map((v) => v.createdBy)]),
    )
    return list.items.map((t) => toMissionTemplate(t, name))
  },
  createMissionTemplate: async (input) => {
    const t = await request<MissionTemplateDto>('/missions', {
      method: 'POST',
      body: fromMissionTemplateInput(input),
    })
    return toMissionTemplate(t, await nameOf([t.updatedBy]))
  },
  reviseMissionTemplate: async (key, input, etag) => {
    const t = await request<MissionTemplateDto>(`/missions/${enc(key)}`, {
      method: 'PUT',
      body: fromMissionTemplateInput({ ...input, key: undefined }),
      ifMatch: etag,
    })
    return toMissionTemplate(t, await nameOf(t.versions.map((v) => v.createdBy)))
  },
  retireMissionTemplate: async (key, etag) => {
    const t = await request<MissionTemplateDto>(`/missions/${enc(key)}/retire`, {
      method: 'POST',
      ifMatch: etag,
    })
    return toMissionTemplate(t, await nameOf([t.updatedBy]))
  },
  applyCaseMission: async (caseId, templateKey) => {
    await send(`/cases/${enc(caseId)}/mission`, { method: 'PUT', body: { templateKey } })
    return httpApi.case(caseId)
  },
  setCaseCategory: async (caseId, category) => {
    await send(`/cases/${enc(caseId)}/category`, { method: 'PUT', body: { category } })
    return httpApi.case(caseId)
  },

  // Name-of-interest searches (E30, ADR 0013).
  nameSearches: async () => {
    const page = await request<PageDto<NameSearchDto>>('/names', { query: { requester: 'me' } })
    const name = await nameOf(page.items.map((s) => s.requestedBy))
    return { items: page.items.map((s) => toNameSearch(s, name)), nextCursor: page.nextCursor }
  },
  nameSearch: async (id) => {
    const s = await request<NameSearchDto>(`/names/${enc(id)}`)
    return toNameSearch(s, await nameOf([s.requestedBy]))
  },
  startNameSearch: async (input) => {
    const s = await request<NameSearchDto>('/names', { method: 'POST', body: input })
    return toNameSearch(s, await nameOf([s.requestedBy]))
  },
  nameMentions: async (id, p) => {
    const page = await request<PageDto<NameMentionDto>>(`/names/${enc(id)}/results`, {
      query: { clusterId: p?.clusterId, limit: '100' },
    })
    return { items: page.items.map(toNameMention), nextCursor: page.nextCursor }
  },
  nameClusters: async (id) => {
    const clusters = await request<NameClusterDto[]>(`/names/${enc(id)}/clusters`)
    const name = await nameOf(clusters.map((c) => c.decidedBy))
    return clusters.map((c) => toNameCluster(c, name))
  },
  decideNameCluster: async (id, clusterId, confirmed) => {
    const c = await request<NameClusterDto>(
      `/names/${enc(id)}/clusters/${enc(clusterId)}/${confirmed ? 'confirm' : 'reject'}`,
      { method: 'POST' },
    )
    return toNameCluster(c, await nameOf([c.decidedBy]))
  },
  nameReportData: async (id) => {
    try {
      const r = await request<NameReportDataDto>(`/names/${enc(id)}/report-data`)
      return toNameReportData(r, await nameOf([r.createdBy]))
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  },
  takeNameReportData: async (id) => {
    const r = await request<NameReportDataDto>(`/names/${enc(id)}/report-data`, { method: 'POST' })
    return toNameReportData(r, await nameOf([r.createdBy]))
  },
}
