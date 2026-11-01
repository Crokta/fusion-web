import type { CaseState, CaseSummary } from '@/api/types'

/** The states a case is worked in, in the order the desk shows them. */
export const WORKED_STATES: CaseState[] = [
  'open',
  'in_assessment',
  'returned',
  'submitted',
  'approved',
]

export interface Workload {
  owner: { id: string; name: string }
  byState: Partial<Record<CaseState, number>>
  total: number
  overdue: number
  /** Due within the next 24 hours and not yet overdue. */
  dueSoon: number
}

const DAY = 86_400_000

/**
 * The team's workload for the supervisor desk (E34): each owner's active cases by state, how
 * many are overdue and how many fall due within a day. Busiest first; a case with no deadline
 * is never counted as late.
 */
export function workload(cases: CaseSummary[], now = Date.now()): Workload[] {
  const rows = new Map<string, Workload>()
  for (const c of cases) {
    if (c.state === 'released' || c.state === 'closed' || c.state === 'triage') continue
    const row = rows.get(c.owner.id) ?? {
      owner: c.owner,
      byState: {},
      total: 0,
      overdue: 0,
      dueSoon: 0,
    }
    row.byState[c.state] = (row.byState[c.state] ?? 0) + 1
    row.total++
    const due = c.deadline ? new Date(c.deadline).getTime() : NaN
    if (!Number.isNaN(due)) {
      if (due < now) row.overdue++
      else if (due - now < DAY) row.dueSoon++
    }
    rows.set(c.owner.id, row)
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.total - a.total || b.overdue - a.overdue || a.owner.name.localeCompare(b.owner.name),
  )
}

/** Active cases past their deadline or due within a day, soonest first. */
export function atRisk(cases: CaseSummary[], now = Date.now()): CaseSummary[] {
  return cases
    .filter((c) => !['released', 'closed', 'triage'].includes(c.state) && c.deadline)
    .filter((c) => new Date(c.deadline).getTime() - now < DAY)
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
}
