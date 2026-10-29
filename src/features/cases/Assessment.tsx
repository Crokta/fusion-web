import {
  Check,
  FileText,
  Flag,
  Lock,
  MessageSquareQuote,
  Pencil,
  Plus,
  Quote,
  RotateCcw,
  Scale,
  ShieldAlert,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { describeError } from '@/api'
import { type CaseAction, useCaseAction } from '@/api/queries'
import {
  ROLE_LABEL,
  type CaseDetail,
  type CaseStatement,
  type Claim,
  type ClaimOutcome,
  type Confidence,
  type EvidenceItem,
  type Finding,
  type FindingInput,
  type StatementChannel,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Panel,
  Segmented,
  type Tone,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, since } from '@/lib/format'
import { useNow } from '@/lib/hooks'

const EDITABLE_STATES = ['open', 'in_assessment', 'returned', 'approved']

const confidenceTone: Record<Confidence, Tone> = {
  high: 'green',
  moderate: 'amber',
  low: 'neutral',
}
const outcomeTone: Record<ClaimOutcome, Tone> = {
  supported: 'green',
  contradicted: 'red',
  inconclusive: 'amber',
  unassessed: 'neutral',
}
const CHANNEL_LABEL: Record<StatementChannel, string> = {
  official: 'Official',
  witness: 'Witness',
  interview: 'Interview',
  press: 'Press',
  other: 'Other',
}

/** Whether this person may change this case's assessment now, and if not, why. */
export function useAssessmentAccess(c: CaseDetail) {
  const { activeRole } = useAuth()
  const roleMay = can.writeCase(activeRole)
  const stateMay = EDITABLE_STATES.includes(c.state)
  return { canEdit: roleMay && stateMay, roleMay, stateMay, activeRole }
}

/** One line above the assessment saying what editing will do, or why it is off. */
export function AssessmentNotice({ c }: { c: CaseDetail }) {
  const { roleMay, activeRole } = useAssessmentAccess(c)
  let tone = 'border-line-strong bg-tint/[0.025]'
  let icon = <ShieldAlert size={15} className="mt-0.5 shrink-0 text-cyan" aria-hidden />
  let text: ReactNode = null
  if (!roleMay) {
    text = (
      <>
        Acting as <span className="text-ink-2">{ROLE_LABEL[activeRole]}</span>: reading only. An
        analyst or supervisor writes the assessment.
      </>
    )
  } else if (c.state === 'submitted') {
    icon = <Lock size={15} className="mt-0.5 shrink-0 text-amber" aria-hidden />
    text = 'Under review: the assessment is fixed until the reviewer approves or returns the case.'
  } else if (c.state === 'approved') {
    tone = 'border-amber/35 bg-amber/[0.07]'
    icon = <RotateCcw size={15} className="mt-0.5 shrink-0 text-amber" aria-hidden />
    text =
      'Approved. Changing the summary, a finding or a claim’s outcome sends the case back for review.'
  } else if (c.state === 'released' || c.state === 'closed') {
    icon = <Lock size={15} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
    text = `The case is ${c.state}: its assessment is the record.`
  }
  if (!text) return null
  return (
    <div role="note" className={cn('flex gap-3 rounded-lg border px-3.5 py-2.5', tone)}>
      {icon}
      <p className="text-[12.5px] leading-relaxed text-ink-muted">{text}</p>
    </div>
  )
}

function useRun(caseId: string) {
  const act = useCaseAction(caseId)
  const toast = useToast()
  const run = (a: CaseAction, done: string, after?: () => void) =>
    act.mutate(a, {
      onSuccess: () => {
        toast({ title: done, tone: 'success' })
        after?.()
      },
      onError: (e) => toast({ title: 'Not saved', detail: describeError(e), tone: 'error' }),
    })
  return { run, pending: act.isPending }
}

const statementLabel = (statements: CaseStatement[], id: string) => {
  const i = statements.findIndex((s) => s.id === id)
  return i < 0 ? 'Statement' : `S${i + 1}`
}

/** The originals and statements an entry cites, as small chips. */
function Citations({
  c,
  evidenceIds = [],
  statementIds = [],
}: {
  c: CaseDetail
  evidenceIds?: string[]
  statementIds?: string[]
}) {
  const statements = c.statements ?? []
  return (
    <>
      {evidenceIds.map((id) => {
        const e = c.evidence.find((x) => x.id === id)
        return (
          <Chip key={id} title={e?.link}>
            {e ? `${e.label ?? e.title} · ${e.ref}` : id.slice(-6)}
          </Chip>
        )
      })}
      {statementIds.map((id) => {
        const s = statements.find((x) => x.id === id)
        return (
          <Chip key={id} title={s?.text}>
            {statementLabel(statements, id)}
            {s ? ` · ${s.speaker}` : ''}
          </Chip>
        )
      })}
    </>
  )
}

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="max-w-[260px] truncate rounded-[4px] bg-tint/[0.035] px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted ring-1 ring-tint/[0.06]"
    >
      {children}
    </span>
  )
}

