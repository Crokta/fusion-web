import { afterEach, describe, expect, it } from 'vitest'
import { mockApi } from '@/api/mock/adapter'
import { ApiError } from '@/api/problem'
import { configureSession } from '@/api/session'
import type { Role } from '@/api/types'

/** The mock keeps cctv's rules (ADR 0014), so the screen is exercised against refusals. */
const as = (role: Role, userId = 'u-cctv-test') =>
  configureSession({ getActiveRole: () => role, getUserId: () => userId })

const failure = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x)
  expect(e).toBeInstanceOf(ApiError)
  return (e as ApiError).problem
}

const full = {
  cameras: ['cam-kawo-01'],
  windowStart: '2026-10-31T08:00:00Z',
  windowEnd: '2026-10-31T12:00:00Z',
  attributes: ['red jacket'],
  lawfulBasis: 'prevention_of_crime',
  reason: 'Armed robbery at the market; the suspect left on foot.',
}

describe('CCTV requests in the mock', () => {
  afterEach(() => as('analyst', 'anonymous'))

  it('drafts, refuses an incomplete submission, then submits and settles on approval', async () => {
    as('analyst')
    const { items } = await mockApi.cases({ state: 'active' })
    const draft = await mockApi.createCctvRequest(items[0]!.id, { cameras: [], attributes: [] })
    expect([draft.status, draft.etag]).toEqual(['draft', '"v1"'])

    const missing = await failure(mockApi.submitCctvRequest(draft.id, draft.etag))
    expect(Object.keys(missing.errors ?? {}).sort()).toEqual([
      'cameras',
      'lawfulBasis',
      'reason',
      'windowEnd',
      'windowStart',
    ])

    const edited = await mockApi.editCctvRequest(draft.id, full, draft.etag)
    expect((await failure(mockApi.editCctvRequest(draft.id, full, draft.etag))).code).toBe(
      'precondition_failed',
    )
    const sent = await mockApi.submitCctvRequest(draft.id, edited.etag)
    expect(sent.status).toBe('awaiting_approval')

    as('centre_lead', 'u-lead')
    await mockApi.decideApproval(sent.approvalId!, 'refuse', 'Window wider than the incident.')
    as('analyst')
    const { request, approval } = await mockApi.cctvRequest(draft.id)
    expect([request.status, request.refusal]).toEqual([
      'refused',
      'An approver refused the request.',
    ])
    expect(approval?.steps[0]?.comment).toBe('Window wider than the incident.')
  }, 15_000)

  it('refuses face attributes and roles without cctv.request', async () => {
    as('analyst')
    const { items } = await mockApi.cases({ state: 'active' })
    const faces = await failure(
      mockApi.createCctvRequest(items[0]!.id, { cameras: [], attributes: ['facial hair'] }),
    )
    expect(faces.errors?.attributes).toBeDefined()
    as('reviewer')
    expect((await failure(mockApi.cctvRequests())).code).toBe('capability_not_authorised')
  }, 10_000)
})
