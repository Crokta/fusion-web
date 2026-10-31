import { useState } from 'react'
import { Check, ClipboardList, ListChecks, MessageSquareText, Send, Shuffle } from 'lucide-react'
import { describeError } from '@/api'
import { useCaseAction, useMissionTemplates, useSubmitCase } from '@/api/queries'
import type { CaseDetail, ChecklistLine } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import { Badge, Button, Field, inputClass, Panel } from '@/components/ui'
import { cn } from '@/lib/cn'
import { useAssessmentAccess } from './Assessment'

/** States in which casework lets the mission change (ADR 0012): not under review, not once approved. */
const MISSION_STATES: CaseDetail['state'][] = ['triage', 'open', 'in_assessment', 'returned']

const isRequired = (i: ChecklistLine) => i.required !== false

/**
 * The case's mission checklist (E29, ADR 0012): lines copied from a template version, some
 * required. Submit waits for the required ones; optional lines still open are shown to the
 * reviewer as open. Analysts tick and note lines; supervisors choose the mission.
 */
export function ChecklistPanel({ c }: { c: CaseDetail }) {
  const submit = useSubmitCase(c.id)
  const tick = useCaseAction(c.id)
  const { canEdit } = useAssessmentAccess(c)
  const { activeRole } = useAuth()
  const toast = useToast()
  // Fixed under review as well as once released or closed, as casework holds it.
  const canTick = canEdit && c.state !== 'submitted' && c.checklist.every((i) => i.key)
  const required = c.checklist.filter(isRequired)
  const done = required.filter((i) => i.done).length
  const openRequired = required.filter((i) => !i.done)
  const complete = openRequired.length === 0
  const canSubmit = c.state === 'in_assessment' || c.state === 'returned' || c.state === 'open'
  const canChooseMission = can.manageMissions(activeRole) && MISSION_STATES.includes(c.state)

  const save = (item: ChecklistLine, next: { done: boolean; note?: string }, onDone?: () => void) =>
    tick.mutate(
      { kind: 'checklist', key: item.key ?? item.label, ...next },
      {
        onSuccess: onDone,
        onError: (e) => toast({ title: 'Not saved', detail: describeError(e), tone: 'error' }),
      },
    )

  return (
    <Panel
      title="Mission checklist"
      eyebrow={
        c.mission?.name
          ? `${c.mission.name}${c.mission.version ? ` · v${c.mission.version}` : ''}`
          : undefined
      }
      icon={ListChecks}
      actions={
        <span
          className={cn(
            'num text-[11.5px] font-semibold',
            complete ? 'text-green' : 'text-ink-muted',
          )}
          title="Required lines done"
        >
          {done}/{required.length}
        </span>
      }
    >
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-tint/[0.06]">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700',
            complete ? 'bg-green' : 'bg-cyan',
          )}
          style={{ width: `${(done / Math.max(1, required.length)) * 100}%` }}
        />
      </div>
      <ul className="space-y-1">
        {c.checklist.map((item) => (
          <ChecklistRow
            key={item.key ?? item.label}
            item={item}
            canTick={canTick}
            pending={tick.isPending}
            onSave={save}
          />
        ))}
      </ul>

      {canChooseMission && <MissionChooser c={c} />}

      {canSubmit ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <Button
            variant={complete ? 'primary' : 'secondary'}
            size="md"
            icon={Send}
            className="w-full"
            loading={submit.isPending}
            onClick={() =>
              submit.mutate(c.etag, {
                onSuccess: () =>
                  toast({
                    title: `${c.ref} submitted for review`,
                    detail: 'A CASE_REVIEW approval was created.',
                    tone: 'success',
                  }),
                onError: (e) =>
                  toast({ title: 'Not submitted', detail: describeError(e), tone: 'error' }),
              })
            }
          >
            Submit for review
          </Button>
          {!complete && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber">
              Still open and required: {openRequired.map((i) => i.label).join('; ')}.
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Submit needs every required line done and at least one finding, each citing an original
            or a statement. Optional lines left open are shown to the reviewer. The reviewer must
            not be the author.
          </p>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3 text-[11.5px] text-ink-faint">
          <ClipboardList size={13} />{' '}
          {c.state === 'submitted' ? 'Awaiting review.' : 'No submission available in this state.'}
        </p>
      )}
    </Panel>
  )
}