/** Pick what an entry cites from the case's own originals and statements. */
function CitePicker({
  evidence,
  statements,
  evidenceIds,
  statementIds,
  onChange,
}: {
  evidence: EvidenceItem[]
  statements: CaseStatement[]
  evidenceIds: string[]
  statementIds: string[]
  onChange: (next: { evidenceIds: string[]; statementIds: string[] }) => void
}) {
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  if (evidence.length === 0 && statements.length === 0)
    return (
      <p className="text-[11.5px] text-ink-faint">
        Nothing to cite yet: originals arrive with the case, statements are recorded below.
      </p>
    )
  return (
    <div className="space-y-2">
      {evidence.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Originals">
          {evidence.map((e) => (
            <PickChip
              key={e.id}
              on={evidenceIds.includes(e.id)}
              onClick={() => onChange({ evidenceIds: toggle(evidenceIds, e.id), statementIds })}
            >
              {e.label ?? e.title} · {e.ref}
            </PickChip>
          ))}
        </div>
      )}
      {statements.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Statements">
          {statements.map((s, i) => (
            <PickChip
              key={s.id}
              on={statementIds.includes(s.id)}
              onClick={() => onChange({ evidenceIds, statementIds: toggle(statementIds, s.id) })}
            >
              S{i + 1} · {s.speaker}
            </PickChip>
          ))}
        </div>
      )}
    </div>
  )
}

function PickChip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-[11.5px] ring-1 transition-colors',
        on
          ? 'bg-cyan/[0.12] text-ink ring-cyan/50'
          : 'bg-tint/[0.03] text-ink-muted ring-tint/10 hover:text-ink',
      )}
    >
      {on && <Check size={11} className="shrink-0 text-cyan" aria-hidden />}
      <span className="truncate">{children}</span>
    </button>
  )
}

