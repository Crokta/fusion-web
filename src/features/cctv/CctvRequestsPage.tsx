import { Ban, Cctv, CheckCircle2, Clock3, FilePen, Plus, Send, ShieldAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ApiError, describeError } from '@/api'
import {
  useCases,
  useCctvCameras,
  useCctvLawfulBases,
  useCctvRequest,
  useCctvRequests,
  useSaveCctvRequest,
  useSubmitCctvRequest,
} from '@/api/queries'
import {
  ROLE_LABEL,
  type Approval,
  type ApprovalStep,
  type CctvRequest,
  type CctvRequestInput,
  type CctvRequestStatus,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { Drawer } from '@/components/Overlay'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Panel,
  Segmented,
  SkeletonRows,
  type Tone,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, since } from '@/lib/format'

const STATUS: Record<CctvRequestStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  refused: { label: 'Refused', tone: 'red' },
  expired: { label: 'Expired', tone: 'neutral' },
}

type Filter = CctvRequestStatus | 'all'
const FILTERS: Filter[] = ['all', 'draft', 'awaiting_approval', 'approved', 'refused', 'expired']

const MAX_HOURS = 24

/** A datetime-local value (local time, minutes) for an ISO instant. */
const toLocal = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : undefined)
const lines = (v: string) =>
  v
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean)

const windowLabel = (r: Pick<CctvRequest, 'windowStart' | 'windowEnd'>) =>
  r.windowStart && r.windowEnd ? `${dateTime(r.windowStart)} – ${dateTime(r.windowEnd)}` : '—'

/**
 * CCTV requests (architecture §7.5, ADR 0014). An analyst drafts a request on a case — the lawful
 * basis, cameras, a window of at most 24 hours and why — then submits it to governance's
 * CCTV_SEARCH gate: the Centre Lead, then an Evidence Officer. It ends approved, refused or
 * expired, and a refusal says why. Retrieving footage is deferred (E41).
 */
export function CctvRequestsPage() {
  const { activeRole } = useAuth()
  const allowed = can.requestCctv(activeRole)
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | 'new' | null>(null)

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Intelligence"
        title="CCTV requests"
        description="Ask for CCTV footage on a case. Each request needs a lawful basis, the cameras, a window of at most 24 hours and a reason, and is approved by the Centre Lead and then an Evidence Officer. Faces are never searched, and no photos or files can be attached."
        actions={
          allowed ? (
            <Button variant="primary" icon={Plus} onClick={() => setOpen('new')}>
              New request
            </Button>
          ) : undefined
        }
      />
      {allowed ? (
        <>
          <Segmented
            label="Status"
            className="mb-3"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((f) => ({
              value: f,
              label: f === 'all' ? 'All' : STATUS[f].label,
            }))}
          />
          <RequestList filter={filter} onOpen={setOpen} />
          <RequestDrawer id={open} onClose={() => setOpen(null)} onCreated={setOpen} />
        </>
      ) : (
        <Panel>
          <EmptyState icon={ShieldAlert} title="Your role cannot request CCTV footage">
            Switch to the analyst or supervisor role to draft and submit CCTV requests. Centre Leads
            and Evidence Officers decide them on the Approvals screen.
          </EmptyState>
        </Panel>
      )}
    </div>
  )
}

