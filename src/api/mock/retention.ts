import type { FusionApi } from '../contract'
import type { ProblemCode } from '../problem'
import type {
  Approval,
  Disposal,
  DisposalCertificate,
  DisposalExecution,
  IntegrityCheck,
  IntegrityRunDetail,
  RetentionClass,
  RetentionItem,
  Role,
} from '../types'
import { toHex } from '@/lib/sha256'
import { ago } from './fixtures'

/**
 * Retention, legal holds, disposal with certificate and integrity runs for the mock gateway
 * (E39, ADR 0021), with evidence's rules: everything is evidence.custody (evidence officer,
 * centre lead); proposing a disposal also opens governance's gate, which only a centre lead of the
 * two may do; nothing is destroyed until the gate (Evidence officer, then Centre lead) approves,
 * and then only what is due, unheld and past its lock. Each destruction gets a hashed
 * certificate chained to the one before.
 */
interface Deps {
  delay: <T>(value: () => T) => Promise<T>
  refuse: (code: ProblemCode, title: string, status?: number) => never
  requireRole: (roles: Role[], action: string) => void
  audit: (outcome: 'allowed' | 'refused', action: string, target: string) => void
  me: () => { id: string; name: string }
  role: () => Role
  approvals: () => Approval[]
}

type RetentionApi = Pick<
  FusionApi,
  | 'retentionClasses'
  | 'retention'
  | 'placeLegalHold'
  | 'releaseLegalHold'
  | 'disposals'
  | 'requestDisposal'
  | 'executeDisposal'
  | 'disposalCertificates'
  | 'disposalCertificate'
  | 'integrityRuns'
  | 'integrityRun'
  | 'startIntegrityRun'
>

const CUSTODY: Role[] = ['evidence_officer', 'centre_lead']
const DAY = 86_400_000
const bump = (etag: string) => `"v${Number(etag.replace(/\D/g, '')) + 1}"`
const later = (a?: string, b?: string) => (!a ? undefined : !b || a > b ? a : b)
const hex = (seed: number) =>
  Array.from({ length: 64 }, (_, i) => ((seed * 7 + i * 13) % 16).toString(16)).join('')

const CLASSES: RetentionClass[] = [
  { name: 'short', label: 'Short-term', days: 90, placeholder: true },
  { name: 'standard', label: 'Closed case', days: 2555, placeholder: true },
  { name: 'unassigned', label: 'Not yet in a closed case', days: 365, placeholder: true },
]

function item(
  n: number,
  retentionClass: string,
  registeredDaysAgo: number,
  over?: Partial<RetentionItem['schedule']>,
): RetentionItem {
  const cls = CLASSES.find((c) => c.name === retentionClass)!
  const anchorAt = ago(registeredDaysAgo * 1440)
  const expiresAt =
    cls.days === null ? undefined : new Date(Date.parse(anchorAt) + cls.days * DAY).toISOString()
  const lockedUntil = new Date(Date.parse(anchorAt) + 30 * DAY).toISOString()
  return {
    schedule: {
      evidenceId: `ev-r${n}`,
      caseId: n % 2 === 0 ? 'case-1' : undefined,
      retentionClass,
      classLabel: cls.label,
      placeholder: cls.placeholder,
      anchorAt,
      expiresAt,
      lockedUntil,
      dueAt: later(expiresAt, lockedUntil),
      due: false,
      legalHold: false,
      etag: '"v1"',
      ...over,
    },
    contentType: n % 3 === 0 ? 'image/jpeg' : 'text/html; charset=utf-8',
    sizeBytes: 40_000 + n * 1_337,
    sha256: hex(n),
    role: n % 3 === 0 ? 'image' : 'page',
    sourceUrl: `https://news.example.org/story-${n}`,
    status: 'active',
    registeredAt: anchorAt,
  }
}

