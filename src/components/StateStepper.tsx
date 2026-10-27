import { Check, CornerUpLeft } from 'lucide-react'
import type { CaseState } from '@/api/types'
import { cn } from '@/lib/cn'

/**
 * The case state machine as a horizontal stepper. Returned is not a step of its own: it is a
 * branch at the decision slot, drawn in red, because a returned case goes back to the analyst.
 */
const STEPS: { key: CaseState; label: string }[] = [
  { key: 'triage', label: 'Triage' },
  { key: 'open', label: 'Open' },
  { key: 'in_assessment', label: 'In assessment' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'released', label: 'Released' },
  { key: 'closed', label: 'Closed' },
]

export function stepIndex(state: CaseState): number {
  if (state === 'returned') return 4
  return STEPS.findIndex((s) => s.key === state)
}

export function StateStepper({ state, className }: { state: CaseState; className?: string }) {
  const current = stepIndex(state)
  const returned = state === 'returned'
  return (
    <ol aria-label="Case state" className={cn('flex w-full items-start', className)}>
      {STEPS.map((step, i) => {
        const isReturnSlot = returned && i === 4
        const done = i < current
        const active = i === current
        const label = isReturnSlot
          ? 'Returned'
          : step.key === 'approved'
            ? 'Approved / Returned'
            : step.label
        return (
          <li
            key={step.key}
            className="relative flex min-w-0 flex-1 flex-col items-center text-center"
            aria-current={active ? 'step' : undefined}
            data-state={
              done ? 'done' : active ? (isReturnSlot ? 'returned' : 'current') : 'upcoming'
            }
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-[13px] right-1/2 h-px w-full',
                  i <= current
                    ? isReturnSlot
                      ? 'bg-gradient-to-r from-cyan/60 to-red/70'
                      : 'bg-cyan/60'
                    : 'bg-line-strong',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-10 grid size-[27px] place-items-center rounded-full border text-[11px] font-semibold transition-colors',
                done && 'border-cyan/60 bg-cyan/15 text-cyan',
                active &&
                  !isReturnSlot &&
                  'border-cyan bg-cyan text-void shadow-[0_0_0_4px_rgb(69_215_242/.15),0_0_18px_rgb(69_215_242/.55)]',
                active &&
                  isReturnSlot &&
                  'border-red bg-red text-white shadow-[0_0_0_4px_rgb(255_92_114/.15),0_0_18px_rgb(255_92_114/.5)]',
                !done && !active && 'border-line-strong bg-panel text-ink-faint',
              )}
            >
              {done ? (
                <Check size={13} strokeWidth={2.6} />
              ) : isReturnSlot ? (
                <CornerUpLeft size={13} strokeWidth={2.4} />
              ) : (
                i + 1
              )}
            </span>
            <span
              className={cn(
                'mt-2 px-1 text-[11px] leading-tight font-medium',
                active
                  ? isReturnSlot
                    ? 'text-red'
                    : 'text-ink'
                  : done
                    ? 'text-ink-2'
                    : 'text-ink-faint',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