function RequestList({ filter, onOpen }: { filter: Filter; onOpen: (id: string) => void }) {
  const list = useCctvRequests(filter === 'all' ? undefined : filter)
  const items = list.data?.items ?? []
  return (
    <Panel title="Requests" icon={Cctv} bodyClassName="p-0">
      {list.isPending ? (
        <SkeletonRows rows={4} />
      ) : list.isError ? (
        <ErrorNotice error={list.error} onRetry={() => list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Cctv} title="No requests">
          {filter === 'all'
            ? 'Start a request with New request. Nothing goes for approval until you submit it.'
            : `No requests are ${STATUS[filter].label.toLowerCase()}.`}
        </EmptyState>
      ) : (
        <ul>
          {items.map((r) => (
            <li key={r.id} className="border-b border-line-soft last:border-0">
              <button
                type="button"
                onClick={() => onOpen(r.id)}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-tint/[0.03]"
              >
                <Badge tone={STATUS[r.status].tone} className="w-36 justify-center">
                  {STATUS[r.status].label}
                </Badge>
                <span className="num w-36 shrink-0 truncate text-[12.5px] font-medium text-ink">
                  {r.caseRef ?? r.caseId.slice(0, 8)}
                </span>
                <span className="min-w-0 flex-1 basis-48 truncate text-[12.5px] text-ink-2">
                  {r.cameras.length > 0
                    ? `${r.cameras.length} camera${r.cameras.length === 1 ? '' : 's'}`
                    : 'No cameras yet'}
                  {r.location && ` · ${r.location}`}
                  <span className="text-ink-faint"> · {windowLabel(r)}</span>
                </span>
                {r.refusal && (
                  <span className="hidden max-w-64 truncate text-[11.5px] text-red md:block">
                    {r.refusal}
                  </span>
                )}
                <span className="text-[11px] text-ink-faint">
                  {r.requesterName} · {since(r.submittedAt ?? r.requestedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RequestDrawer({
  id,
  onClose,
  onCreated,
}: {
  id: string | 'new' | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { user } = useAuth()
  const found = useCctvRequest(id && id !== 'new' ? id : undefined)
  const request = found.data?.request
  const editable = id === 'new' || (request?.status === 'draft' && request.requesterId === user?.id)

  return (
    <Drawer
      open={id !== null}
      onClose={onClose}
      title={id === 'new' ? 'New CCTV request' : `CCTV request · ${request?.caseRef ?? '…'}`}
      eyebrow={
        request && <Badge tone={STATUS[request.status].tone}>{STATUS[request.status].label}</Badge>
      }
    >
      {id !== 'new' && found.isPending ? (
        <SkeletonRows rows={6} />
      ) : id !== 'new' && found.isError ? (
        <ErrorNotice error={found.error} onRetry={() => found.refetch()} />
      ) : editable ? (
        // Keyed by id, not ETag: a save refreshes the request without wiping what is being typed.
        <RequestForm key={request?.id ?? 'new'} request={request} onCreated={onCreated} />
      ) : request ? (
        <RequestView request={request} approval={found.data?.approval} />
      ) : null}
    </Drawer>
  )
}

const emptyInput: CctvRequestInput = { cameras: [], attributes: [] }

function RequestForm({
  request,
  onCreated,
}: {
  request?: CctvRequest
  onCreated: (id: string) => void
}) {
  const toast = useToast()
  const cases = useCases('active')
  const cameras = useCctvCameras()
  const bases = useCctvLawfulBases()
  const save = useSaveCctvRequest()
  const submit = useSubmitCctvRequest()
  const start = request ?? { ...emptyInput, caseId: '' }

  const [caseId, setCaseId] = useState(start.caseId)
  const [lawfulBasis, setLawfulBasis] = useState(start.lawfulBasis ?? '')
  const [legalReference, setLegalReference] = useState(start.legalReference ?? '')
  const [reason, setReason] = useState(start.reason ?? '')
  const [chosen, setChosen] = useState<string[]>(start.cameras)
  const [typedCameras, setTypedCameras] = useState(start.cameras.join('\n'))
  const [location, setLocation] = useState(start.location ?? '')
  const [windowStart, setWindowStart] = useState(toLocal(start.windowStart))
  const [windowEnd, setWindowEnd] = useState(toLocal(start.windowEnd))
  const [attributes, setAttributes] = useState(start.attributes.join('\n'))
  const [freeText, setFreeText] = useState(start.freeText ?? '')

  const configured = cameras.data ?? []
  const input = (): CctvRequestInput => ({
    cameras: configured.length > 0 ? chosen : lines(typedCameras),
    location: location.trim() || undefined,
    windowStart: fromLocal(windowStart),
    windowEnd: fromLocal(windowEnd),
    attributes: lines(attributes),
    freeText: freeText.trim() || undefined,
    lawfulBasis: lawfulBasis || undefined,
    legalReference: legalReference.trim() || undefined,
    reason: reason.trim() || undefined,
  })

  const failure = submit.error ?? save.error
  const errors = failure instanceof ApiError ? (failure.problem.errors ?? {}) : {}
  const err = (field: string) =>
    errors[field]?.length ? <span className="text-red">{errors[field].join(' ')}</span> : undefined

  const hours =
    windowStart && windowEnd ? (Date.parse(windowEnd) - Date.parse(windowStart)) / 3600_000 : null

  const saveDraft = (then?: (r: CctvRequest) => void) => {
    submit.reset()
    save.mutate(
      { id: request?.id, caseId, input: input(), etag: request?.etag },
      {
        onSuccess: (r) => {
          if (then) return then(r)
          toast({
            title: 'Draft saved',
            detail: 'Nothing goes for approval until you submit it.',
            tone: 'success',
          })
          if (!request) onCreated(r.id)
        },
      },
    )
  }

  // Saves what is on screen first, then submits that version. A new request opens as itself
  // only afterwards, so this form stays mounted until the answer is in.
  const send = () =>
    saveDraft((saved) => {
      submit.mutate(
        { id: saved.id, etag: saved.etag },
        {
          onSuccess: () =>
            toast({
              title: 'Sent for approval',
              detail: 'The Centre Lead decides first, then an Evidence Officer.',
              tone: 'success',
            }),
          onError: (e) => toast({ title: 'Not sent', detail: describeError(e), tone: 'error' }),
          onSettled: () => {
            if (!request) onCreated(saved.id)
          },
        },
      )
    })

  return (
    <div className="space-y-4">
      <Field label="Case" hint={err('caseId')}>
        <select
          className={inputClass}
          value={caseId}
          disabled={!!request}
          onChange={(e) => setCaseId(e.target.value)}
        >
          <option value="">Choose a case…</option>
          {(cases.data?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.ref} · {c.title}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="eyebrow px-1">Lawful basis</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Basis" hint={err('lawfulBasis')}>
            <select
              className={inputClass}
              value={lawfulBasis}
              onChange={(e) => setLawfulBasis(e.target.value)}
            >
              <option value="">Choose…</option>
              {(bases.data ?? []).map((b) => (
                <option key={b.code} value={b.code}>
                  {b.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Authority reference"
            hint={err('legalReference') ?? 'Optional, e.g. the directive or warrant.'}
          >
            <input
              className={inputClass}
              value={legalReference}
              maxLength={200}
              placeholder="Directive CCTV/2026/07"
              onChange={(e) => setLegalReference(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Reason"
          hint={err('reason') ?? 'Why the footage is needed. The approvers read this.'}
        >
          <textarea
            className={cn(inputClass, 'min-h-20')}
            value={reason}
            maxLength={1500}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-line p-3">
        <legend className="eyebrow px-1">Scope</legend>
        <Field
          label="Cameras"
          hint={
            err('cameras') ??
            (configured.length > 0
              ? undefined
              : 'No cameras are configured yet: one name per line.')
          }
        >
          {configured.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {configured.map((c) => {
                const on = chosen.includes(c)
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChosen(on ? chosen.filter((x) => x !== c) : [...chosen, c])}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[12px]',
                      on ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-line text-ink-muted',
                    )}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          ) : (
            <textarea
              className={cn(inputClass, 'min-h-16')}
              value={typedCameras}
              onChange={(e) => setTypedCameras(e.target.value)}
            />
          )}
        </Field>
        <Field label="Location" hint="Optional: where the cameras are.">
          <input
            className={inputClass}
            value={location}
            maxLength={500}
            onChange={(e) => setLocation(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" hint={err('windowStart')}>
            <input
              type="datetime-local"
              className={inputClass}
              value={windowStart}
              onChange={(e) => setWindowStart(e.target.value)}
            />
          </Field>
          <Field
            label="To"
            hint={
              err('windowEnd') ?? (
                <span
                  className={cn(
                    hours !== null && (hours <= 0 || hours > MAX_HOURS) && 'text-amber',
                  )}
                >
                  {hours === null
                    ? `At most ${MAX_HOURS} hours.`
                    : `${Math.round(hours * 10) / 10} of at most ${MAX_HOURS} hours.`}
                </span>
              )
            }
          >
            <input
              type="datetime-local"
              className={inputClass}
              value={windowEnd}
              onChange={(e) => setWindowEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="What to look for"
          hint={err('attributes') ?? 'One per line: clothing, a bag, a vehicle. Never faces.'}
        >
          <textarea
            className={cn(inputClass, 'min-h-16')}
            value={attributes}
            placeholder={'red jacket\ncarrying a black bag'}
            onChange={(e) => setAttributes(e.target.value)}
          />
        </Field>
        <Field
          label="Notes"
          hint={
            err('freeText') ?? 'Optional. Describe what to look for; photos cannot be attached.'
          }
        >
          <textarea
            className={cn(inputClass, 'min-h-16')}
            value={freeText}
            maxLength={2000}
            onChange={(e) => setFreeText(e.target.value)}
          />
        </Field>
      </fieldset>

      {failure && <p className="text-[12px] text-red">{describeError(failure)}</p>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-4">
        <Button
          icon={FilePen}
          loading={save.isPending && !submit.isPending}
          disabled={!caseId}
          onClick={() => saveDraft()}
        >
          Save draft
        </Button>
        <Button
          variant="primary"
          icon={Send}
          loading={submit.isPending}
          disabled={!caseId || save.isPending}
          onClick={send}
        >
          Submit for approval
        </Button>
      </div>
    </div>
  )
}

const stepRoleLabel = (r: ApprovalStep['role']) =>
  r === 'evidence_officer' ? 'Evidence Officer' : ROLE_LABEL[r]

function RequestView({ request: r, approval }: { request: CctvRequest; approval?: Approval }) {
  const bases = useCctvLawfulBases()
  const basis = bases.data?.find((b) => b.code === r.lawfulBasis)?.label ?? r.lawfulBasis
  const refusedBy = approval?.steps.find((s) => s.decision === 'refuse')
  return (
    <div className="space-y-5">
      {r.status === 'refused' && (
        <div
          role="alert"
          className="rounded-md border border-red/30 bg-red/[0.06] px-3 py-2.5 text-[12.5px] text-red"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <Ban size={14} /> {r.refusal}
          </div>
          {refusedBy?.comment && (
            <p className="mt-1 text-ink-2">
              {refusedBy.decidedBy} ({stepRoleLabel(refusedBy.role)}): “{refusedBy.comment}”
            </p>
          )}
          {r.decidedAt && (
            <p className="mt-1 text-[11px] text-ink-faint">{dateTime(r.decidedAt)}</p>
          )}
        </div>
      )}
      {r.status === 'approved' && (
        <p className="flex items-start gap-1.5 rounded-md border border-green/30 bg-green/[0.06] px-3 py-2.5 text-[12.5px] text-green">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
          Approved. The approval is valid for 24 hours; retrieving footage is not available in the
          pilot.
        </p>
      )}
      {r.status === 'expired' && (
        <p className="flex items-start gap-1.5 rounded-md border border-line bg-tint/[0.03] px-3 py-2.5 text-[12.5px] text-ink-muted">
          <Clock3 size={14} className="mt-0.5 shrink-0" />
          Expired: the approval lapsed before it was used, or was not decided in time. Start a new
          request if the footage is still needed.
        </p>
      )}

      {approval && (
        <section>
          <h3 className="eyebrow mb-2">Approval</h3>
          <ol className="grid gap-2 sm:grid-cols-2">
            {approval.steps.map((s, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-md border px-3 py-2 text-[12px]',
                  s.decision === 'approve' && 'border-green/35 bg-green/[0.05]',
                  s.decision === 'refuse' && 'border-red/35 bg-red/[0.05]',
                  !s.decision && 'border-line bg-canvas/40',
                )}
              >
                <div className="eyebrow text-[9px]">Step {i + 1}</div>
                <div className="font-medium text-ink">{stepRoleLabel(s.role)}</div>
                <div className="mt-0.5 text-ink-muted">
                  {s.decision
                    ? `${s.decision === 'approve' ? 'Approved' : 'Refused'} by ${s.decidedBy}${s.decidedAt ? ` · ${dateTime(s.decidedAt)}` : ''}`
                    : approval.status === 'pending'
                      ? 'Waiting'
                      : 'Not reached'}
                </div>
                {s.comment && <p className="mt-1 text-ink-2">“{s.comment}”</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-2">
        <Item label="Case">{r.caseRef ?? r.caseId}</Item>
        <Item label="Requested by">
          {r.requesterName} · {dateTime(r.submittedAt ?? r.requestedAt)}
        </Item>
        <Item label="Lawful basis">
          {basis ?? '—'}
          {r.legalReference && ` (${r.legalReference})`}
        </Item>
        <Item label="Window">{windowLabel(r)}</Item>
        <Item label="Cameras">{r.cameras.join(', ') || '—'}</Item>
        <Item label="Location">{r.location ?? '—'}</Item>
        <Item label="Reason" wide>
          {r.reason ?? '—'}
        </Item>
        <Item label="What to look for" wide>
          {r.attributes.join(', ') || '—'}
        </Item>
        {r.freeText && (
          <Item label="Notes" wide>
            {r.freeText}
          </Item>
        )}
      </dl>
    </div>
  )
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'sm:col-span-2')}>
      <dt className="eyebrow mb-0.5">{label}</dt>
      <dd className="whitespace-pre-wrap text-ink-2">{children}</dd>
    </div>
  )
}
