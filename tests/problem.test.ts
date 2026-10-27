import { describe, expect, it } from 'vitest'
import { ApiError, describeError, toProblem } from '@/api/problem'

describe('problem details', () => {
  it('keeps the stable code from an RFC 9457 body', () => {
    const p = toProblem(403, {
      title: 'Forbidden',
      status: 403,
      code: 'self_approval_forbidden',
      detail: 'x',
    })
    expect(p.code).toBe('self_approval_forbidden')
    expect(describeError(new ApiError(p))).toMatch(/cannot approve your own work/i)
  })

  it('derives a code when a proxy returns something that is not problem+json', () => {
    expect(toProblem(412, undefined).code).toBe('precondition_failed')
    expect(toProblem(401, '<html>').code).toBe('unauthenticated')
    expect(toProblem(503, null, 'Service Unavailable')).toMatchObject({
      title: 'Service Unavailable',
      code: 'internal_error',
    })
  })
})
