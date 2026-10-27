import { describe, expect, it } from 'vitest'
import {
  type ApprovalDto,
  type AuditEntryDto,
  type CaseDto,
  type StoryDto,
  policyLabel,
  toAlert,
  toApproval,
  toAuditEvent,
  toCaseDetail,
  toCaseSummary,
  toPolicy,
  toStoryGroups,
  toWallState,
} from '@/api/adapters'

const people: Record<string, string> = { 'u-ada': 'Ada Analyst', 'u-rex': 'Rex Reviewer' }
const name = (id: string | null | undefined) => (id ? (people[id] ?? id) : '—')

// Shapes as casework returned them in the live check (2026-10-27).
const caseDto: CaseDto = {
  id: '01a17d5a-4771-78aa-aa6a-43324d50c676',
  reference: 'CASE-2026-50C676',
  title: 'Kaduna market fire — second check',
  state: 'in_assessment',
  allowedTransitions: ['submitted'],
  ownerId: 'u-ada',
  priority: 'critical',
  deadline: '2026-10-28T12:00:00Z',
  triageItemId: 't-1',
  createdBy: 'u-ada',
  createdAt: '2026-10-27T12:10:00Z',
  updatedAt: '2026-10-27T12:12:00Z',
  closedAt: null,
  checklistComplete: false,
  checklist: [
    {
      key: 'sources_checked',
      label: 'Sources checked',
      done: true,
      doneBy: 'u-ada',
      doneAt: '2026-10-27T12:11:00Z',
    },
    {
      key: 'limitations_noted',
      label: 'Limitations noted',
      done: false,
      doneBy: null,
      doneAt: null,
    },
  ],
  items: [{ evidenceId: 'e-1', attachedAt: '2026-10-27T12:11:30Z' }],
  version: 5,
}

describe('cases', () => {
  it('maps the casework DTO to the summary the screens read', () => {
    const c = toCaseSummary(caseDto, name)
    expect(c.ref).toBe('CASE-2026-50C676')
    expect(c.owner).toEqual({ id: 'u-ada', name: 'Ada Analyst' })
    expect(c.priority).toBe('high')
    expect(c.state).toBe('in_assessment')
    expect(c.evidenceCount).toBe(1)
  })

  it('names an unowned case rather than crashing on it', () => {
    expect(toCaseSummary({ ...caseDto, ownerId: null }, name).owner.name).toBe('Unassigned')
  })

  it('keeps the server ETag for If-Match and builds a newest-first timeline', () => {
    const d = toCaseDetail(caseDto, [], name, '"v5"')
    expect(d.etag).toBe('"v5"')
    expect(d.checklist).toEqual([
      { label: 'Sources checked', done: true },
      { label: 'Limitations noted', done: false },
    ])
    expect(d.timeline[0]!.at >= d.timeline[d.timeline.length - 1]!.at).toBe(true)
  })
})

const gate: ApprovalDto = {
  id: 'a-1',
  type: 'PI_SEARCH',
  subjectType: 'name_search',
  subjectId: 'ns-1',
  caseId: null,
  requestedBy: 'u-ada',
  reason: 'Threat to life',
  requestedAt: '2026-10-27T09:00:00Z',
  status: 'pending',
  currentStep: 2,
  totalSteps: 2,
  awaitingRoles: ['evidence_officer'],
  completedAt: null,
  expiresAt: null,
  windowStart: null,
  windowEnd: null,
  decisions: [
    {
      step: 1,
      decidedBy: 'u-lead',
      role: 'centre_lead',
      decision: 'approve',
      comment: null,
      decidedAt: '2026-10-27T09:05:00Z',
    },
  ],
  version: 1,
}