export function retentionMocks({ delay, refuse, requireRole, audit, me, role, approvals }: Deps) {
  const items: RetentionItem[] = [
    item(1, 'short', 120),
    item(2, 'short', 100),
    item(3, 'unassigned', 400),
    item(4, 'short', 95, {
      legalHold: true,
      legalHoldReason: 'Preserve for the coroner’s inquest',
      legalHoldBy: 'Efe Okonkwo',
      legalHoldAt: ago(3 * 1440),
    }),
    item(5, 'short', 80),
    item(6, 'standard', 200),
  ]
  const disposals: Disposal[] = []
  const certificates: DisposalCertificate[] = []
  const runs: IntegrityRunDetail[] = [
    {
      run: {
        id: 'run-1',
        trigger: 'scheduled',
        startedBy: 'service:evidence',
        startedAt: ago(9 * 60),
        finishedAt: ago(9 * 60 - 1),
        rate: 0.02,
        checked: 3,
        passed: 3,
        failed: 0,
        unreachable: 0,
      },
      checks: [1, 2, 6].map((n) => ({
        evidenceId: `ev-r${n}`,
        checkedAt: ago(9 * 60),
        outcome: 'passed',
        expectedSha256: hex(n),
        actualSha256: hex(n),
        timestampStatus: 'valid',
      })),
    },
  ]

  /** Due, as evidence works it out: past expiry and lock, not held, not disposed. */
  const refresh = () => {
    const now = new Date().toISOString()
    for (const i of items)
      i.schedule.due =
        !i.schedule.legalHold &&
        !i.schedule.disposedAt &&
        !!i.schedule.dueAt &&
        i.schedule.dueAt <= now
  }

  const custody = (action: string) => requireRole(CUSTODY, action)

  const find = (evidenceId: string, etag?: string) => {
    const i = items.find((x) => x.schedule.evidenceId === evidenceId)
    if (!i) return refuse('not_found', 'No such evidence.', 404)
    if (etag && i.schedule.etag !== etag)
      refuse('precondition_failed', 'Someone changed this original first.', 412)
    return i
  }

  const disposalAt = (id: string) => {
    const d = disposals.find((x) => x.id === id)
    if (!d) return refuse('not_found', 'No such disposal.', 404)
    return d
  }

  /** governance's ApprovalCompleted / a refusal, as the mock's decideApproval settles it. */
  const settle = (approvalId: string, status: Approval['status']) => {
    const d = disposals.find((x) => x.approvalId === approvalId)
    if (!d || d.status !== 'awaiting_approval' || status === 'pending') return
    d.status = status === 'approved' ? 'approved' : status === 'expired' ? 'expired' : 'rejected'
    d.settledAt = new Date().toISOString()
    d.etag = bump(d.etag)
    if (d.status !== 'approved')
      for (const di of d.items) {
        const i = items.find((x) => x.schedule.evidenceId === di.evidenceId)
        if (i && i.schedule.disposalId === d.id) i.schedule.disposalId = undefined
      }
  }

  const api: RetentionApi = {
    retentionClasses: () =>
      delay(() => {
        custody('Reading retention')
        return CLASSES
      }),
    retention: (view) =>
      delay(() => {
        custody('Reading retention')
        refresh()
        const now = Date.now()
        const live = items.filter((i) => !i.schedule.disposedAt)
        const list =
          view === 'due'
            ? live.filter((i) => i.schedule.due)
            : view === 'upcoming'
              ? live.filter(
                  (i) =>
                    !i.schedule.legalHold &&
                    !i.schedule.due &&
                    !!i.schedule.dueAt &&
                    Date.parse(i.schedule.dueAt) <= now + 14 * DAY,
                )
              : view === 'held'
                ? live.filter((i) => i.schedule.legalHold)
                : live
        return { items: list, nextCursor: null }
      }),
    placeLegalHold: (evidenceId, reason, etag) =>
      delay(() => {
        custody('Placing a legal hold')
        const i = find(evidenceId, etag)
        if (i.schedule.legalHold)
          refuse('conflict', 'This original is already under a legal hold.', 409)
        Object.assign(i.schedule, {
          legalHold: true,
          legalHoldReason: reason,
          legalHoldBy: me().name,
          legalHoldAt: new Date().toISOString(),
          etag: bump(i.schedule.etag),
        })
        refresh()
        audit('allowed', 'evidence.legal_hold.place', evidenceId)
        return i.schedule
      }),
    releaseLegalHold: (evidenceId, _reason, etag) =>
      delay(() => {
        custody('Releasing a legal hold')
        const i = find(evidenceId, etag)
        if (!i.schedule.legalHold)
          refuse('conflict', 'This original is not under a legal hold.', 409)
        Object.assign(i.schedule, {
          legalHold: false,
          legalHoldReason: undefined,
          legalHoldBy: undefined,
          legalHoldAt: undefined,
          etag: bump(i.schedule.etag),
        })
        refresh()
        audit('allowed', 'evidence.legal_hold.release', evidenceId)
        return i.schedule
      }),
    disposals: (p) =>
      delay(() => {
        custody('Reading disposals')
        const list = disposals
          .filter((d) => !p?.status || d.status === p.status)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        return { items: list, nextCursor: null }
      }),
    requestDisposal: (evidenceIds, reason) =>
      delay(() => {
        custody('Proposing a disposal')
        refresh()
        if (reason.trim().length < 10)
          refuse('validation_failed', 'Say why, in at least 10 characters.', 400)
        const chosen = evidenceIds.map((id) => find(id))
        for (const i of chosen) {
          if (i.schedule.legalHold)
            refuse('legal_hold', `${i.schedule.evidenceId}: under a legal hold`, 409)
          if (i.schedule.disposalId)
            refuse('disposal_open', `${i.schedule.evidenceId}: already in another disposal`, 409)
          if (!i.schedule.due) refuse('not_due', `${i.schedule.evidenceId}: not due yet`, 409)
        }
        // governance: approval.request is analyst, supervisor, centre lead.
        if (role() !== 'centre_lead')
          refuse(
            'capability_not_authorised',
            'Opening a gate needs a person whose active role may request it.',
          )
        const id = `disp-${crypto.randomUUID().slice(0, 8)}`
        const approvalId = `ap-${crypto.randomUUID().slice(0, 6)}`
        const now = new Date().toISOString()
        approvals().unshift({
          id: approvalId,
          type: 'RETENTION_EXTENSION',
          subject: `evidence disposal ${id.slice(-6).toUpperCase()}`,
          justification: `Dispose of ${chosen.length} original(s) past retention: ${reason}`,
          requesterId: me().id,
          requesterName: me().name,
          requestedAt: now,
          status: 'pending',
          steps: [{ role: 'evidence_officer' }, { role: 'centre_lead' }],
          scope: `evidence_disposal ${id.slice(-6).toUpperCase()}`,
          subjectType: 'evidence_disposal',
          subjectId: id,
        })
        const d: Disposal = {
          id,
          status: 'awaiting_approval',
          reason: reason.trim(),
          requesterId: me().id,
          requesterName: me().name,
          requestedAt: now,
          approvalId,
          approvalType: 'RETENTION_EXTENSION',
          items: chosen.map((i) => ({
            evidenceId: i.schedule.evidenceId,
            sha256: i.sha256,
            sizeBytes: i.sizeBytes,
            contentType: i.contentType,
            caseId: i.schedule.caseId,
            retentionClass: i.schedule.retentionClass,
            dueAt: i.schedule.dueAt!,
            status: 'pending',
          })),
          etag: '"v1"',
        }
        for (const i of chosen) i.schedule.disposalId = id
        disposals.push(d)
        audit('allowed', 'evidence.disposal.request', id)
        return d
      }),
    executeDisposal: async (id, etag) => {
      const d = disposals.find((x) => x.id === id)
      const now = new Date().toISOString()
      const destroyed = d?.items.filter((di) => {
        const i = items.find((x) => x.schedule.evidenceId === di.evidenceId)
        return (
          di.status === 'pending' && i && !i.schedule.legalHold && i.schedule.lockedUntil <= now
        )
      })
      const previous = certificates.at(-1)?.sha256
      const certificateId = `cert-${crypto.randomUUID().slice(0, 8)}`
      const body = JSON.stringify({
        kind: 'fusion.evidence.disposal-certificate.v1',
        certificateId,
        disposalId: id,
        approvalId: d?.approvalId,
        destroyedBy: me().id,
        destroyedAt: now,
        previousCertificateSha256: previous ?? null,
        items: (destroyed ?? []).map((di) => ({ evidenceId: di.evidenceId, sha256: di.sha256 })),
      })
      const sha256 = toHex(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))),
      )
      return delay((): DisposalExecution => {
        custody('Destroying originals')
        const disposal = disposalAt(id)
        if (disposal.etag !== etag)
          refuse('precondition_failed', 'Someone changed this disposal first.', 412)
        if (disposal.status !== 'approved')
          refuse(
            'disposal_not_approved',
            disposal.status === 'awaiting_approval'
              ? 'This disposal is still waiting for approval.'
              : `This disposal is ${disposal.status}; nothing in it can be destroyed.`,
            409,
          )
        const blocked = disposal.items
          .filter((di) => di.status === 'pending' && !destroyed!.includes(di))
          .map((di) => {
            const i = items.find((x) => x.schedule.evidenceId === di.evidenceId)
            return i?.schedule.legalHold
              ? { evidenceId: di.evidenceId, code: 'legal_hold', message: 'Under a legal hold.' }
              : {
                  evidenceId: di.evidenceId,
                  code: 'object_locked',
                  message: `The store's compliance lock runs until ${i?.schedule.lockedUntil}.`,
                }
          })
        if (destroyed!.length === 0)
          refuse(blocked[0]?.code ?? 'already_disposed', 'Nothing could be destroyed.', 409)
        certificates.push({
          id: certificateId,
          disposalId: id,
          approvalId: disposal.approvalId!,
          issuedAt: now,
          issuedById: me().id,
          issuedByName: me().name,
          itemCount: destroyed!.length,
          sha256,
          previousSha256: previous,
          verified: true,
          body,
        })
        for (const di of destroyed!) {
          Object.assign(di, { status: 'disposed', disposedAt: now, certificateId })
          const i = items.find((x) => x.schedule.evidenceId === di.evidenceId)!
          i.schedule.disposedAt = now
          i.status = 'disposed'
          audit('allowed', 'evidence.dispose', di.evidenceId)
        }
        if (disposal.items.every((di) => di.status === 'disposed')) {
          disposal.status = 'completed'
          disposal.completedAt = now
        }
        disposal.etag = bump(disposal.etag)
        audit('allowed', 'evidence.disposal.execute', id)
        return { disposal, certificateId, disposed: destroyed!.map((di) => di.evidenceId), blocked }
      })
    },
    disposalCertificates: () =>
      delay(() => {
        custody('Reading disposal certificates')
        return { items: [...certificates].reverse(), nextCursor: null }
      }),
    disposalCertificate: (id) =>
      delay(() => {
        custody('Reading a disposal certificate')
        const c = certificates.find((x) => x.id === id)
        if (!c) return refuse('not_found', 'No such certificate.', 404)
        return c
      }),
    integrityRuns: () =>
      delay(() => {
        custody('Reading integrity runs')
        return { items: runs.map((r) => r.run), nextCursor: null }
      }),
    integrityRun: (id) =>
      delay(() => {
        custody('Reading an integrity run')
        const r = runs.find((x) => x.run.id === id)
        if (!r) return refuse('not_found', 'No such integrity run.', 404)
        return r
      }),
    startIntegrityRun: (rate) =>
      delay(() => {
        custody('Starting an integrity run')
        const now = new Date().toISOString()
        const active = items.filter((i) => i.status === 'active')
        const checks: IntegrityCheck[] = active.map((i) => ({
          evidenceId: i.schedule.evidenceId,
          checkedAt: now,
          outcome: 'passed',
          expectedSha256: i.sha256,
          actualSha256: i.sha256,
          timestampStatus: 'valid',
        }))
        const detail: IntegrityRunDetail = {
          run: {
            id: `run-${crypto.randomUUID().slice(0, 6)}`,
            trigger: 'manual',
            startedBy: me().name,
            startedAt: now,
            finishedAt: now,
            rate: rate ?? 0.02,
            checked: checks.length,
            passed: checks.length,
            failed: 0,
            unreachable: 0,
          },
          checks,
        }
        runs.unshift(detail)
        audit('allowed', 'evidence.integrity.run', detail.run.id)
        return detail
      }),
  }

  return { api, settle }
}