function FormActions({
  pending,
  label,
  onCancel,
  disabled,
}: {
  pending: boolean
  label: string
  onCancel: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" loading={pending} disabled={disabled}>
        {label}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- summary

export function SummaryPanel({ c }: { c: CaseDetail }) {
  const { canEdit } = useAssessmentAccess(c)
  const { run, pending } = useRun(c.id)
  const now = useNow()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.summary)

  return (
    <Panel
      title="Summary"
      icon={FileText}
      actions={
        canEdit &&
        !editing && (
          <Button
            variant="ghost"
            icon={Pencil}
            onClick={() => {
              setText(c.summary)
              setEditing(true)
            }}
          >
            {c.summary ? 'Edit' : 'Write'}
          </Button>
        )
      }
    >
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            run({ kind: 'summary', summary: text.trim() }, 'Summary saved', () => setEditing(false))
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            maxLength={8000}
            autoFocus
            placeholder="What happened, what the assessment says, and what it rests on, in a paragraph or two."
            className={cn(inputClass, 'resize-y text-[13.5px] leading-relaxed')}
          />
          <FormActions pending={pending} label="Save summary" onCancel={() => setEditing(false)} />
        </form>
      ) : c.summary ? (
        <>
          <p className="max-w-3xl text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">
            {c.summary}
          </p>
          {c.summaryBy && c.summaryUpdatedAt && (
            <p className="mt-2 text-[11px] text-ink-faint">
              {c.summaryBy} · {since(c.summaryUpdatedAt, now)}
            </p>
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-ink-faint">No summary yet.</p>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- findings

const CONFIDENCES: { value: Confidence; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'high', label: 'High' },
]

function FindingForm({
  c,
  initial,
  label,
  pending,
  onSubmit,
  onCancel,
}: {
  c: CaseDetail
  initial?: Finding
  label: string
  pending: boolean
  onSubmit: (input: FindingInput) => void
  onCancel: () => void
}) {
  const [statement, setStatement] = useState(initial?.statement ?? '')
  const [confidence, setConfidence] = useState<Confidence>(initial?.confidence ?? 'moderate')
  const [basis, setBasis] = useState(initial?.basis ?? '')
  const [cites, setCites] = useState({
    evidenceIds: initial?.evidenceIds ?? [],
    statementIds: initial?.statementIds ?? [],
  })
  const uncited = cites.evidenceIds.length === 0 && cites.statementIds.length === 0
  const valid = statement.trim().length > 0 && basis.trim().length > 0

  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid)
          onSubmit({ statement: statement.trim(), confidence, basis: basis.trim(), ...cites })
      }}
    >
      <Field label="Finding">
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          rows={2}
          maxLength={4000}
          autoFocus
          placeholder="What do you conclude? Write it as it should read in a brief."
          className={cn(inputClass, 'resize-y leading-relaxed')}
        />
      </Field>
      <div>
        <span className="eyebrow mb-1.5 block">Confidence</span>
        <Segmented
          label="Confidence"
          value={confidence}
          onChange={setConfidence}
          options={CONFIDENCES}
        />
      </div>
      <Field label="Basis and limitations">
        <textarea
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="What it rests on, and what limits it."
          className={cn(inputClass, 'resize-y leading-relaxed')}
        />
      </Field>
      <div>
        <span className="eyebrow mb-1.5 block">Cites</span>
        <CitePicker
          evidence={c.evidence}
          statements={c.statements ?? []}
          {...cites}
          onChange={setCites}
        />
        {uncited && (
          <p className="mt-2 text-[11.5px] text-amber">
            Cite an original or a statement: a case is submitted only when every finding does.
          </p>
        )}
      </div>
      <FormActions pending={pending} label={label} onCancel={onCancel} disabled={!valid} />
    </form>
  )
}

