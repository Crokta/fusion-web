import { describe, expect, it } from 'vitest'
import {
  toBrief,
  toRendererToken,
  toReviewHistory,
  toWallZoneContent,
  toWallZones,
  type ApprovalDto,
  type ProductDto,
} from '@/api/adapters'
import { displayMocks, zonesOf } from '@/api/mock/display'
import { ApiError } from '@/api/problem'
import type { Brief, CaseSummary, Role, WallLayoutPublication, WallState } from '@/api/types'
import { atRisk, workload } from '@/features/desk/workload'

const name = (id: string | null | undefined) => (id ? `Name of ${id}` : '—')

describe('E34 adapters', () => {
  it('keeps a sentence’s heading and leaves it off when there is none', () => {
    const p: ProductDto = {
      id: 'p-1',
      caseId: 'c-1',
      title: 'Riverside',
      authorId: 'u-ada',
      status: 'draft',
      currentVersion: 1,
      sentences: [
        { order: 2, text: 'Two.', supportRefs: [], section: null },
        { order: 1, text: 'One.', supportRefs: ['finding:f-1'], section: 'Key judgements' },
      ],
      unsupportedSentences: [],
      versions: [],
      createdAt: '2026-11-01T09:00:00Z',
      updatedAt: '2026-11-01T09:00:00Z',
      version: 3,
    }
    expect(toBrief(p, name).sentences).toEqual([
      { text: 'One.', supportRefs: ['finding:f-1'], section: 'Key judgements' },
      { text: 'Two.', supportRefs: [] },
    ])
  })

  it('reads a case’s review gates as its history, newest first, a rejection as a return', () => {
    const gate = (
      id: string,
      at: string,
      status: ApprovalDto['status'],
      comment?: string,
    ): ApprovalDto => ({
      id,
      type: 'CASE_REVIEW',
      subjectType: 'case',
      subjectId: 'c-1',
      caseId: 'c-1',
      requestedBy: 'u-ada',
      reason: null,
      requestedAt: at,
      status,
      currentStep: null,
      totalSteps: 1,
      awaitingRoles: [],
      completedAt: null,
      expiresAt: null,
      windowStart: null,
      windowEnd: null,
      decisions:
        status === 'pending'
          ? []
          : [
              {
                step: 1,
                decidedBy: 'u-rex',
                role: 'reviewer',
                decision: status === 'approved' ? 'approve' : 'reject',
                comment: comment ?? null,
                decidedAt: at,
              },
            ],
      version: 1,
    })
    const history = toReviewHistory(
      [
        gate('a-1', '2026-10-30T09:00:00Z', 'rejected', 'Cite the LGA statement.'),
        gate('a-2', '2026-10-31T09:00:00Z', 'pending'),
      ],
      name,
    )
    expect(history.map((h) => h.outcome)).toEqual(['pending', 'returned'])
    expect(history[1]).toMatchObject({
      decidedBy: 'Name of u-rex',
      comment: 'Cite the LGA statement.',
    })
  })

  it('maps the published zones and a zone’s content without inventing names', () => {
    const zones = toWallZones({
      published: {
        id: 'w-1',
        ref: 'WL-ABC123',
        layoutVersion: 7,
        preset: 'briefing',
        publishedBy: 'u-lena',
        publishedAt: '2026-11-01T09:00:00Z',
      },
      visitorMode: true,
      rows: 4,
      cols: 4,
      zones: [
        { id: 'grp-10-11', cells: [10, 11], content: 'cases', contextRef: null, muted: true },
      ],
      at: '2026-11-01T09:05:00Z',
    })
    expect(zones.published).toMatchObject({ revision: 7, publishedBy: 'u-lena' })
    expect(zones.zones[0]).toEqual({
      id: 'grp-10-11',
      cells: [10, 11],
      content: 'cases',
      muted: true,
    })

    const content = toWallZoneContent({
      zone: { id: 'screen-3', cells: [3], content: 'cases', contextRef: 'CASE-1', muted: false },
      source: 'reporting',
      items: [{ kind: 'brief', ref: 'v2', title: 'Riverside', detail: null, at: null }],
      counts: [{ key: 'approved', label: 'Cases approved', count: 2 }],
      at: '2026-11-01T09:05:00Z',
    })
    expect(content.items[0]).toEqual({ kind: 'brief', ref: 'v2', title: 'Riverside' })
    expect(content.zone.contextRef).toBe('CASE-1')

    expect(
      toRendererToken(
        {
          id: 't-1',
          ref: 'WT-ABC123',
          label: 'Controller PC',
          issuedBy: 'u-lena',
          issuedAt: '2026-11-01T09:00:00Z',
          revokedBy: null,
          revokedAt: null,
          lastSeenAt: null,
          version: 1,
        },
        name,
      ),
    ).toEqual({
      id: 't-1',
      ref: 'WT-ABC123',
      label: 'Controller PC',
      issuedBy: 'Name of u-lena',
      issuedAt: '2026-11-01T09:00:00Z',
    })
  })
})

