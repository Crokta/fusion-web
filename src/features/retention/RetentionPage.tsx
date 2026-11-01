import {
  Download,
  FileCheck2,
  Hourglass,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { describeError } from '@/api'
import {
  useDisposalCertificate,
  useDisposalCertificates,
  useDisposals,
  useExecuteDisposal,
  useIntegrityRun,
  useIntegrityRuns,
  useLegalHold,
  useRequestDisposal,
  useRetention,
  useRetentionClasses,
  useStartIntegrityRun,
} from '@/api/queries'
import type {
  Disposal,
  DisposalStatus,
  IntegrityOutcome,
  RetentionItem,
  RetentionListView,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { Drawer, Modal } from '@/components/Overlay'
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
import { dateTime, since } from '@/lib/format'

type Tab = RetentionListView | 'disposals' | 'certificates' | 'integrity'

const TABS: { value: Tab; label: string }[] = [
  { value: 'due', label: 'Due' },
  { value: 'upcoming', label: 'Due within 14 days' },
  { value: 'held', label: 'Legal holds' },
  { value: 'all', label: 'All kept' },
  { value: 'disposals', label: 'Disposals' },
  { value: 'certificates', label: 'Certificates' },
  { value: 'integrity', label: 'Integrity checks' },
]

const DISPOSAL: Record<DisposalStatus, { label: string; tone: Tone }> = {
  awaiting_approval: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'cyan' },
  rejected: { label: 'Refused', tone: 'red' },
  expired: { label: 'Lapsed', tone: 'neutral' },
  completed: { label: 'Destroyed', tone: 'green' },
}

const OUTCOME: Record<IntegrityOutcome, { label: string; tone: Tone }> = {
  passed: { label: 'Matches', tone: 'green' },
  hash_mismatch: { label: 'Hash differs', tone: 'red' },
  missing: { label: 'Missing', tone: 'red' },
  timestamp_invalid: { label: 'Timestamp fails', tone: 'red' },
  unreachable: { label: 'Not reached', tone: 'amber' },
}

const short = (id: string) => id.slice(-8)
const bytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1024 ** 2
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 ** 2).toFixed(1)} MB`
const day = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—'

/**
 * Retention and disposal (architecture §5.3; ADR 0021). Each original is kept for its class's
 * period and never before the store's object lock lets go. Due originals are proposed for
 * disposal through governance's gate (Evidence officer, then Centre lead); once approved, they
 * are destroyed and a hashed certificate records what, when, by whom and under which approval.
 * Legal holds stop all of it. The nightly integrity sample's runs are kept here too.
 */
export function RetentionPage() {
  const { activeRole } = useAuth()
  const [tab, setTab] = useState<Tab>('due')

  if (!can.custodyEvidence(activeRole))
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader eyebrow="Governance" title="Retention" />
        <Panel>
          <EmptyState icon={ShieldAlert} title="Your role does not look after evidence custody">
            Retention, legal holds, disposal and integrity checks are for Evidence officers and the
            Centre lead.
          </EmptyState>
        </Panel>
      </div>
    )

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Governance"
        title="Retention"
        description="Originals are kept for their class's period, and never before the store's lock lets go. Due originals are destroyed only after an Evidence officer and the Centre lead approve, and each destruction gets a hashed certificate. A legal hold stops all of it."
      />
      <ClassesNotice />
      <Segmented label="View" className="mb-3" value={tab} onChange={setTab} options={TABS} />
      {tab === 'disposals' ? (
        <DisposalsTab />
      ) : tab === 'certificates' ? (
        <CertificatesTab />
      ) : tab === 'integrity' ? (
        <IntegrityTab />
      ) : (
        <RetentionTab key={tab} view={tab} />
      )}
    </div>
  )
}

function ClassesNotice() {
  const classes = useRetentionClasses()
  const list = classes.data ?? []
  if (list.length === 0) return null
  const placeholder = list.some((c) => c.placeholder)
  return (
    <Panel className="mb-4" bodyClassName="px-4 py-3">
      {placeholder && (
        <p className="mb-2 text-[12.5px] text-amber">
          The retention periods are placeholders until the client decides them. Dates worked out
          from them are marked “Placeholder period”.
        </p>
      )}
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-ink-muted">
        {list.map((c) => (
          <li key={c.name}>
            <span className="font-medium text-ink-2">{c.label}</span> ({c.name}):{' '}
            {c.days === null ? 'kept until a period is set' : `${c.days} days`}
            {c.placeholder && ' · placeholder'}
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function RetentionTab({ view }: { view: RetentionListView }) {
  const { activeRole } = useAuth()
  const list = useRetention(view)
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState<RetentionItem | null>(null)
  const [proposing, setProposing] = useState(false)
  const items = list.data?.items ?? []
  const choosable = view === 'due'
  const free = items.filter((i) => i.schedule.due && !i.schedule.disposalId)

  return (
    <>
      <Panel
        title={TABS.find((t) => t.value === view)?.label}
        icon={Hourglass}
        bodyClassName="p-0"
        actions={
          choosable && free.length > 0 ? (
            can.proposeDisposal(activeRole) ? (
              <Button
                variant="primary"
                icon={Trash2}
                disabled={selected.length === 0}
                onClick={() => setProposing(true)}
              >
                Propose disposal{selected.length > 0 && ` (${selected.length})`}
              </Button>
            ) : (
              <span className="text-[11.5px] text-ink-faint">
                The Centre lead proposes disposals; you approve them on Approvals.
              </span>
            )
          ) : undefined
        }
      >
        {list.isPending ? (
          <SkeletonRows rows={5} />
        ) : list.isError ? (
          <ErrorNotice error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={Hourglass} title="Nothing here">
            {view === 'due'
              ? 'No original is past both its retention period and its lock.'
              : view === 'upcoming'
                ? 'No original falls due in the next 14 days.'
                : view === 'held'
                  ? 'No original is under a legal hold.'
                  : 'No originals are kept yet.'}
          </EmptyState>
        ) : (
          <ul>
            {items.map((i) => {
              const s = i.schedule
              const canChoose =
                choosable && can.proposeDisposal(activeRole) && s.due && !s.disposalId
              return (
                <li
                  key={s.evidenceId}
                  className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-0"
                >
                  {choosable && (
                    <input
                      type="checkbox"
                      aria-label={`Choose original ${short(s.evidenceId)}`}
                      disabled={!canChoose}
                      checked={selected.includes(s.evidenceId)}
                      onChange={(e) =>
                        setSelected((cur) =>
                          e.target.checked
                            ? [...cur, s.evidenceId]
                            : cur.filter((x) => x !== s.evidenceId),
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
                  >
                    <span className="num w-20 shrink-0 text-[12.5px] font-medium text-ink">
                      {short(s.evidenceId)}
                    </span>
                    <span className="min-w-0 flex-1 basis-48 truncate text-[12.5px] text-ink-2">
                      {i.role ?? 'original'} · {i.contentType.split(';')[0]} · {bytes(i.sizeBytes)}
                    </span>
                    <Badge tone="neutral">{s.classLabel}</Badge>
                    {s.placeholder && <Badge tone="amber">Placeholder period</Badge>}
                    {s.legalHold && <Badge tone="violet">Legal hold</Badge>}
                    {s.disposalId && <Badge tone="cyan">In a disposal</Badge>}
                    <span className="w-40 text-right text-[11.5px] text-ink-faint">
                      {s.dueAt ? `Due ${day(s.dueAt)}` : 'No period: kept'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <ItemDrawer item={open} onClose={() => setOpen(null)} />
      <ProposeModal
        open={proposing}
        ids={selected}
        onClose={() => setProposing(false)}
        onDone={() => {
          setProposing(false)
          setSelected([])
        }}
      />
    </>
  )
}

function ItemDrawer({ item, onClose }: { item: RetentionItem | null; onClose: () => void }) {
  const s = item?.schedule
  return (
    <Drawer
      open={!!item}
      onClose={onClose}
      title={s ? `Original ${short(s.evidenceId)}` : ''}
      eyebrow={s && <Badge tone={s.due ? 'amber' : 'neutral'}>{s.due ? 'Due' : 'Kept'}</Badge>}
    >
      {item && s && (
        <div className="space-y-5">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-[12.5px]">
            <Row label="Class">
              {s.classLabel} ({s.retentionClass})
              {s.placeholder && <span className="text-amber"> · placeholder period</span>}
            </Row>
            <Row label="Counted from">{dateTime(s.anchorAt)}</Row>
            <Row label="Retention ends">
              {s.expiresAt ? dateTime(s.expiresAt) : 'No period set'}
            </Row>
            <Row label="Store lock until">{dateTime(s.lockedUntil)}</Row>
            <Row label="Can be destroyed from">{s.dueAt ? dateTime(s.dueAt) : '—'}</Row>
            <Row label="SHA-256">
              <span className="num break-all">{item.sha256}</span>
            </Row>
            <Row label="Type and size">
              {item.contentType} · {bytes(item.sizeBytes)}
            </Row>
            {item.sourceUrl && <Row label="Source">{item.sourceUrl}</Row>}
            {s.caseId && <Row label="Case">{short(s.caseId)}</Row>}
            {s.disposalId && <Row label="Disposal">{short(s.disposalId)}</Row>}
          </dl>
          <HoldForm key={s.etag} item={item} />
        </div>
      )}
    </Drawer>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink-2">{children}</dd>
    </>
  )
}

function HoldForm({ item }: { item: RetentionItem }) {
  const toast = useToast()
  const hold = useLegalHold()
  const [reason, setReason] = useState('')
  const s = item.schedule
  const place = !s.legalHold
  return (
    <Panel title="Legal hold" icon={Lock}>
      {s.legalHold && (
        <p className="mb-3 text-[12.5px] text-ink-2">
          Held by {s.legalHoldBy ?? 'someone'} {s.legalHoldAt && since(s.legalHoldAt)}:{' '}
          {s.legalHoldReason}
        </p>
      )}
      <Field
        label={place ? 'Why it must be kept' : 'Why the hold can end'}
        hint="At least 10 characters. The store refuses to delete a held original, whoever asks."
      >
        <textarea
          className={inputClass}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="mt-3 flex justify-end">
        <Button
          variant={place ? 'primary' : 'secondary'}
          icon={place ? Lock : ShieldCheck}
          loading={hold.isPending}
          disabled={reason.trim().length < 10}
          onClick={() =>
            hold.mutate(
              { evidenceId: s.evidenceId, place, reason: reason.trim(), etag: s.etag },
              {
                onSuccess: () =>
                  toast({
                    title: place ? 'Legal hold placed' : 'Legal hold released',
                    detail: place
                      ? 'Nothing can dispose of this original until the hold is released.'
                      : 'It follows its retention period again.',
                    tone: 'success',
                  }),
                onError: (e) =>
                  toast({ title: 'Not changed', detail: describeError(e), tone: 'error' }),
              },
            )
          }
        >
          {place ? 'Place a legal hold' : 'Release the hold'}
        </Button>
      </div>
    </Panel>
  )
}

function ProposeModal({
  open,
  ids,
  onClose,
  onDone,
}: {
  open: boolean
  ids: string[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const request = useRequestDisposal()
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Propose disposal of ${ids.length} original${ids.length === 1 ? '' : 's'}`}
      description="This asks for approval. Nothing is destroyed until an Evidence officer and then a Centre lead other than you approve it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={request.isPending}
            disabled={reason.trim().length < 10}
            onClick={() =>
              request.mutate(
                { evidenceIds: ids, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast({
                      title: 'Sent for approval',
                      detail:
                        'An Evidence officer decides first, then a Centre lead, on Approvals.',
                      tone: 'success',
                    })
                    setReason('')
                    onDone()
                  },
                  onError: (e) =>
                    toast({ title: 'Not sent', detail: describeError(e), tone: 'error' }),
                },
              )
            }
          >
            Send for approval
          </Button>
        </>
      }
    >
      <Field
        label="Why"
        hint="At least 10 characters. Approvers read this; it goes on the certificate."
      >
        <textarea
          className={inputClass}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  )
}

