import { afterEach, describe, expect, it } from 'vitest'
import {
  toDisposal,
  toDisposalCertificate,
  toIntegrityRunDetail,
  toRetentionItem,
  type DisposalDto,
} from '@/api/adapters'
import { mockApi } from '@/api/mock/adapter'
import { DEV_USER_ID } from '@/api/mock/fixtures'
import { ApiError } from '@/api/problem'
import { configureSession } from '@/api/session'
import type { Role } from '@/api/types'

/** The mock keeps evidence's retention rules (E39, ADR 0021), so the screen meets real refusals. */
const as = (role: Role, userId = 'u-retention-test') =>
  configureSession({ getActiveRole: () => role, getUserId: () => userId })

const failure = async (p: Promise<unknown>) => {
  const e = await p.catch((x: unknown) => x)
  expect(e).toBeInstanceOf(ApiError)
  return (e as ApiError).problem
}

const name = (id: string | null | undefined) => (id === 'evidence1' ? 'Efe Okonkwo' : (id ?? ''))

describe('retention adapters', () => {
  it('maps a schedule, its ETag and who placed the hold', () => {
    const item = toRetentionItem(
      {
        retention: {
          evidenceId: 'e1',
          caseId: null,
          retentionClass: 'unassigned',
          classLabel: 'Not yet in a closed case',
          placeholder: true,
          anchorAt: '2026-10-01T00:00:00Z',
          expiresAt: null,
          lockedUntil: '2026-10-31T00:00:00Z',
          dueAt: null,
          due: false,
          legalHold: true,
          legalHoldReason: 'Preserve for the inquiry',
          legalHoldBy: 'evidence1',
          legalHoldAt: '2026-10-02T00:00:00Z',
          disposalId: null,
          disposedAt: null,
          version: 3,
        },
        contentType: 'text/html',
        sizeBytes: 10,
        sha256: 'ab',
        role: null,
        sourceUrl: null,
        status: 'active',
        registeredAt: '2026-10-01T00:00:00Z',
      },
      name,
    )
    expect(item.schedule.etag).toBe('"v3"')
    expect(item.schedule.legalHoldBy).toBe('Efe Okonkwo')
    expect(item.schedule.expiresAt).toBeUndefined()
    expect(item.role).toBeUndefined()
  })

  it('maps a disposal, a certificate and an integrity run', () => {
    const dto: DisposalDto = {
      id: 'd1',
      status: 'completed',
      reason: 'End of retention',
      requestedBy: 'lead1',
      requestedAt: '2026-11-01T00:00:00Z',
      approvalId: 'a1',
      approvalType: 'RETENTION_EXTENSION',
      settledAt: null,
      completedAt: '2026-11-01T01:00:00Z',
      items: [
        {
          evidenceId: 'e1',
          sha256: 'ab',
          sizeBytes: 1,
          contentType: 'text/plain',
          caseId: null,
          retentionClass: 'short',
          dueAt: '2026-10-31T00:00:00Z',
          status: 'disposed',
          disposedAt: '2026-11-01T01:00:00Z',
          certificateId: 'c1',
        },
      ],
      version: 4,
    }
    const d = toDisposal(dto, name)
    expect([d.etag, d.items[0]!.certificateId, d.items[0]!.caseId]).toEqual([
      '"v4"',
      'c1',
      undefined,
    ])

    const c = toDisposalCertificate(
      {
        id: 'c1',
        disposalId: 'd1',
        approvalId: 'a1',
        issuedAt: '2026-11-01T01:00:00Z',
        issuedBy: 'evidence1',
        itemCount: 1,
        sha256: 'ff',
        previousSha256: null,
        verified: true,
        body: '{}',
      },
      name,
    )
    expect([c.issuedByName, c.previousSha256]).toEqual(['Efe Okonkwo', undefined])

    const run = toIntegrityRunDetail(
      {
        run: {
          id: 'r1',
          trigger: 'manual',
          startedBy: 'evidence1',
          startedAt: '2026-11-01T00:00:00Z',
          finishedAt: null,
          rate: 1,
          checked: 1,
          passed: 0,
          failed: 1,
          unreachable: 0,
        },
        checks: [
          {
            evidenceId: 'e1',
            checkedAt: '2026-11-01T00:00:00Z',
            outcome: 'timestamp_invalid',
            expectedSha256: 'ab',
            actualSha256: 'ab',
            timestampStatus: 'invalid',
            detail: null,
          },
        ],
      },
      name,
    )
    expect([run.run.startedBy, run.run.finishedAt, run.checks[0]!.detail]).toEqual([
      'Efe Okonkwo',
      undefined,
      undefined,
    ])
  })
})

