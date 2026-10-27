import { describe, expect, it } from 'vitest'
import {
  type ApprovalDto,
  type AuditEntryDto,
  type CaseDto,
  type EvidenceDto,
  type SourceViewDto,
  type StoryDto,
  type TriageItemDto,
  evidenceLabel,
  fromPriority,
  policyLabel,
  toAlert,
  toApproval,
  toAuditEvent,
  toCaseDetail,
  toCaseSummary,
  toPolicy,
  toSearchHit,
  toSourceRecord,
  toStoryGroups,
  toTriageItem,
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

  it("takes the group's channel from intake, reading anything unknown as information", () => {
    const security = { ...story('1', 'g', 'https://punchng.com/a', '2026-10-27T09:00:00Z') }
    const groups = toStoryGroups([
      { ...security, channel: 'security' },
      { ...story('2', 'h', 'https://punchng.com/b', '2026-10-27T08:00:00Z'), channel: 'sport' },
      story('3', 'i', 'https://punchng.com/c', '2026-10-27T07:00:00Z'),
    ])
    expect(groups.map((g) => g.channel)).toEqual(['security', 'information', 'information'])
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

describe('triage and evidence', () => {
  const link =
    'https://dailytrust.com/breaking-tinubu-asks-senate-to-approve-20-5bn-e1-04bn-foreign-loans/'
  const evidence = (
    id: string,
    role: string | null,
    contentType: string,
    stamped: boolean,
  ): EvidenceDto => ({
    id,
    caseId: null,
    role,
    timestampGenTime: stamped ? '2026-10-27T17:03:51Z' : null,
    sourceUrl: link,
    contentType,
    sizeBytes: 1,
    sha256: 'a'.repeat(64),
    status: 'active',
    registeredAt: '2026-10-27T17:03:51Z',
    registeredBy: 'service:evidence',
  })

  it('says what each original of a capture is', () => {
    expect(evidenceLabel({ role: 'warc', contentType: 'application/warc' })).toBe(
      'Web archive (WARC)',
    )
    expect(evidenceLabel({ role: 'html', contentType: 'text/html' })).toBe('Page HTML')
    expect(evidenceLabel({ role: 'screenshot', contentType: 'image/png' })).toBe(
      'Full-page screenshot',
    )
    expect(evidenceLabel({ role: null, contentType: 'application/pdf' })).toBe('PDF document')
    expect(evidenceLabel({ contentType: 'image/jpeg' })).toBe('Image')
  })

  // Shape as casework returned it in the live slice check (2026-10-27).
  const item: TriageItemDto = {
    id: '01a17e51-2d0c-74d0-bf46-e307b48d1d6a',
    storyId: '01a17e42-22ce-73bc-9582-811dca1787d9',
    url: link,
    title: null,
    status: 'pending',
    caseId: null,
    createdAt: '2026-10-27T17:03:31Z',
    promotedAt: null,
    promotedBy: null,
    evidenceIds: ['e1', 'e2'],
    evidenceCount: 2,
    version: 3,
  }

  it('takes the headline from intake and the originals from evidence', () => {
    const t = toTriageItem(
      item,
      { headline: 'Tinubu asks Senate to approve $20.5bn, €1.04bn foreign loans', summary: 'S' },
      [
        evidence('e1', 'warc', 'application/warc', true),
        evidence('e2', 'html', 'text/html', false),
      ],
      name,
    )
    expect(t).toMatchObject({
      headline: 'Tinubu asks Senate to approve $20.5bn, €1.04bn foreign loans',
      outlet: 'dailytrust.com',
      status: 'pending',
      etag: '"v3"',
    })
    expect(t.evidence.map((e) => [e.label, e.timestamped])).toEqual([
      ['Web archive (WARC)', true],
      ['Page HTML', false],
    ])
  })

  it('still lists an item when intake cannot say what the story was', () => {
    expect(toTriageItem(item, null, [], name).headline).toBe('dailytrust.com')
  })

  it("speaks casework's word for a normal priority", () => {
    expect(fromPriority('medium')).toBe('normal')
    expect(fromPriority('high')).toBe('high')
  })
})

describe('search', () => {
  it('keeps the highlighted passage and shows the outlet as the source', () => {
    const hit = toSearchHit({
      type: 'story',
      id: 's1',
      caseId: null,
      title: 'Kidnappers attack Kaduna estate, abduct 6 residents',
      at: '2026-10-27T17:00:00Z',
      score: 7.1,
      snippet: 'Gunmen stormed a residential estate and <mark>abducted</mark> six residents',
      source: 'dailytrust.com',
    })
    expect(hit).toMatchObject({
      kind: 'news',
      source: 'dailytrust.com',
      summary: 'Gunmen stormed a residential estate and abducted six residents',
      highlight: 'Gunmen stormed a residential estate and <mark>abducted</mark> six residents',
    })
  })

  it('reads a hit from before full-text indexing', () => {
    const hit = toSearchHit({
      type: 'case',
      id: 'c1',
      caseId: null,
      title: 'CASE-1',
      at: '2026-10-27T17:00:00Z',
      score: 1,
    })
    expect([hit.summary, hit.highlight, hit.source]).toEqual(['', undefined, 'case'])
  })
})

describe('sources', () => {
  // Shape as intake returned it for Daily Trust in the live check (2026-10-27).
  const dto: SourceViewDto = {
    id: '01a17d80-b29a-7c95-bc97-8636ecf450e8',
    name: 'Daily Trust',
    kind: 'site',
    url: 'https://www.dailytrust.com',
    reliability: 'B',
    status: 'approved',
    proposedBy: 'u-ada',
    proposedAt: '2026-10-27T10:00:00Z',
    approvedBy: 'u-rex',
    approvedAt: '2026-10-27T10:05:00Z',
    suspendedReason: null,
    suspendedAt: null,
    version: 4,
  }

  it('names the people and keeps the version for If-Match', () => {
    expect(toSourceRecord(dto, name)).toMatchObject({
      host: 'dailytrust.com',
      reliability: 'B',
      status: 'approved',
      proposedBy: { id: 'u-ada', name: 'Ada Analyst' },
      approvedBy: { id: 'u-rex', name: 'Rex Reviewer' },
      etag: '"v4"',
    })
  })

  it('never shows a source it cannot read as collecting', () => {
    const odd = toSourceRecord(
      { ...dto, status: 'archived', kind: 'podcast', reliability: 'Z' },
      name,
    )
    expect([odd.status, odd.kind, odd.reliability]).toEqual(['proposed', 'site', null])
  })
})
