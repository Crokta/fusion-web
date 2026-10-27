import { useNavigate } from '@tanstack/react-router'
import { FileStack, FolderKanban, Radio, Search, Timer } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { useCases } from '@/api/queries'
import type { CaseState, CaseSummary } from '@/api/types'
import {
  Avatar,
  CaseStateBadge,
  EmptyState,
  ErrorNotice,
  MarkingTag,
  PageHeader,
  PriorityBadge,
  Segmented,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { countdown, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useShell } from '@/features/shell/ShellContext'

type Filter = 'active' | CaseState | 'all'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'triage', label: 'Triage' },
  { value: 'in_assessment', label: 'In assessment' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'returned', label: 'Returned' },
  { value: 'released', label: 'Released' },
  { value: 'all', label: 'All' },
]

const GRID =
  'grid grid-cols-[88px_minmax(0,1fr)_128px_74px_150px_96px_76px_128px] items-center gap-x-4 max-xl:grid-cols-[84px_minmax(0,1fr)_120px_70px_92px_76px]'

export function SlaChip({
  deadline,
  now,
  closed,
}: {
  deadline: string
  now: number
  closed?: boolean
}) {
  if (closed) return <span className="text-[11.5px] text-ink-faint">—</span>
  const c = countdown(deadline, now)
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-1 text-[12px] font-medium',
        c.overdue ? 'text-red' : c.soon ? 'text-amber' : 'text-ink-2',
      )}
      title={`Deadline ${new Date(deadline).toLocaleString('en-GB')}`}
    >
      <Timer size={12} className="opacity-70" aria-hidden />
      {c.label}
    </span>
  )
}

export function CasesPage() {
  const [filter, setFilter] = useState<Filter>('active')
  const [q, setQ] = useState('')
  const deferred = useDeferredValue(q.trim())
  const cases = useCases(filter === 'all' ? undefined : filter, deferred || undefined)
  const navigate = useNavigate()
  const { select } = useShell()
  const now = useNow()

  const open = (c: CaseSummary) => {
    select({
      kind: 'case',
      title: c.title,
      caseRef: c.ref,
      priority: c.priority,
      place: c.place,
      state: c.state.replace('_', ' '),
      source: c.category,
      raisedAt: c.updatedAt,
    })
    void navigate({ to: '/cases/$caseId', params: { caseId: c.id } })
  }

  const items = cases.data?.items ?? []

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Operations · Casework"
        title="Cases"
        description="From triage to release. Owner, priority and deadline are required to leave triage; findings are only ever set by an analyst."
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented label="Filter by state" value={filter} onChange={setFilter} options={FILTERS} />
        <label className="relative ml-auto w-full max-w-[300px]">
          <span className="sr-only">Filter cases</span>
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by ref, title or place"
            className={cn(inputClass, 'pl-8')}
          />
        </label>
      </div>

      <section className="surface overflow-hidden rounded-lg">
        <div
          className={cn(GRID, 'eyebrow border-b border-line bg-canvas/60 px-4 py-2.5 text-[9.5px]')}
          role="presentation"
        >
          <span>Ref</span>
          <span>Case</span>
          <span>State</span>
          <span>Priority</span>
          <span className="max-xl:hidden">Owner</span>
          <span>SLA</span>
          <span className="max-xl:hidden">Load</span>
          <span>Marking</span>
        </div>

        {cases.isPending ? (
          <SkeletonRows rows={7} />
        ) : cases.isError ? (
          <ErrorNotice error={cases.error} onRetry={() => cases.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No cases match">
            Try another state filter or clear the search.
          </EmptyState>
        ) : (
          <ul
            className={cn(
              'divide-y divide-line-soft transition-opacity',
              cases.isFetching && 'opacity-75',
            )}
          >
            {items.map((c, i) => (
              <li
                key={c.id}
                className="animate-rise-in"
                style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
              >
                <button
                  type="button"
                  onClick={() => open(c)}
                  className={cn(
                    GRID,
                    'group w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.025] focus-visible:-outline-offset-2',
                  )}
                >
                  <span className="font-mono text-[12px] font-semibold text-cyan">{c.ref}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink group-hover:text-white">
                      {c.title}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-faint">
                      {c.category} · {c.place} · updated {relative(c.updatedAt, now)}
                    </span>
                  </span>
                  <span>
                    <CaseStateBadge state={c.state} />
                  </span>
                  <span>
                    <PriorityBadge priority={c.priority} />
                  </span>
                  <span className="flex min-w-0 items-center gap-2 max-xl:hidden">
                    <Avatar name={c.owner.name} size={22} />
                    <span className="truncate text-[12px] text-ink-2">{c.owner.name}</span>
                  </span>
                  <span>
                    <SlaChip
                      deadline={c.deadline}
                      now={now}
                      closed={['closed', 'released'].includes(c.state)}
                    />
                  </span>
                  <span className="num flex flex-col gap-0.5 text-[11px] text-ink-muted max-xl:hidden">
                    <span className="inline-flex items-center gap-1" title="Signals">
                      <Radio size={11} className="text-ink-faint" /> {c.signalCount}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Evidence records">
                      <FileStack size={11} className="text-ink-faint" /> {c.evidenceCount}
                    </span>
                  </span>
                  <span>
                    <MarkingTag marking={c.marking} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {cases.data && (
        <p className="num mt-2.5 text-[11.5px] text-ink-faint">
          {items.length} case{items.length === 1 ? '' : 's'} · SLA turns amber under 2 h and red
          when overdue
        </p>
      )}
    </div>
  )
}