function DisposalsTab() {
  const list = useDisposals()
  const [open, setOpen] = useState<string | null>(null)
  const items = list.data?.items ?? []
  const disposal = items.find((d) => d.id === open) ?? null
  return (
    <>
      <Panel title="Disposals" icon={Trash2} bodyClassName="p-0">
        {list.isPending ? (
          <SkeletonRows rows={4} />
        ) : list.isError ? (
          <ErrorNotice error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={Trash2} title="No disposals yet">
            The Centre lead proposes one from the Due list.
          </EmptyState>
        ) : (
          <ul>
            {items.map((d) => (
              <li key={d.id} className="border-b border-line-soft last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(d.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-tint/[0.03]"
                >
                  <Badge tone={DISPOSAL[d.status].tone} className="w-36 justify-center">
                    {DISPOSAL[d.status].label}
                  </Badge>
                  <span className="num w-20 text-[12.5px] font-medium text-ink">{short(d.id)}</span>
                  <span className="min-w-0 flex-1 basis-48 truncate text-[12.5px] text-ink-2">
                    {d.items.length} original{d.items.length === 1 ? '' : 's'} · {d.reason}
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {d.requesterName} · {since(d.requestedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <DisposalDrawer disposal={disposal} onClose={() => setOpen(null)} />
    </>
  )
}

function DisposalDrawer({ disposal, onClose }: { disposal: Disposal | null; onClose: () => void }) {
  const toast = useToast()
  const execute = useExecuteDisposal()
  const [confirming, setConfirming] = useState(false)
  const [certificate, setCertificate] = useState<string | null>(null)
  const d = disposal
  const pending = d?.items.filter((i) => i.status === 'pending').length ?? 0
  return (
    <Drawer
      open={!!d}
      onClose={onClose}
      title={d ? `Disposal ${short(d.id)}` : ''}
      eyebrow={d && <Badge tone={DISPOSAL[d.status].tone}>{DISPOSAL[d.status].label}</Badge>}
    >
      {d && (
        <div className="space-y-5">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-[12.5px]">
            <Row label="Why">{d.reason}</Row>
            <Row label="Proposed by">
              {d.requesterName}, {dateTime(d.requestedAt)}
            </Row>
            <Row label="Approval">
              {d.approvalId ? `${short(d.approvalId)} · Evidence officer, then Centre lead` : '—'}
              {d.settledAt && ` · settled ${dateTime(d.settledAt)}`}
            </Row>
          </dl>
          {d.status === 'awaiting_approval' && (
            <p className="text-[12.5px] text-amber">
              Waiting on Approvals. Nothing is destroyed before both steps approve.
            </p>
          )}
          <Panel title="Originals" bodyClassName="p-0">
            <ul>
              {d.items.map((i) => (
                <li
                  key={i.evidenceId}
                  className="flex flex-wrap items-center gap-x-3 border-b border-line-soft px-4 py-2 text-[12.5px] last:border-0"
                >
                  <span className="num w-20 text-ink">{short(i.evidenceId)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">
                    {i.contentType.split(';')[0]} · {bytes(i.sizeBytes)} · {i.retentionClass}
                  </span>
                  {i.status === 'disposed' ? (
                    <button
                      type="button"
                      className="text-[11.5px] text-cyan hover:underline"
                      onClick={() => setCertificate(i.certificateId ?? null)}
                    >
                      Destroyed · certificate
                    </button>
                  ) : (
                    <Badge tone="neutral">Kept</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
          {d.status === 'approved' && pending > 0 && (
            <div className="flex justify-end">
              <Button variant="danger" icon={Trash2} onClick={() => setConfirming(true)}>
                Destroy {pending} original{pending === 1 ? '' : 's'}
              </Button>
            </div>
          )}
        </div>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Destroy these originals?"
        description="Each one is permanently deleted from the evidence store, if its lock has run out and no legal hold stands. This cannot be undone. A hashed certificate records it."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={execute.isPending}
              onClick={() =>
                d &&
                execute.mutate(
                  { id: d.id, etag: d.etag },
                  {
                    onSuccess: (r) => {
                      setConfirming(false)
                      toast({
                        title: `${r.disposed.length} destroyed`,
                        detail:
                          r.blocked.length > 0
                            ? `${r.blocked.length} kept: ${r.blocked.map((b) => b.message).join(' ')}`
                            : 'The certificate records it.',
                        tone: 'success',
                      })
                      if (r.certificateId) setCertificate(r.certificateId)
                    },
                    onError: (e) => {
                      setConfirming(false)
                      toast({ title: 'Nothing destroyed', detail: describeError(e), tone: 'error' })
                    },
                  },
                )
              }
            >
              Destroy
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-ink-muted">You will be named on the certificate.</p>
      </Modal>
      <CertificateDrawer id={certificate} onClose={() => setCertificate(null)} />
    </Drawer>
  )
}

function CertificatesTab() {
  const list = useDisposalCertificates()
  const [open, setOpen] = useState<string | null>(null)
  const items = list.data?.items ?? []
  return (
    <>
      <Panel title="Disposal certificates" icon={FileCheck2} bodyClassName="p-0">
        {list.isPending ? (
          <SkeletonRows rows={4} />
        ) : list.isError ? (
          <ErrorNotice error={list.error} onRetry={() => list.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={FileCheck2} title="No certificates yet">
            A certificate is issued each time originals are destroyed.
          </EmptyState>
        ) : (
          <ul>
            {items.map((c) => (
              <li key={c.id} className="border-b border-line-soft last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(c.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-tint/[0.03]"
                >
                  <Badge tone={c.verified ? 'green' : 'red'} className="w-24 justify-center">
                    {c.verified ? 'Hash holds' : 'Hash fails'}
                  </Badge>
                  <span className="num w-20 text-[12.5px] font-medium text-ink">{short(c.id)}</span>
                  <span className="num min-w-0 flex-1 truncate text-[12px] text-ink-2">
                    {c.sha256}
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {c.itemCount} destroyed · {c.issuedByName} · {since(c.issuedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <CertificateDrawer id={open} onClose={() => setOpen(null)} />
    </>
  )
}

function CertificateDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const found = useDisposalCertificate(id ?? undefined)
  const c = found.data
  const pretty = (() => {
    try {
      return c ? JSON.stringify(JSON.parse(c.body), null, 2) : ''
    } catch {
      return c?.body ?? ''
    }
  })()
  const download = () => {
    if (!c) return
    // The exact bytes that were hashed, so anyone can check the SHA-256 themselves.
    const url = URL.createObjectURL(new Blob([c.body], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `disposal-certificate-${c.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={c ? `Certificate ${short(c.id)}` : 'Certificate'}
      eyebrow={
        c && (
          <Badge tone={c.verified ? 'green' : 'red'}>
            {c.verified ? 'Hash holds' : 'Hash does not hold'}
          </Badge>
        )
      }
      actions={
        c && (
          <Button icon={Download} onClick={download}>
            Download
          </Button>
        )
      }
    >
      {found.isPending && id ? (
        <SkeletonRows rows={5} />
      ) : found.isError ? (
        <ErrorNotice error={found.error} onRetry={() => found.refetch()} />
      ) : c ? (
        <div className="space-y-4">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-[12.5px]">
            <Row label="Destroyed by">
              {c.issuedByName}, {dateTime(c.issuedAt)}
            </Row>
            <Row label="Under approval">{c.approvalId}</Row>
            <Row label="Originals">{c.itemCount}</Row>
            <Row label="SHA-256">
              <span className="num break-all">{c.sha256}</span>
            </Row>
            <Row label="Previous certificate">
              <span className="num break-all">{c.previousSha256 ?? 'None: the first'}</span>
            </Row>
          </dl>
          <p className="text-[12px] text-ink-muted">
            The SHA-256 is over the certificate below exactly as stored (download it to check), and
            each certificate names the hash of the one before it.
          </p>
          <pre className="num max-h-96 overflow-auto rounded-md border border-line bg-canvas p-3 text-[11.5px] text-ink-2">
            {pretty}
          </pre>
        </div>
      ) : null}
    </Drawer>
  )
}

function IntegrityTab() {
  const toast = useToast()
  const runs = useIntegrityRuns()
  const start = useStartIntegrityRun()
  const [open, setOpen] = useState<string | null>(null)
  const items = runs.data?.items ?? []
  const run = (rate?: number) =>
    start.mutate(rate, {
      onSuccess: (d) => {
        setOpen(d.run.id)
        toast({
          title: d.run.failed > 0 ? `${d.run.failed} failed` : 'All checked originals match',
          detail: `${d.run.checked} re-hashed against their SHA-256 and timestamps.`,
          tone: d.run.failed > 0 ? 'error' : 'success',
        })
      },
      onError: (e) => toast({ title: 'Not run', detail: describeError(e), tone: 'error' }),
    })
  return (
    <>
      <Panel
        title="Integrity checks"
        icon={ShieldCheck}
        bodyClassName="p-0"
        actions={
          <>
            <Button icon={RefreshCw} loading={start.isPending} onClick={() => run()}>
              Check a sample now
            </Button>
            <Button loading={start.isPending} onClick={() => run(1)}>
              Re-hash everything
            </Button>
          </>
        }
      >
        <p className="border-b border-line-soft px-4 py-2 text-[12px] text-ink-muted">
          Every night a random 2% of originals are re-hashed and their RFC 3161 timestamps checked.
          A mismatch quarantines the original and raises a critical alert. Re-hash everything after
          a restore.
        </p>
        {runs.isPending ? (
          <SkeletonRows rows={4} />
        ) : runs.isError ? (
          <ErrorNotice error={runs.error} onRetry={() => runs.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No checks yet">
            The first nightly sample runs at 02:00 UTC.
          </EmptyState>
        ) : (
          <ul>
            {items.map((r) => (
              <li key={r.id} className="border-b border-line-soft last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(r.id)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-tint/[0.03]"
                >
                  <Badge
                    tone={r.failed > 0 ? 'red' : r.unreachable > 0 ? 'amber' : 'green'}
                    className="w-28 justify-center"
                  >
                    {r.failed > 0
                      ? `${r.failed} failed`
                      : r.unreachable > 0
                        ? 'Incomplete'
                        : 'All match'}
                  </Badge>
                  <span className="min-w-0 flex-1 text-[12.5px] text-ink-2">
                    {r.checked} checked · {Math.round(r.rate * 1000) / 10}% sample ·{' '}
                    {r.trigger === 'manual' ? `run by ${r.startedBy}` : 'nightly'}
                  </span>
                  <span className="text-[11px] text-ink-faint">{dateTime(r.startedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <RunDrawer id={open} onClose={() => setOpen(null)} />
    </>
  )
}

function RunDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const found = useIntegrityRun(id ?? undefined)
  const d = found.data
  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={d ? `Integrity check ${dateTime(d.run.startedAt)}` : 'Integrity check'}
    >
      {found.isPending && id ? (
        <SkeletonRows rows={5} />
      ) : found.isError ? (
        <ErrorNotice error={found.error} onRetry={() => found.refetch()} />
      ) : d ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Stat icon={ShieldCheck} label="Checked" value={d.run.checked} />
            <Stat icon={ShieldCheck} label="Match" value={d.run.passed} />
            <Stat icon={ShieldAlert} label="Failed" value={d.run.failed} />
            <Stat icon={ShieldAlert} label="Not reached" value={d.run.unreachable} />
          </div>
          <Panel title="Originals" bodyClassName="p-0">
            <ul>
              {d.checks.map((c) => (
                <li
                  key={c.evidenceId + c.checkedAt}
                  className="flex flex-wrap items-center gap-x-3 border-b border-line-soft px-4 py-2 text-[12.5px] last:border-0"
                >
                  <Badge tone={OUTCOME[c.outcome].tone} className="w-32 justify-center">
                    {OUTCOME[c.outcome].label}
                  </Badge>
                  <span className="num w-20 text-ink">{short(c.evidenceId)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    Timestamp {c.timestampStatus}
                    {c.detail && ` · ${c.detail}`}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}
    </Drawer>
  )
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
      <Icon size={14} className="text-ink-faint" aria-hidden />
      <span className="text-[11.5px] text-ink-muted">{label}</span>
      <span className="num text-[13px] font-semibold text-ink">{value}</span>
    </div>
  )
}
