import { Archive, CheckCircle2, GraduationCap, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { useCloseCase, useLessonAction, useLessons } from '@/api/queries'
import type { CaseDetail, Lesson, LessonInput, MissionTemplate } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import { Badge, Button, ErrorNotice, Field, Panel, SkeletonRows, inputClass } from '@/components/ui'
import { dateTime } from '@/lib/format'

const EMPTY: LessonInput = { title: '', observation: '', recommendation: '' }

/**
 * The case's lessons (casework's register, ADR 0017). They are recorded once the case is closed,
 * for the mission template it ran under, so whoever keeps that template sees them.
 */
export function CaseLessonsPanel({ c }: { c: CaseDetail }) {
  const { activeRole } = useAuth()
  const lessons = useLessons({ caseId: c.id })
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const close = useCloseCase(c.id)
  const toast = useToast()
  const closed = c.state === 'closed'
  const mayRecord = can.recordLesson(activeRole)
  const mayClose = c.state === 'released' && can.closeCase(activeRole)

  return (
    <Panel
      title="Lessons"
      icon={GraduationCap}
      eyebrow={c.mission ? `For ${c.mission.name}` : undefined}
      actions={
        closed &&
        mayRecord &&
        !adding && (
          <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
            Record a lesson
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {adding && (
        <div className="border-b border-line-soft p-4">
          <LessonForm caseId={c.id} onDone={() => setAdding(false)} />
        </div>
      )}
      {lessons.isPending ? (
        <SkeletonRows rows={2} />
      ) : lessons.isError ? (
        <div className="p-4">
          <ErrorNotice error={lessons.error} onRetry={() => lessons.refetch()} />
        </div>
      ) : lessons.data.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-ink-faint">
          {closed
            ? 'No lessons recorded yet. What would you do differently on the next case like this?'
            : 'Lessons are recorded once the case is closed.'}
          {mayClose && (
            <Button
              size="xs"
              variant="secondary"
              icon={Archive}
              className="ml-2"
              loading={close.isPending}
              onClick={() =>
                close.mutate(c.etag ?? '', {
                  onSuccess: () => toast({ title: `${c.ref} closed`, tone: 'success' }),
                  onError: (e) =>
                    toast({ title: 'Not closed', detail: describeError(e), tone: 'error' }),
                })
              }
            >
              Close the case
            </Button>
          )}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {lessons.data.map((l) =>
            editing === l.id ? (
              <li key={l.id} className="p-4">
                <LessonForm caseId={c.id} lesson={l} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <LessonRow
                key={l.id}
                lesson={l}
                onEdit={mayRecord && !l.appliedVersion ? () => setEditing(l.id) : undefined}
              />
            ),
          )}
        </ul>
      )}
    </Panel>
  )
}

/** Lessons for one mission template, each marked applied once a version takes it in (E29). */
export function TemplateLessonsPanel({ template }: { template: MissionTemplate }) {
  const { activeRole } = useAuth()
  const lessons = useLessons({ templateKey: template.key })
  const act = useLessonAction()
  const toast = useToast()
  const mayApply = can.applyLesson(activeRole) && !template.retired

  const apply = (l: Lesson) =>
    act.mutate(
      { kind: 'apply', id: l.id, templateKey: template.key, etag: l.etag },
      {
        onSuccess: () =>
          toast({ title: `Marked as applied in v${template.currentVersion}`, tone: 'success' }),
        onError: (e) => toast({ title: 'Not applied', detail: describeError(e), tone: 'error' }),
      },
    )

  return (
    <Panel
      title="Lessons from closed cases"
      icon={GraduationCap}
      eyebrow="Change the lines above, save, then mark the lesson applied"
      bodyClassName="p-0"
    >
      {lessons.isPending ? (
        <SkeletonRows rows={2} />
      ) : lessons.isError ? (
        <div className="p-4">
          <ErrorNotice error={lessons.error} onRetry={() => lessons.refetch()} />
        </div>
      ) : lessons.data.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-ink-faint">No lessons name this template yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {lessons.data.map((l) => (
            <LessonRow
              key={l.id}
              lesson={l}
              showCase
              action={
                mayApply &&
                !l.appliedVersion && (
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={CheckCircle2}
                    loading={
                      act.isPending && act.variables?.kind === 'apply' && act.variables.id === l.id
                    }
                    onClick={() => apply(l)}
                  >
                    Mark applied in v{template.currentVersion}
                  </Button>
                )
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function LessonRow({
  lesson: l,
  showCase,
  action,
  onEdit,
}: {
  lesson: Lesson
  showCase?: boolean
  action?: React.ReactNode
  onEdit?: () => void
}) {
  return (
    <li className="px-4 py-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{l.title}</span>
        {l.appliedVersion ? (
          <Badge tone="green">
            Applied in {l.templateKey} v{l.appliedVersion}
          </Badge>
        ) : (
          <Badge tone="amber">Open</Badge>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {action}
          {onEdit && (
            <Button size="xs" variant="ghost" icon={Pencil} onClick={onEdit}>
              Reword
            </Button>
          )}
        </span>
      </div>
      <p className="mt-1 text-ink-2">
        <span className="text-ink-faint">What happened: </span>
        {l.observation}
      </p>
      <p className="mt-0.5 text-ink-2">
        <span className="text-ink-faint">Next time: </span>
        {l.recommendation}
      </p>
      <p className="mt-1 text-[11px] text-ink-faint">
        {showCase ? `${l.caseRef} · ` : ''}
        {l.recordedBy} · {dateTime(l.recordedAt)}
        {l.appliedBy && l.appliedAt ? ` · applied by ${l.appliedBy}, ${dateTime(l.appliedAt)}` : ''}
      </p>
    </li>
  )
}

function LessonForm({
  caseId,
  lesson,
  onDone,
}: {
  caseId: string
  lesson?: Lesson
  onDone: () => void
}) {
  const act = useLessonAction()
  const toast = useToast()
  const [input, setInput] = useState<LessonInput>(
    lesson
      ? {
          title: lesson.title,
          observation: lesson.observation,
          recommendation: lesson.recommendation,
        }
      : EMPTY,
  )
  const set = (k: keyof LessonInput) => (e: { target: { value: string } }) =>
    setInput((i) => ({ ...i, [k]: e.target.value }))
  const ready = input.title.trim() && input.observation.trim() && input.recommendation.trim()

  const save = () =>
    act.mutate(
      lesson
        ? { kind: 'revise', id: lesson.id, input, etag: lesson.etag }
        : { kind: 'record', caseId, input },
      {
        onSuccess: () => {
          toast({ title: lesson ? 'Lesson saved' : 'Lesson recorded', tone: 'success' })
          onDone()
        },
        onError: (e) => toast({ title: 'Not saved', detail: describeError(e), tone: 'error' }),
      },
    )

  return (
    <div className="space-y-3">
      <Field label="Lesson">
        <input value={input.title} onChange={set('title')} maxLength={200} className={inputClass} />
      </Field>
      <Field label="What happened">
        <textarea
          value={input.observation}
          onChange={set('observation')}
          rows={2}
          maxLength={4000}
          className={inputClass}
        />
      </Field>
      <Field label="What to do differently">
        <textarea
          value={input.recommendation}
          onChange={set('recommendation')}
          rows={2}
          maxLength={4000}
          className={inputClass}
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!ready} loading={act.isPending} onClick={save}>
          {lesson ? 'Save' : 'Record lesson'}
        </Button>
      </div>
    </div>
  )
}
