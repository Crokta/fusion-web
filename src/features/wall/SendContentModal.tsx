import { Clock, MonitorUp, Send } from 'lucide-react'
import { useState } from 'react'
import type { WallContentKey, WallState } from '@/api/types'
import { Modal } from '@/components/Overlay'
import { Badge, Button, Field, MarkingTag, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { screenLabel } from '@/lib/wall-model'
import { CATALOGUE_LIST, type ContentDef } from './catalogue'
import { MiniWall } from './MiniWall'

export interface SendInput {
  content: WallContentKey
  contextRef?: string
  lease?: number
  note?: string
}

const GROUPS: ContentDef['group'][] = ['Situation', 'Sources', 'Analysis', 'Operations']

/**
 * Route content to the selected screens. Supervisors and the centre lead publish directly;
 * everyone else files a request that lands in the incoming queue (policy
 * wall_requires_approval). Wall zones only ever show approved or released content.
 */
export function SendContentModal({
  open,
  onClose,
  state,
  targets,
  initialContent,
  canPublish,
  visitorMode,
  onPublish,
  onRequest,
}: {
  open: boolean
  onClose: () => void
  state: WallState
  targets: number[]
  initialContent?: WallContentKey
  canPublish: boolean
  visitorMode: boolean
  onPublish: (v: SendInput) => void
  onRequest: (v: SendInput) => void
}) {
  const [content, setContent] = useState<WallContentKey>(initialContent ?? 'map-ng')
  const [contextRef, setContextRef] = useState('INV-0264')
  const [lease, setLease] = useState(0)
  const [note, setNote] = useState('')
  const value = {
    content,
    contextRef: contextRef.trim() || undefined,
    lease: lease || undefined,
    note: note.trim() || undefined,
  }
  const merged = state.groups.some((g) => g.cells.some((c) => targets.includes(c)))
  const targetLabel =
    targets.length === 1 ? `screen ${screenLabel(targets[0]!)}` : `${targets.length} screens`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send content to the wall"
      description={`Choose an approved content source for ${targetLabel}${merged ? ' (merged canvas)' : ''}.`}
      className="w-[min(760px,94vw)]"
      footer={
        <>
          <span className="mr-auto text-[11px] text-ink-faint">
            {canPublish
              ? 'You can publish directly in your active role.'
              : 'Your active role files a request for supervisor approval.'}
          </span>
          <Button
            variant={canPublish ? 'secondary' : 'primary'}
            icon={Send}
            onClick={() => onRequest(value)}
          >
            Request approval
          </Button>
          {canPublish && (
            <Button variant="primary" icon={MonitorUp} onClick={() => onPublish(value)}>
              Publish now
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_210px]">
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="eyebrow mb-1.5">{g}</div>
              <div role="radiogroup" aria-label={g} className="grid grid-cols-2 gap-1.5">
                {CATALOGUE_LIST.filter((c) => c.group === g).map((c) => {
                  const on = c.key === content
                  const blocked = visitorMode && c.marking !== 'OFFICIAL'
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setContent(c.key)}
                      className={cn(
                        'flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                        on
                          ? 'border-cyan/60 bg-cyan/[0.08]'
                          : 'border-line hover:border-line-strong hover:bg-tint/[0.02]',
                      )}
                    >
                      <c.icon
                        size={15}
                        className={cn('mt-0.5 shrink-0', on ? 'text-cyan' : 'text-ink-muted')}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium text-ink">
                          {c.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-ink-faint">
                          {blocked ? 'Withheld while Visitor mode is on' : c.description}
                        </span>
                      </span>
                      {c.marking !== 'OFFICIAL' && (
                        <MarkingTag marking={c.marking} className="mt-0.5 h-4 text-[8px]" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <div>
            <div className="eyebrow mb-1.5">Target</div>
            <MiniWall
              screens={state.screens.map((s) => s.content)}
              groups={state.groups}
              highlight={targets}
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {targets.map((t) => (
                <Badge key={t} tone="cyan" className="font-mono">
                  {screenLabel(t)}
                </Badge>
              ))}
            </div>
          </div>
          <Field label="Incident key or case" hint="Filters the content to one case.">
            <input
              value={contextRef}
              onChange={(e) => setContextRef(e.target.value)}
              className={cn(inputClass, 'font-mono')}
              placeholder="INV-0264"
            />
          </Field>
          <Field label="Lease">
            <div className="relative">
              <Clock
                size={13}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-faint"
              />
              <select
                value={lease}
                onChange={(e) => setLease(Number(e.target.value))}
                className={cn(inputClass, 'appearance-none pl-8')}
              >
                <option value={0}>Until changed</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>60 minutes</option>
              </select>
            </div>
          </Field>
          <Field label="Note for supervisor">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className={cn(inputClass, 'resize-none')}
              placeholder="Why this should be on the wall"
            />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