function ChecklistRow({
  item,
  canTick,
  pending,
  onSave,
}: {
  item: ChecklistLine
  canTick: boolean
  pending: boolean
  onSave: (item: ChecklistLine, next: { done: boolean; note?: string }, onDone?: () => void) => void
}) {
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const optional = !isRequired(item)

  return (
    <li>
      <div className="group flex items-start gap-1">
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          disabled={!canTick || pending}
          onClick={() => onSave(item, { done: !item.done })}
          className={cn(
            '-mx-1.5 flex min-w-0 flex-1 items-start gap-2.5 rounded-md px-1.5 py-1 text-left text-[12.5px] transition-colors',
            canTick ? 'hover:bg-tint/[0.03]' : 'cursor-default',
          )}
        >
          <span
            className={cn(
              'mt-px grid size-4 shrink-0 place-items-center rounded-[4px] ring-1 ring-inset',
              item.done
                ? 'bg-green/15 text-green ring-green/40'
                : 'text-transparent ring-line-strong',
            )}
            aria-hidden
          >
            <Check size={11} strokeWidth={3} />
          </span>
          <span className="min-w-0">
            <span className={item.done ? 'text-ink-2' : 'text-ink-muted'}>{item.label}</span>
            {optional && (
              <Badge className="ml-2 align-middle" tone={item.done ? 'neutral' : 'amber'}>
                {item.done ? 'Optional' : 'Optional · open'}
              </Badge>
            )}
            {item.done && item.doneBy && (
              <span className="block text-[10.5px] text-ink-faint">Done by {item.doneBy}</span>
            )}
          </span>
        </button>
        {canTick && !editing && (
          <button
            type="button"
            onClick={() => {
              setNote(item.note ?? '')
              setEditing(true)
            }}
            className="mt-0.5 rounded p-1 text-ink-faint opacity-60 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
            aria-label={
              item.note ? `Edit the note on ${item.label}` : `Add a note to ${item.label}`
            }
            title={item.note ? 'Edit note' : 'Add note'}
          >
            <MessageSquareText size={13} aria-hidden />
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1 mb-2 ml-6.5 space-y-1.5">
          <textarea
            className={cn(inputClass, 'min-h-14 text-[12px]')}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was checked, or why it does not apply"
            aria-label={`Note on ${item.label}`}
            autoFocus
          />
          <div className="flex gap-1.5">
            <Button
              size="xs"
              variant="primary"
              loading={pending}
              onClick={() => onSave(item, { done: item.done, note }, () => setEditing(false))}
            >
              Save note
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        item.note && (
          <p className="mt-0.5 mb-1.5 ml-6.5 border-l-2 border-line-strong pl-2 text-[11.5px] leading-relaxed text-ink-muted">
            {item.note}
            {item.noteBy && <span className="text-ink-faint"> — {item.noteBy}</span>}
          </p>
        )
      )}
    </li>
  )
}

/** Supervisors choose the mission by hand or through the category (case.assign). */
function MissionChooser({ c }: { c: CaseDetail }) {
  const templates = useMissionTemplates()
  const action = useCaseAction(c.id)
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [templateKey, setTemplateKey] = useState(c.mission?.templateKey ?? '')
  const [category, setCategory] = useState(c.category === 'Unclassified' ? '' : c.category)

  const run = (a: Parameters<typeof action.mutate>[0], title: string) =>
    action.mutate(a, {
      onSuccess: () => {
        toast({ title, tone: 'success' })
        setOpen(false)
      },
      onError: (e) => toast({ title: 'Not changed', detail: describeError(e), tone: 'error' }),
    })

  if (!open)
    return (
      <div className="mt-3">
        <Button size="xs" variant="ghost" icon={Shuffle} onClick={() => setOpen(true)}>
          Change mission or category
        </Button>
      </div>
    )

  return (
    <div className="mt-3 space-y-3 rounded-md border border-line-soft bg-tint/[0.02] p-3">
      <Field
        label="Category"
        hint="A template that covers the category replaces the checklist. Lines both share keep their ticks and notes."
      >
        <div className="flex gap-1.5">
          <input
            className={inputClass}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={100}
            placeholder="e.g. Civil unrest"
          />
          <Button
            size="sm"
            disabled={!category.trim() || action.isPending}
            onClick={() => run({ kind: 'category', category }, 'Category set')}
          >
            Set
          </Button>
        </div>
      </Field>
      <Field label="Mission template">
        <div className="flex gap-1.5">
          <select
            className={inputClass}
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            disabled={templates.isPending}
          >
            {(templates.data ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} (v{t.currentVersion})
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!templateKey || action.isPending}
            onClick={() => run({ kind: 'mission', templateKey }, 'Mission applied')}
          >
            Apply
          </Button>
        </div>
      </Field>
      <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
        Close
      </Button>
    </div>
  )
}