export function FindingsPanel({ c }: { c: CaseDetail }) {
  const { canEdit } = useAssessmentAccess(c)
  const { run, pending } = useRun(c.id)
  const now = useNow()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <Panel
      title="Findings"
      icon={Flag}
      actions={
        <>
          <span className="num text-[11.5px] text-ink-faint">{c.findings.length}</span>
          {canEdit && !adding && (
            <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
              Record finding
            </Button>
          )}
        </>
      }
      bodyClassName="p-0"
    >
      {adding && (
        <div className="border-b border-line-soft px-4 py-4">
          <FindingForm
            c={c}
            label="Record finding"
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) =>
              run({ kind: 'finding', input }, 'Finding recorded', () => setAdding(false))
            }
          />
        </div>
      )}
      {c.findings.length === 0 && !adding ? (
        <EmptyState icon={Flag} title="No findings recorded yet" className="py-8">
          Findings are written by analysts and approved by a reviewer who is not the author.
        </EmptyState>
      ) : (
        <ol className="divide-y divide-line-soft">
          {c.findings.map((f, i) => (
            <li key={f.id} className="flex gap-4 px-4 py-4">
              <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-tint/[0.04] font-mono text-[11px] text-ink-muted ring-1 ring-tint/[0.06]">
                F{i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {editingId === f.id ? (
                  <FindingForm
                    c={c}
                    initial={f}
                    label="Save revision"
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(input) =>
                      run(
                        { kind: 'revise', findingId: f.id, input, version: f.version ?? 1 },
                        `F${i + 1} revised`,
                        () => setEditingId(null),
                      )
                    }
                  />
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-ink">
                        {f.statement}
                      </p>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Pencil}
                          aria-label={`Revise F${i + 1}`}
                          onClick={() => setEditingId(f.id)}
                        >
                          Revise
                        </Button>
                      )}
                    </div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-ink-muted">
                      <Scale
                        size={12}
                        className="mr-1 inline -translate-y-px text-ink-faint"
                        aria-hidden
                      />
                      {f.basis}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={confidenceTone[f.confidence]}>{f.confidence} confidence</Badge>
                      <Citations c={c} evidenceIds={f.evidenceIds} statementIds={f.statementIds} />
                      {f.evidenceIds.length === 0 && (f.statementIds ?? []).length === 0 && (
                        <Badge tone="amber">cites nothing</Badge>
                      )}
                      <span className="ml-auto text-[11px] text-ink-faint">
                        {f.authorName} · {since(f.recordedAt, now)}
                        {f.version && f.version > 1
                          ? ` · revised${f.revisedBy ? ` by ${f.revisedBy}` : ''} (v${f.version})`
                          : ''}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- statements

const CHANNELS: StatementChannel[] = ['official', 'witness', 'interview', 'press', 'other']

function StatementForm({
  c,
  pending,
  onCancel,
  onSubmit,
}: {
  c: CaseDetail
  pending: boolean
  onCancel: () => void
  onSubmit: (input: {
    speaker: string
    speakerRole?: string
    channel: StatementChannel
    givenAt?: string
    text: string
    evidenceId?: string
  }) => void
}) {
  const [speaker, setSpeaker] = useState('')
  const [speakerRole, setSpeakerRole] = useState('')
  const [channel, setChannel] = useState<StatementChannel>('official')
  const [givenAt, setGivenAt] = useState('')
  const [text, setText] = useState('')
  const [evidenceId, setEvidenceId] = useState('')
  const valid = speaker.trim().length > 0 && text.trim().length > 0

  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!valid) return
        onSubmit({
          speaker: speaker.trim(),
          speakerRole: speakerRole.trim() || undefined,
          channel,
          givenAt: givenAt ? new Date(givenAt).toISOString() : undefined,
          text: text.trim(),
          evidenceId: evidenceId || undefined,
        })
      }}
    >
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Who">
          <input
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            maxLength={200}
            autoFocus
            placeholder="e.g. Nasarawa State Police Command"
            className={inputClass}
          />
        </Field>
        <Field label="Role or affiliation">
          <input
            value={speakerRole}
            onChange={(e) => setSpeakerRole(e.target.value)}
            maxLength={200}
            placeholder="e.g. spokesperson"
            className={inputClass}
          />
        </Field>
        <Field label="Channel">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as StatementChannel)}
            className={cn(inputClass, 'appearance-none')}
          >
            {CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {CHANNEL_LABEL[ch]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Given at" hint="Optional">
          <input
            type="datetime-local"
            value={givenAt}
            max={new Date().toISOString().slice(0, 16)}
            onChange={(e) => setGivenAt(e.target.value)}
            className={cn(inputClass, '[color-scheme:dark]')}
          />
        </Field>
      </div>
      <Field label="What was said">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="The words, as close to verbatim as the source allows."
          className={cn(inputClass, 'resize-y leading-relaxed')}
        />
      </Field>
      {c.evidence.length > 0 && (
        <Field label="Taken from" hint="Optional: the original it appears in">
          <select
            value={evidenceId}
            onChange={(e) => setEvidenceId(e.target.value)}
            className={cn(inputClass, 'appearance-none')}
          >
            <option value="">—</option>
            {c.evidence.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label ?? e.title} · {e.ref}
              </option>
            ))}
          </select>
        </Field>
      )}
      <FormActions
        pending={pending}
        label="Record statement"
        onCancel={onCancel}
        disabled={!valid}
      />
    </form>
  )
}