describe('retention in the mock', () => {
  afterEach(() => as('analyst', 'anonymous'))

  it('is evidence.custody only', async () => {
    as('analyst')
    expect((await failure(mockApi.retention('due'))).code).toBe('capability_not_authorised')
  })

  it('proposes through the gate, destroys only after approval, and chains certificates', async () => {
    as('evidence_officer', 'u-officer')
    const due = (await mockApi.retention('due')).items
    expect(due.length).toBeGreaterThan(1)
    expect(due.every((i) => i.schedule.due && !i.schedule.legalHold)).toBe(true)
    const [first, second] = due

    // An evidence officer may not open governance's gate.
    expect(
      (
        await failure(
          mockApi.requestDisposal([first!.schedule.evidenceId], 'End of retention period'),
        )
      ).code,
    ).toBe('capability_not_authorised')

    as('centre_lead', 'u-lead')
    expect(
      (await failure(mockApi.requestDisposal([first!.schedule.evidenceId], 'too short'))).code,
    ).toBe('validation_failed')
    const held = (await mockApi.retention('held')).items[0]!
    expect(
      (
        await failure(
          mockApi.requestDisposal([held.schedule.evidenceId], 'End of retention period'),
        )
      ).code,
    ).toBe('legal_hold')

    const disposal = await mockApi.requestDisposal(
      [first!.schedule.evidenceId, second!.schedule.evidenceId],
      'End of retention period',
    )
    expect(disposal.status).toBe('awaiting_approval')
    expect((await failure(mockApi.executeDisposal(disposal.id, disposal.etag))).code).toBe(
      'disposal_not_approved',
    )

    // Evidence officer, then a Centre lead who is not the proposer.
    as('evidence_officer', 'u-officer')
    await mockApi.decideApproval(disposal.approvalId!, 'approve', '')
    // The mock tells approvers apart by name, and only the dev user has one of their own.
    as('centre_lead', DEV_USER_ID)
    await mockApi.decideApproval(disposal.approvalId!, 'approve', '')

    as('evidence_officer', 'u-officer')
    const approved = (await mockApi.disposals()).items.find((d) => d.id === disposal.id)!
    expect(approved.status).toBe('approved')
    // A hold placed after approval still wins.
    const target = (await mockApi.retention('all')).items.find(
      (i) => i.schedule.evidenceId === second!.schedule.evidenceId,
    )!
    await mockApi.placeLegalHold(
      target.schedule.evidenceId,
      'Preserve for the inquiry',
      target.schedule.etag,
    )

    const run = await mockApi.executeDisposal(approved.id, approved.etag)
    expect(run.disposed).toEqual([first!.schedule.evidenceId])
    expect(run.blocked.map((b) => b.code)).toEqual(['legal_hold'])
    expect(run.disposal.status).toBe('approved')

    const cert = await mockApi.disposalCertificate(run.certificateId!)
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cert.body)),
    )
    expect(cert.sha256).toBe(Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join(''))
  }, 20_000)

  it('keeps integrity runs', async () => {
    as('centre_lead', 'u-lead')
    const run = await mockApi.startIntegrityRun(1)
    expect(run.run.trigger).toBe('manual')
    expect(run.checks.every((c) => c.outcome === 'passed')).toBe(true)
    expect((await mockApi.integrityRuns()).items[0]!.id).toBe(run.run.id)
  })
})