describe('the supervisor desk', () => {
  const now = new Date('2026-11-01T12:00:00Z').getTime()
  const c = (
    id: string,
    owner: string,
    state: CaseSummary['state'],
    deadline: string,
  ): CaseSummary => ({
    id,
    ref: `CASE-${id}`,
    title: id,
    state,
    priority: 'high',
    category: '',
    place: '',
    owner: { id: owner, name: owner },
    deadline,
    updatedAt: '2026-11-01T09:00:00Z',
    signalCount: 0,
    evidenceCount: 0,
    marking: 'OFFICIAL',
  })
  const cases = [
    c('1', 'Ada', 'in_assessment', '2026-11-01T10:00:00Z'),
    c('2', 'Ada', 'submitted', '2026-11-01T20:00:00Z'),
    c('3', 'Ada', 'returned', '2026-11-05T10:00:00Z'),
    c('4', 'Bo', 'open', ''),
    c('5', 'Bo', 'released', '2026-10-01T10:00:00Z'),
  ]

  it('counts each owner’s active cases by state, late and due within a day, busiest first', () => {
    const rows = workload(cases, now)
    expect(rows.map((r) => r.owner.name)).toEqual(['Ada', 'Bo'])
    expect(rows[0]).toMatchObject({
      total: 3,
      overdue: 1,
      dueSoon: 1,
      byState: { in_assessment: 1, submitted: 1, returned: 1 },
    })
    expect(rows[1]).toMatchObject({ total: 1, overdue: 0, dueSoon: 0 })
  })

  it('lists the late and nearly late, soonest first, never a released case or one without a deadline', () => {
    expect(atRisk(cases, now).map((x) => x.id)).toEqual(['1', '2'])
  })
})

describe('the wall renderer in the mock', () => {
  const publication: WallLayoutPublication = {
    id: 'w-1',
    ref: 'WL-1',
    revision: 3,
    preset: 'briefing',
    screens: Array.from({ length: 16 }, (_, index) => ({
      index,
      content: index === 10 || index === 11 ? 'cases' : index === 0 ? 'map-ng' : 'news',
    })),
    groups: [{ id: 'grp-10-11', cells: [11, 10], content: 'cases' }],
    visitorMode: false,
    adapter: 'simulator',
    publishedBy: 'Lena',
    publishedAt: '2026-11-01T09:00:00Z',
    delivered: true,
  }
  const released: Brief = {
    id: 'b-1',
    caseId: 'c-1',
    title: 'DRAFT RETITLE',
    authorId: 'u-ada',
    authorName: 'Ada',
    status: 'correcting',
    currentVersion: 2,
    sentences: [],
    versions: [
      {
        number: 1,
        createdBy: 'Ada',
        createdAt: '',
        releasedAt: '2026-10-31T10:00:00Z',
        hasPdf: true,
      },
      { number: 2, createdBy: 'Ada', createdAt: '', hasPdf: false, correctsVersion: 1 },
    ],
    createdAt: '',
    updatedAt: '',
    etag: '"v1"',
  }

  const setup = (role: Role, visitorMode = false) => {
    const audit: string[] = []
    const api = displayMocks({
      delay: async (v) => v(),
      refuse: (code, title, status = 403) => {
        audit.push(`refused ${code}`)
        throw new ApiError({ title, status, code })
      },
      requireRole: (roles, action) => {
        if (!roles.includes(role))
          throw new ApiError({ title: action, status: 403, code: 'capability_not_authorised' })
      },
      audit: (outcome, action) => audit.push(`${outcome} ${action}`),
      me: () => ({ id: 'u-lena', name: 'Lena' }),
      briefs: () => [released],
      wall: () => ({ visitorMode }) as WallState,
      layoutPublications: () => [publication],
      history: () => [],
    })
    return { api, audit }
  }

  it('draws a group and the screens outside it, in wall order', () => {
    const zones = zonesOf(publication)
    expect(zones).toHaveLength(15)
    expect(zones.slice(9, 11).map((z) => z.id)).toEqual(['screen-9', 'grp-10-11'])
  })

  it('needs wall.operate for tokens, and refuses a revoked one', async () => {
    await expect(setup('analyst').api.issueWallRendererToken('PC')).rejects.toMatchObject({
      status: 403,
    })
    const { api, audit } = setup('supervisor')
    const { token, secret } = await api.issueWallRendererToken('Controller PC')
    expect((await api.wallZones(secret)).zones).toHaveLength(15)
    expect(JSON.stringify(await api.wallRendererTokens())).not.toContain(secret)
    await api.revokeWallRendererToken(token.id)
    await expect(api.wallZones(secret)).rejects.toMatchObject({
      status: 401,
      code: 'renderer_token_invalid',
    })
    await expect(api.wallZones('wrt_nothing')).rejects.toMatchObject({ status: 401 })
    expect(audit).toContain('allowed wall.renderer_token.revoke')
  })

  it('shows a brief as released, never a correction’s draft title, and mutes under Visitor Mode', async () => {
    const shown = await setup('analyst').api.wallZoneContent('grp-10-11')
    expect(shown.source).toBe('reporting')
    expect(shown.items).toEqual([
      {
        kind: 'brief',
        ref: 'v1',
        title: 'Brief, version 1',
        at: '2026-10-31T10:00:00Z',
        detail: undefined,
      },
    ])
    const muted = await setup('analyst', true).api.wallZoneContent('grp-10-11')
    expect(muted.source).toBe('muted')
    expect((await setup('analyst', true).api.wallZoneContent('screen-0')).zone.muted).toBe(false)
    await expect(setup('evidence_officer').api.wallZones()).rejects.toMatchObject({ status: 403 })
  })
})