describe('approvals', () => {
  it('turns decisions and the waiting role into steps', () => {
    const a = toApproval(gate, name)
    expect(a.requesterName).toBe('Ada Analyst')
    expect(a.steps).toEqual([
      {
        role: 'centre_lead',
        decidedBy: 'u-lead',
        decision: 'approve',
        decidedAt: '2026-10-27T09:05:00Z',
      },
      { role: 'evidence_officer' },
    ])
  })

  it("speaks the web's word for a rejection", () => {
    const a = toApproval(
      { ...gate, status: 'rejected', decisions: [{ ...gate.decisions[0]!, decision: 'reject' }] },
      name,
    )
    expect(a.status).toBe('refused')
    expect(a.steps[0]!.decision).toBe('refuse')
  })
})

describe('policies and audit', () => {
  it('labels keys for people', () => {
    expect(policyLabel('pi_search')).toBe('PI search')
    expect(policyLabel('external_ai.reverse_search')).toBe('External AI · reverse search')
  })

  it('shows a policy whose signature fails as off', () => {
    const p = toPolicy(
      {
        key: 'cctv_search',
        enabled: true,
        version: 2,
        description: 'CCTV',
        authorityRef: 'D-7',
        changedBy: 'u-ada',
        changedAt: '2026-10-27T12:00:00Z',
        signatureValid: false,
      },
      name,
    )
    expect(p.value).toBe(false)
    expect(p.description).toContain('signature does not verify')
  })

  it('credits the person a service acted for', () => {
    const e: AuditEntryDto = {
      sequence: 9,
      auditId: 'x',
      service: 'governance',
      action: 'approval.request',
      objectType: 'approval',
      objectId: 'a-1',
      actor: 'service-account',
      onBehalfOf: 'u-ada',
      activeRole: 'analyst',
      caseId: null,
      outcome: 'refused',
      reasonCode: 'capability_not_authorised',
      occurredAt: '2026-10-27T12:00:00Z',
      rowHash: 'h',
    }
    expect(toAuditEvent(e, name)).toMatchObject({
      actor: 'Ada Analyst',
      role: 'analyst',
      outcome: 'refused',
      purpose: 'capability_not_authorised',
    })
  })
})

describe('feed, alerts and the wall', () => {
  const story = (id: string, group: string, url: string, at: string): StoryDto => ({
    id,
    sourceId: 's',
    storyGroupId: group,
    url,
    canonicalUrl: url,
    headline: `H ${id}`,
    summary: null,
    publishedAt: at,
    fetchedAt: at,
    triageItemId: null,
    sentToTriageAt: null,
  })

  it('groups stories and counts independent outlets', () => {
    const groups = toStoryGroups([
      story('1', 'g', 'https://www.punchng.com/a', '2026-10-27T09:00:00Z'),
      story('2', 'g', 'https://dailytrust.com/b', '2026-10-27T10:00:00Z'),
      story('3', 'h', 'https://punchng.com/c', '2026-10-27T08:00:00Z'),
    ])
    expect(groups.map((g) => g.id)).toEqual(['g', 'h'])
    expect(groups[0]).toMatchObject({
      headline: 'H 1',
      independentOutlets: 2,
      firstSeen: '2026-10-27T09:00:00Z',
    })
  })

  it('shows an unacknowledged escalated alert as escalated', () => {
    const a = toAlert(
      {
        id: 'al',
        ruleId: 'r',
        severity: 'normal',
        title: 'Integrity failed',
        caseId: null,
        sourceEventType: 'IntegrityFailed',
        status: 'open',
        raisedAt: 'x',
        level: 1,
        lastEscalatedAt: null,
        acknowledgedBy: null,
      },
      name,
    )
    expect(a).toMatchObject({ status: 'escalated', severity: 'medium', escalationLevel: 1 })
  })

  it('maps the reporting wall onto the planner state', () => {
    const w = toWallState(
      {
        version: 7,
        preset: 'standing',
        rows: 4,
        cols: 4,
        visitorMode: false,
        updatedBy: 'u-rex',
        updatedAt: 'x',
        screens: Array.from({ length: 16 }, (_, index) => ({ index, content: 'news' as const })),
        groups: [],
      },
      name,
    )
    expect(w).toMatchObject({ revision: 7, controller: 'simulated', updatedBy: 'Rex Reviewer' })
    expect(w.screens).toHaveLength(16)
  })
})
