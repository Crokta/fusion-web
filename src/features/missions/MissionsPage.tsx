import { useState } from 'react'
import { ArrowDown, ArrowUp, Archive, ListChecks, Plus, Save, Trash2 } from 'lucide-react'
import { describeError } from '@/api'
import { useMissionAction, useMissionTemplates } from '@/api/queries'
import type { MissionLine, MissionTemplate, MissionTemplateInput } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Panel,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime } from '@/lib/format'

/** A line key from its label: what casework accepts (lower case, digits, underscores). */
export const lineKey = (label: string, taken: string[]) => {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^[^a-z]+|_+$/g, '')
      .slice(0, 50) || 'line'
  let key = base.length < 2 ? `${base}_line` : base
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`
  return key
}

/** A template key from its name: lower case, digits, hyphens. */
export const templateKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '')
    .slice(0, 60)

const blank: MissionTemplateInput = { name: '', description: '', categories: [], items: [] }

/**
 * Mission templates (E29, ADR 0012). Supervisors and the centre lead keep them (case.assign);
 * everyone who reads cases can read them. Saving is a new version: cases already using an earlier
 * one keep their copy.
 */
export function MissionsPage() {
  const { activeRole } = useAuth()
  const manage = can.manageMissions(activeRole)
  const readable = can.readMissions(activeRole)
  const [showRetired, setShowRetired] = useState(false)
  const templates = useMissionTemplates(showRetired, readable)
  const [selected, setSelected] = useState<string | 'new' | null>(null)

  const list = templates.data ?? []
  const current = selected === 'new' ? null : (list.find((t) => t.key === selected) ?? list[0])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Operations"
        title="Mission templates"
        description="The checklist a case works through. A case gets the template that covers its category, or the default; supervisors can choose another. Saving a template makes a new version, and cases already using an earlier one keep theirs."
        actions={
          manage ? (
            <Button variant="primary" icon={Plus} onClick={() => setSelected('new')}>
              New template
            </Button>
          ) : undefined
        }
      />
      {!readable ? (
        <EmptyState icon={ListChecks} title="Your active role cannot read mission templates" />
      ) : templates.isError ? (
        <ErrorNotice error={templates.error} onRetry={() => templates.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <Panel title="Templates" icon={ListChecks} bodyClassName="p-2">
            {templates.isPending ? (
              <SkeletonRows rows={4} />
            ) : (
              <ul className="space-y-0.5">
                {list.map((t) => (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(t.key)}
                      aria-current={current?.key === t.key && selected !== 'new'}
                      className={cn(
                        'w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-tint/[0.04]',
                        current?.key === t.key && selected !== 'new' && 'bg-cyan/[0.08]',
                      )}
                    >
                      <span className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                        <span className="truncate">{t.name}</span>
                        <span className="num text-[10.5px] text-ink-faint">
                          v{t.currentVersion}
                        </span>
                        {t.isDefault && <Badge tone="cyan">Default</Badge>}
                        {t.retired && <Badge>Retired</Badge>}
                      </span>
                      <span className="block truncate text-[11px] text-ink-faint">
                        {t.categories.length ? t.categories.join(', ') : 'No categories'} ·{' '}
                        {t.items.length} lines
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="mt-2 flex items-center gap-2 border-t border-line-soft px-2.5 pt-2 text-[11.5px] text-ink-muted">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => setShowRetired(e.target.checked)}
              />
              Show retired templates
            </label>
          </Panel>
          {selected === 'new' ? (
            <TemplateEditor
              key="new"
              manage={manage}
              onSaved={(t) => setSelected(t.key)}
              onCancel={() => setSelected(null)}
            />
          ) : current ? (
            <TemplateEditor
              key={`${current.key}-${current.etag}`}
              template={current}
              manage={manage}
            />
          ) : templates.isPending ? null : (
            <EmptyState icon={ListChecks} title="No templates yet" />
          )}
        </div>
      )}
    </div>
  )
}

function TemplateEditor({
  template,
  manage,
  onSaved,
  onCancel,
}: {
  template?: MissionTemplate
  manage: boolean
  onSaved?: (t: MissionTemplate) => void
  onCancel?: () => void
}) {
  const action = useMissionAction()
  const toast = useToast()
  const editable = manage && !template?.retired
  const [draft, setDraft] = useState<MissionTemplateInput>(
    template
      ? {
          name: template.name,
          description: template.description,
          categories: template.categories,
          items: template.items,
        }
      : blank,
  )
  const [categories, setCategories] = useState(draft.categories.join(', '))
  const [newLine, setNewLine] = useState('')

  const setItems = (items: MissionLine[]) => setDraft((d) => ({ ...d, items }))
  const move = (from: number, to: number) => {
    const items = [...draft.items]
    const [line] = items.splice(from, 1)
    items.splice(to, 0, line!)
    setItems(items)
  }
  const addLine = () => {
    const label = newLine.trim()
    if (!label) return
    setItems([
      ...draft.items,
      {
        key: lineKey(
          label,
          draft.items.map((i) => i.key),
        ),
        label,
        required: true,
      },
    ])
    setNewLine('')
  }

  const input = (): MissionTemplateInput => ({
    ...draft,
    key: template ? undefined : templateKey(draft.name),
    categories: categories
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  })

  const save = () =>
    action.mutate(
      template
        ? { kind: 'revise', key: template.key, input: input(), etag: template.etag }
        : { kind: 'create', input: input() },
      {
        onSuccess: (t) => {
          toast({
            title: template
              ? `${t.name} saved as version ${t.currentVersion}`
              : `${t.name} created`,
            detail: template ? 'Cases already using an earlier version keep theirs.' : undefined,
            tone: 'success',
          })
          onSaved?.(t)
        },
        onError: (e) => toast({ title: 'Not saved', detail: describeError(e), tone: 'error' }),
      },
    )

  const retire = () =>
    template &&
    action.mutate(
      { kind: 'retire', key: template.key, etag: template.etag },
      {
        onSuccess: (t) => toast({ title: `${t.name} retired`, tone: 'success' }),
        onError: (e) => toast({ title: 'Not retired', detail: describeError(e), tone: 'error' }),
      },
    )

  const valid = draft.name.trim() && draft.items.some((i) => i.label.trim())

  return (
    <div className="space-y-5">
      <Panel
        title={template ? template.name : 'New template'}
        eyebrow={
          template
            ? `Version ${template.currentVersion} · saved by ${template.updatedBy} ${dateTime(template.updatedAt)}`
            : undefined
        }
        actions={
          editable ? (
            <>
              {template && !template.isDefault && (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={Archive}
                  onClick={retire}
                  disabled={action.isPending}
                >
                  Retire
                </Button>
              )}
              {onCancel && (
                <Button size="xs" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button
                size="xs"
                variant="primary"
                icon={Save}
                loading={action.isPending}
                disabled={!valid}
                onClick={save}
              >
                {template ? 'Save new version' : 'Create'}
              </Button>
            </>
          ) : undefined
        }
      >
        <fieldset disabled={!editable} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input
                className={inputClass}
                value={draft.name}
                maxLength={120}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Protest monitoring"
              />
            </Field>
            <Field
              label="Categories"
              hint="Separate with commas. A case in one of these gets this template; each category belongs to one template."
            >
              <input
                className={inputClass}
                value={categories}
                onChange={(e) => setCategories(e.target.value)}
                placeholder="e.g. Civil unrest"
              />
            </Field>
          </div>
          <Field label="Description">
            <input
              className={inputClass}
              value={draft.description}
              maxLength={1000}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="When to use it"
            />
          </Field>
          <div>
            <span className="eyebrow mb-1.5 block">Lines, in order</span>
            <ol className="divide-y divide-line-soft rounded-md border border-line-soft">
              {draft.items.map((item, i) => (
                <li key={item.key} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="num w-5 text-[11px] text-ink-faint">{i + 1}</span>
                  <input
                    className={cn(inputClass, 'flex-1 py-1 text-[12.5px]')}
                    value={item.label}
                    maxLength={300}
                    aria-label={`Line ${i + 1}`}
                    onChange={(e) =>
                      setItems(
                        draft.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <label className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) =>
                        setItems(
                          draft.items.map((x, j) =>
                            j === i ? { ...x, required: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    Required
                  </label>
                  {editable && (
                    <span className="flex">
                      <IconAction
                        label="Move up"
                        icon={ArrowUp}
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                      />
                      <IconAction
                        label="Move down"
                        icon={ArrowDown}
                        disabled={i === draft.items.length - 1}
                        onClick={() => move(i, i + 1)}
                      />
                      <IconAction
                        label="Remove line"
                        icon={Trash2}
                        onClick={() => setItems(draft.items.filter((_, j) => j !== i))}
                      />
                    </span>
                  )}
                </li>
              ))}
              {draft.items.length === 0 && (
                <li className="px-2.5 py-3 text-[12px] text-ink-faint">No lines yet.</li>
              )}
            </ol>
            {editable && (
              <div className="mt-2 flex gap-1.5">
                <input
                  className={inputClass}
                  value={newLine}
                  maxLength={300}
                  onChange={(e) => setNewLine(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLine()}
                  placeholder="Add a line, e.g. Police statement sought"
                  aria-label="New line"
                />
                <Button size="sm" icon={Plus} onClick={addLine} disabled={!newLine.trim()}>
                  Add
                </Button>
              </div>
            )}
          </div>
          {!manage && (
            <p className="text-[11.5px] text-ink-faint">
              Reading only: supervisors and the centre lead keep mission templates.
            </p>
          )}
        </fieldset>
      </Panel>
      {template && template.versions.length > 0 && <VersionHistory template={template} />}
    </div>
  )
}

function VersionHistory({ template }: { template: MissionTemplate }) {
  return (
    <Panel title="Versions" eyebrow="Kept as they were: a case keeps the version it was given">
      <ol className="space-y-3">
        {template.versions.map((v) => (
          <li key={v.number} className="text-[12px]">
            <div className="flex items-center gap-2">
              <span className="num font-semibold text-ink">v{v.number}</span>
              <span className="text-ink-muted">{v.name}</span>
              <span className="text-ink-faint">
                · {v.createdBy} · {dateTime(v.createdAt)}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              {v.items.map((i) => (i.required ? i.label : `${i.label} (optional)`)).join(' · ')}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string
  icon: typeof Plus
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-ink-faint transition-colors hover:text-ink disabled:opacity-30"
    >
      <Icon size={13} aria-hidden />
    </button>
  )
}