export function StatementsPanel({ c }: { c: CaseDetail }) {
  const { canEdit } = useAssessmentAccess(c)
  const { run, pending } = useRun(c.id)
  const [adding, setAdding] = useState(false)
  const statements = c.statements ?? []

  return (
    <Panel
      title="Statements"
      icon={MessageSquareQuote}
      actions={
        <>
          <span className="num text-[11.5px] text-ink-faint">{statements.length}</span>
          {canEdit && !adding && (
            <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
              Record statement
            </Button>
          )}
        </>
      }
      bodyClassName="p-0"
    >
      {adding && (
        <div className="border-b border-line-soft px-4 py-4">
          <StatementForm
            c={c}
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) =>
              run({ kind: 'statement', input }, 'Statement recorded', () => setAdding(false))
            }
          />
        </div>
      )}
      {statements.length === 0 && !adding ? (
        <p className="px-4 py-5 text-[12px] text-ink-faint">
          No statements yet. Record what officials, witnesses or the press said, and cite them from
          findings and claims.
        </p>
      ) : (
        <ol className="divide-y divide-line-soft">
          {statements.map((s, i) => {
            const e = s.evidenceId ? c.evidence.find((x) => x.id === s.evidenceId) : undefined
            return (
              <li key={s.id} className="flex gap-4 px-4 py-3.5">
                <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-tint/[0.04] font-mono text-[11px] text-ink-muted ring-1 ring-tint/[0.06]">
                  S{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13px] font-medium text-ink">{s.speaker}</span>
                    {s.speakerRole && (
                      <span className="text-[12px] text-ink-muted">{s.speakerRole}</span>
                    )}
                    <Badge tone="neutral">{CHANNEL_LABEL[s.channel]}</Badge>
                  </div>
                  <blockquote className="mt-1.5 border-l-2 border-line-strong pl-3 text-[13px] leading-relaxed text-ink-2">
                    {s.text}
                  </blockquote>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-faint">
                    {s.givenAt && <span>Given {dateTime(s.givenAt)}</span>}
                    {e && <Chip title={e.link}>{`${e.label ?? e.title} · ${e.ref}`}</Chip>}
                    <span className="ml-auto">
                      Recorded by {s.recordedBy} · {dateTime(s.recordedAt)}
                    </span>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}

// ---------------------------------------------------------------- claims

const OUTCOMES: { value: ClaimOutcome; label: string }[] = [
  { value: 'supported', label: 'Supported' },
  { value: 'contradicted', label: 'Contradicted' },
  { value: 'inconclusive', label: 'Inconclusive' },
]

function ClaimForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean
  onCancel: () => void
  onSubmit: (input: { text: string; attributedTo: string }) => void
}) {
  const [text, setText] = useState('')
  const [attributedTo, setAttributedTo] = useState('')
  const valid = text.trim().length > 0 && attributedTo.trim().length > 0
  return (
    <form
      className="space-y-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ text: text.trim(), attributedTo: attributedTo.trim() })
      }}
    >
      <Field label="Claim">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          autoFocus
          placeholder="What is being claimed, in its own words."
          className={cn(inputClass, 'resize-y leading-relaxed')}
        />
      </Field>
      <Field label="Attributed to">
        <input
          value={attributedTo}
          onChange={(e) => setAttributedTo(e.target.value)}
          maxLength={200}
          placeholder="e.g. Viral WhatsApp message, a named official"
          className={inputClass}
        />
      </Field>
      <FormActions pending={pending} label="Record claim" onCancel={onCancel} disabled={!valid} />
    </form>
  )
}

function OutcomeForm({
  c,
  claim,
  pending,
  onCancel,
  onSubmit,
}: {
  c: CaseDetail
  claim: Claim
  pending: boolean
  onCancel: () => void
  onSubmit: (input: {
    outcome: ClaimOutcome
    rationale: string
    evidenceIds: string[]
    statementIds: string[]
  }) => void
}) {
  const [outcome, setOutcome] = useState<ClaimOutcome>(
    claim.outcome === 'unassessed' ? 'inconclusive' : claim.outcome,
  )
  const [rationale, setRationale] = useState(claim.rationale ?? '')
  const [cites, setCites] = useState({
    evidenceIds: claim.evidenceIds ?? [],
    statementIds: claim.statementIds ?? [],
  })
  const needsSupport =
    (outcome === 'supported' || outcome === 'contradicted') &&
    cites.evidenceIds.length === 0 &&
    cites.statementIds.length === 0
  const valid = rationale.trim().length > 0 && !needsSupport
  return (
    <form
      className="mt-3 space-y-3.5 rounded-lg border border-line bg-canvas/50 p-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onSubmit({ outcome, rationale: rationale.trim(), ...cites })
      }}
    >
      <Segmented label="Outcome" value={outcome} onChange={setOutcome} options={OUTCOMES} />
      <Field label="Rationale">
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          maxLength={4000}
          autoFocus
          placeholder="Why this outcome."
          className={cn(inputClass, 'resize-y leading-relaxed')}
        />
      </Field>
      <div>
        <span className="eyebrow mb-1.5 block">
          {outcome === 'contradicted'
            ? 'Contradicted by'
            : outcome === 'supported'
              ? 'Supported by'
              : 'Cites'}
        </span>
        <CitePicker
          evidence={c.evidence}
          statements={c.statements ?? []}
          {...cites}
          onChange={setCites}
        />
        {needsSupport && (
          <p className="mt-2 text-[11.5px] text-amber">
            A claim is {outcome} by something: cite an original or a statement.
          </p>
        )}
      </div>
      <FormActions pending={pending} label="Save outcome" onCancel={onCancel} disabled={!valid} />
    </form>
  )
}

