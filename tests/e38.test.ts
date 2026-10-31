import { describe, expect, it } from 'vitest'
import {
  fromLessonInput,
  toBrief,
  toLesson,
  toOutcomes,
  toRecipient,
  type LessonDto,
  type OutcomesDto,
  type ProductDto,
} from '@/api/adapters'
import { duration } from '@/features/outcomes/OutcomesPage'

const people: Record<string, string> = { 'u-ada': 'Ada Analyst', 'u-rex': 'Rex Reviewer' }
const name = (id: string | null | undefined) => (id ? (people[id] ?? id) : '—')

// As reporting returns a brief with a correction open (ADR 0017).
const correcting: ProductDto = {
  id: 'p-1',
  caseId: 'c-1',
  title: 'Flooding rumour, Riverside',
  authorId: 'u-ada',
  status: 'correcting',
  currentVersion: 2,
  sentences: [{ order: 1, text: 'The rumour of 25 Oct is false.', supportRefs: ['finding:f-1'] }],
  unsupportedSentences: [],
  versions: [
    {
      number: 1,
      createdBy: 'u-ada',
      createdAt: '2026-10-31T09:00:00Z',
      releasedBy: 'u-rex',
      releasedAt: '2026-10-31T10:00:00Z',
      sha256: 'a'.repeat(64),
      hasPdf: true,
      correctsVersion: null,
      correctionReason: null,
      supersededBy: null,
      supersededAt: null,
    },
    {
      number: 2,
      createdBy: 'u-ada',
      createdAt: '2026-10-31T11:00:00Z',
      releasedBy: null,
      releasedAt: null,
      sha256: null,
      hasPdf: false,
      correctsVersion: 1,
      correctionReason: 'Wrong date.',
      supersededBy: null,
      supersededAt: null,
    },
  ],
  createdAt: '2026-10-31T09:00:00Z',
  updatedAt: '2026-10-31T11:00:00Z',
  version: 3,
}

describe('corrections, lessons and outcomes (E38)', () => {
  it('keeps a brief being corrected apart from a draft, with its versions and reason', () => {
    const b = toBrief(correcting, name)
    expect(b.status).toBe('correcting')
    expect(b.versions[1]).toMatchObject({
      correctsVersion: 1,
      correctionReason: 'Wrong date.',
      createdById: 'u-ada',
      createdBy: 'Ada Analyst',
    })
    expect(b.versions[0]?.supersededBy).toBeUndefined()
    expect(toBrief({ ...correcting, status: 'something-new' }, name).status).toBe('draft')
  })

  it('names who holds a brief', () => {
    expect(
      toRecipient(
        { recipientId: 'u-rex', source: 'releaser', firstVersion: 1, recordedAt: 'x' },
        name,
      ),
    ).toMatchObject({ id: 'u-rex', name: 'Rex Reviewer', source: 'releaser' })
  })

  it('maps a lesson and leaves a blank template to casework', () => {
    const dto: LessonDto = {
      id: 'l-1',
      caseId: 'c-1',
      caseReference: 'CASE-2026-0E38',
      title: 'Ask the LGA first',
      observation: 'The denial came late.',
      recommendation: 'Call the LGA on day one.',
      templateKey: 'default',
      appliedTemplateVersion: 2,
      appliedBy: 'u-rex',
      appliedAt: '2026-10-31T12:00:00Z',
      recordedBy: 'u-ada',
      recordedAt: '2026-10-31T11:00:00Z',
      updatedBy: 'u-rex',
      updatedAt: '2026-10-31T12:00:00Z',
      version: 1,
    }
    expect(toLesson(dto, name)).toMatchObject({
      caseRef: 'CASE-2026-0E38',
      appliedVersion: 2,
      appliedBy: 'Rex Reviewer',
      recordedBy: 'Ada Analyst',
      etag: '"v1"',
    })
    expect(
      fromLessonInput({ title: ' t ', observation: 'o', recommendation: 'r', templateKey: ' ' }),
    ).toEqual({ title: 't', observation: 'o', recommendation: 'r', templateKey: null })
  })

  it('maps the dashboard, leaving unmeasured times unset', () => {
    const dto: OutcomesDto = {
      period: '7d',
      from: '2026-10-25T00:00:00Z',
      to: '2026-11-01T00:00:00Z',
      briefsReleased: 4,
      corrections: 1,
      correctionRate: 0.25,
      medianTimeToReleaseSeconds: 7200,
      medianTimeToCorrectSeconds: null,
      casesClosed: 3,
      lessonsRecorded: 2,
      alertsRaised: 10,
      alertsAcknowledged: 9,
      medianTimeToAcknowledgeSeconds: 240,
      feedbackRecorded: null,
      daily: [],
    }
    const o = toOutcomes(dto)
    expect(o).toMatchObject({ period: '7d', correctionRate: 0.25, medianTimeToRelease: 7200 })
    expect(o.medianTimeToCorrect).toBeUndefined()
    expect(o.feedbackRecorded).toBeUndefined()
  })

  it('says durations as people do', () => {
    expect(duration(undefined)).toBe('—')
    expect(duration(45)).toBe('45 s')
    expect(duration(240)).toBe('4 min')
    expect(duration(12_000)).toBe('3 h 20 min')
    expect(duration(7200)).toBe('2 h')
    expect(duration(3 * 86_400 + 4 * 3600)).toBe('3 d 4 h')
  })
})