export function ClaimsPanel({ c }: { c: CaseDetail }) {
  const { canEdit } = useAssessmentAccess(c)
  const { run, pending } = useRun(c.id)
  const [adding, setAdding] = useState(false)
  const [assessingId, setAssessingId] = useState<string | null>(null)

  return (
    <Panel
      title="Claims"
      icon={Quote}
      actions={
        <>
          <span className="num text-[11.5px] text-ink-faint">{c.claims.length}</span>
          {canEdit && !adding && (
            <Button variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
              Record claim
            </Button>
          )}
        </>
      }
      bodyClassName="p-0"
    >
      {adding && (
        <div className="border-b border-line-soft px-4 py-4">
          <ClaimForm
            pending={pending}
            onCancel={() => setAdding(false)}
            onSubmit={(input) =>
              run({ kind: 'claim', input }, 'Claim recorded', () => setAdding(false))
            }
          />
        </div>
      )}
      {c.claims.length === 0 && !adding ? (
        <p className="px-4 py-5 text-[12px] text-ink-faint">
          No claims yet. Record what is being said publicly, then assess it against the evidence.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {c.claims.map((cl) => (
            <li key={cl.id} className="px-4 py-3.5">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">“{cl.text}”</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    Attributed to {cl.attributedTo}
                  </p>
                </div>
                <Badge tone={outcomeTone[cl.outcome]} className="capitalize">
                  {cl.outcome}
                </Badge>
              </div>
              {cl.rationale && (
                <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
                  <Scale
                    size={12}
                    className="mr-1 inline -translate-y-px text-ink-faint"
                    aria-hidden
                  />
                  {cl.rationale}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Citations c={c} evidenceIds={cl.evidenceIds} statementIds={cl.statementIds} />
                {cl.outcomeSetBy && (
                  <span className="text-[11px] text-ink-faint">Assessed by {cl.outcomeSetBy}</span>
                )}
                {canEdit && assessingId !== cl.id && (
                  <Button
                    variant="ghost"
                    size="xs"
                    className="ml-auto"
                    onClick={() => setAssessingId(cl.id)}
                  >
                    {cl.outcome === 'unassessed' ? 'Assess' : 'Change outcome'}
                  </Button>
                )}
              </div>
              {assessingId === cl.id && (
                <OutcomeForm
                  c={c}
                  claim={cl}
                  pending={pending}
                  onCancel={() => setAssessingId(null)}
                  onSubmit={(input) =>
                    run({ kind: 'outcome', claimId: cl.id, input }, 'Claim assessed', () =>
                      setAssessingId(null),
                    )
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
