import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCheck,
  CheckCircle2,
  FileUp,
  Library,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  UserX,
} from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { type SourceAction, useSourceAction, useSourceBatch, useSources } from '@/api/queries'
import {
  ROLE_LABEL,
  type Reliability,
  type SourceInput,
  type SourceKind,
  type SourceRecord,
  type SourceStatus,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { Modal } from '@/components/Overlay'
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
import { useNow } from '@/lib/hooks'
import { type ParsedImport, parseSourceImport } from './importFile'
import { PLATFORM_LABEL, crawlErrorText, platformOf, socialTarget } from './social'

type Filter = 'all' | SourceStatus

const statusTone: Record<SourceStatus, Tone> = {
  approved: 'green',
  proposed: 'amber',
  suspended: 'red',
}
const statusLabel: Record<SourceStatus, string> = {
  approved: 'Collecting',
  proposed: 'Awaiting approval',
  suspended: 'Suspended',
}

const KINDS: { value: SourceKind; label: string; hint: string }[] = [
  {
    value: 'feed',
    label: 'RSS / Atom feed',
    hint: 'The feed address, e.g. https://example.ng/feed/',
  },
  {
    value: 'site',
    label: 'Website',
    hint: 'The front page; up to 10 new articles a round are read',
  },
  {
    value: 'official',
    label: 'Official channel',
    hint: 'A government or agency site, read like a website',
  },
  {
    value: 'social',
    label: 'Social media',
    hint: 'A profile, page, community or platform search, collected through Bright Data about once an hour',
  },
]
const kindLabel = (k: SourceKind) => KINDS.find((x) => x.value === k)?.label ?? k

/** Where a source sits: its site, or for a social source its platform and what is followed. */
function placeOf(s: { kind: SourceKind; url: string; host: string }) {
  if (s.kind !== 'social') return s.host
  const t = socialTarget(s.url)
  if (!t.platform) return s.host
  return `${PLATFORM_LABEL[t.platform]}${t.ok && t.target === 'search' ? ' search' : ''}`
}

const GRADES: { value: Reliability; label: string }[] = [
  { value: 'A', label: 'A — Completely reliable' },
  { value: 'B', label: 'B — Usually reliable' },
  { value: 'C', label: 'C — Fairly reliable' },
  { value: 'D', label: 'D — Not usually reliable' },
  { value: 'E', label: 'E — Unreliable' },
  { value: 'F', label: 'F — Cannot be judged' },
]

export function SourcesPage() {
  const sources = useSources()
  const { activeRole } = useAuth()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)

  const all = sources.data?.items ?? []
  const count = (s: SourceStatus) => all.filter((x) => x.status === s).length
  const items = filter === 'all' ? all : all.filter((s) => s.status === filter)
  const selected = items.find((s) => s.id === selectedId) ?? items[0]

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Intelligence · Collection"
        title="Sources"
        description="The register of what may be collected. Only approved sources are crawled, and a source is approved by someone other than the person who proposed it."
        actions={
          can.proposeSource(activeRole) && (
            <div className="flex gap-2">
              <Button variant="ghost" icon={FileUp} size="md" onClick={() => setImporting(true)}>
                Import
              </Button>
              <Button icon={Plus} size="md" onClick={() => setProposing(true)}>
                Propose source
              </Button>
            </div>
          )
        }
      />

      {!can.readSources(activeRole) ? (
        <Panel>
          <EmptyState icon={ShieldAlert} title="The source register isn't open to your role">
            Acting as {ROLE_LABEL[activeRole]}. Analysts, supervisors, centre leads and admins can
            read it.
          </EmptyState>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <Panel
            title="Register"
            icon={Library}
            actions={
              <div className="flex items-center gap-2">
                {can.approveSource(activeRole) &&
                  filter === 'proposed' &&
                  count('proposed') > 0 && (
                    <Button variant="ghost" icon={CheckCheck} onClick={() => setApprovingAll(true)}>
                      Approve all
                    </Button>
                  )}
                <Segmented
                  label="Status"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: all.length },
                    { value: 'approved', label: 'Collecting', count: count('approved') },
                    { value: 'proposed', label: 'Awaiting', count: count('proposed') },
                    { value: 'suspended', label: 'Suspended', count: count('suspended') },
                  ]}
                />
              </div>
            }
            bodyClassName="p-0"
          >
            {sources.isPending ? (
              <SkeletonRows rows={4} />
            ) : sources.isError ? (
              <ErrorNotice error={sources.error} onRetry={() => sources.refetch()} />
            ) : items.length === 0 ? (
              <EmptyState icon={Library} title="No sources here">
                {filter === 'all' ? 'Propose the first source to start collecting.' : null}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line-soft" role="listbox" aria-label="Sources">
                {items.map((s) => {
                  const active = selected?.id === s.id
                  return (
                    <li key={s.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className={cn(
                          'relative flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors focus-visible:-outline-offset-2',
                          active ? 'bg-cyan/[0.06]' : 'hover:bg-tint/[0.025]',
                        )}
                      >
                        {active && (
                          <span
                            className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-cyan"
                            aria-hidden
                          />
                        )}
                        <Grade grade={s.reliability} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{s.name}</p>
                          <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                            {placeOf(s)} · {kindLabel(s.kind)} · proposed by {s.proposedBy.name}{' '}
                            {since(s.proposedAt, now)}
                          </p>
                        </div>
                        {s.status === 'approved' && s.collection.lastError && (
                          <AlertTriangle
                            size={14}
                            className="shrink-0 text-amber"
                            aria-label="The last crawl failed"
                          />
                        )}
                        <Badge tone={statusTone[s.status]} dot>
                          {statusLabel[s.status]}
                        </Badge>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {selected && <SourceDetail key={`${selected.id}-${selected.etag}`} source={selected} />}
        </div>
      )}

      <ProposeModal open={proposing} onClose={() => setProposing(false)} />
      {importing && <ImportModal onClose={() => setImporting(false)} />}
      {approvingAll && (
        <ApproveAllModal
          sources={all.filter((s) => s.status === 'proposed')}
          onClose={() => setApprovingAll(false)}
        />
      )}
    </div>
  )
}

function Grade({ grade }: { grade: Reliability | null }) {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-md bg-tint/[0.04] font-mono text-[13px] font-semibold text-ink-2 ring-1 ring-tint/[0.08]"
      title={grade ? GRADES.find((g) => g.value === grade)?.label : 'Not graded'}
      aria-label={grade ? `Reliability ${grade}` : 'Not graded'}
    >
      {grade ?? '–'}
    </span>
  )
}

function SourceDetail({ source }: { source: SourceRecord }) {
  const { user, activeRole } = useAuth()
  const act = useSourceAction()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState('')
  const isProposer = source.proposedBy.id === user?.id
  const mayApprove = can.approveSource(activeRole)

  const run = (a: SourceAction, done: string, after?: () => void) =>
    act.mutate(a, {
      onSuccess: (s) => {
        toast({ title: done, detail: s.name, tone: 'success' })
        after?.()
      },
      onError: (e) => toast({ title: 'Refused', detail: describeError(e), tone: 'error' }),
    })

  return (
    <div className="flex min-w-0 flex-col gap-5 self-start animate-rise-in">
      <Panel
        eyebrow={kindLabel(source.kind)}
        title={source.name}
        actions={
          can.proposeSource(activeRole) &&
          !editing && (
            <Button variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        {editing ? (
          <SourceForm
            initial={source}
            submitLabel="Save changes"
            pending={act.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(input) =>
              run(
                { kind: 'edit', id: source.id, input, etag: source.etag },
                input.url !== source.url || input.kind !== source.kind
                  ? 'Saved — waiting for approval of the new address'
                  : 'Source updated',
                () => setEditing(false),
              )
            }
          />
        ) : (
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[12.5px]">
            <dt className="text-ink-faint">Status</dt>
            <dd>
              <Badge tone={statusTone[source.status]} dot>
                {statusLabel[source.status]}
              </Badge>
            </dd>
            <dt className="text-ink-faint">Address</dt>
            <dd className="truncate font-mono text-[11.5px] text-ink-2" title={source.url}>
              {source.url}
            </dd>
            <dt className="text-ink-faint">Reliability</dt>
            <dd className="text-ink-2">
              {source.reliability
                ? GRADES.find((g) => g.value === source.reliability)?.label
                : 'Not graded'}
            </dd>
            <dt className="text-ink-faint">Proposed</dt>
            <dd className="text-ink-2">
              {source.proposedBy.name} · {dateTime(source.proposedAt)}
            </dd>
            {source.approvedBy && source.approvedAt && (
              <>
                <dt className="text-ink-faint">Approved</dt>
                <dd className="text-ink-2">
                  {source.approvedBy.name} · {dateTime(source.approvedAt)}
                </dd>
              </>
            )}
            {source.status === 'suspended' && (
              <>
                <dt className="text-ink-faint">Suspended</dt>
                <dd className="text-ink-2">
                  {source.suspendedAt && dateTime(source.suspendedAt)}
                  {source.suspendedReason && (
                    <span className="mt-1 block text-ink-muted">“{source.suspendedReason}”</span>
                  )}
                </dd>
              </>
            )}
          </dl>
        )}
      </Panel>

      {!editing && source.status === 'approved' && <CollectionPanel source={source} />}

      {!editing && source.status !== 'approved' && (
        <Panel
          title={source.status === 'proposed' ? 'Approve' : 'Reinstate'}
          icon={source.status === 'proposed' ? CheckCircle2 : RotateCcw}
        >
          <DutyNote
            isProposer={isProposer}
            mayApprove={mayApprove}
            verb={source.status === 'proposed' ? 'approve' : 'reinstate'}
          />
          <p className="mb-4 text-[12.5px] leading-relaxed text-ink-muted">
            {source.status === 'proposed'
              ? source.kind === 'social'
                ? 'Approving puts the source into collection: its posts are collected through Bright Data from the next round, then about once an hour, and reach the feed.'
                : 'Approving puts the source into collection: it is crawled from the next round (every 5 minutes) and its stories reach the feed.'
              : 'Reinstating puts the source back into collection from the next round.'}
          </p>
          <Button
            variant="success"
            size="md"
            icon={source.status === 'proposed' ? CheckCircle2 : RotateCcw}
            disabled={isProposer || !mayApprove}
            loading={act.isPending}
            className="w-full"
            onClick={() =>
              source.status === 'proposed'
                ? run({ kind: 'approve', id: source.id, etag: source.etag }, 'Source approved')
                : run({ kind: 'reinstate', id: source.id, etag: source.etag }, 'Source reinstated')
            }
          >
            {source.status === 'proposed' ? 'Approve source' : 'Reinstate source'}
          </Button>
        </Panel>
      )}

      {!editing && source.status === 'approved' && mayApprove && (
        <Panel title="Suspend" icon={Ban}>
          <Field
            label="Reason"
            hint="Recorded in the audit trail; collection stops from the next round."
          >
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. Republishing unverified claims as news"
              className={cn(inputClass, 'resize-y leading-relaxed')}
            />
          </Field>
          <Button
            variant="danger"
            size="md"
            icon={Ban}
            disabled={reason.trim().length === 0}
            loading={act.isPending}
            className="mt-4 w-full"
            onClick={() =>
              run(
                { kind: 'suspend', id: source.id, reason: reason.trim(), etag: source.etag },
                'Source suspended',
              )
            }
          >
            Suspend source
          </Button>
        </Panel>
      )}
    </div>
  )
}

/** How collection is going: the last round, the last story and, if it failed, why. */
function CollectionPanel({ source }: { source: SourceRecord }) {
  const now = useNow()
  const c = source.collection
  const target = source.kind === 'social' ? socialTarget(source.url) : null
  return (
    <Panel title="Collection" icon={Activity}>
      {c.lastError && (
        <div
          role="alert"
          className="mb-4 flex gap-3 rounded-lg border border-amber/35 bg-amber/[0.07] px-3.5 py-3"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            <span className="font-medium text-amber">The last crawl failed</span>
            {c.lastErrorAt && <> {since(c.lastErrorAt, now)}</>}. {crawlErrorText(c.lastError)}{' '}
            <code className="font-mono text-[11px] text-ink-2">{c.lastError}</code>
          </p>
        </div>
      )}
      <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-[12.5px]">
        {target?.platform && (
          <>
            <dt className="text-ink-faint">Collects</dt>
            <dd className="text-ink-2">
              {PLATFORM_LABEL[target.platform]}
              {target.ok ? ` · ${target.detail}` : ''}
              <span className="mt-0.5 block text-[11.5px] text-ink-faint">
                Through Bright Data, about once an hour
              </span>
            </dd>
          </>
        )}
        <dt className="text-ink-faint">Last round</dt>
        <dd className="text-ink-2">
          {c.lastCrawlAt ? since(c.lastCrawlAt, now) : 'Not yet — from the next round'}
        </dd>
        <dt className="text-ink-faint">Last story</dt>
        <dd className="text-ink-2">
          {c.lastStoryAt ? since(c.lastStoryAt, now) : 'None collected yet'}
        </dd>
      </dl>
    </Panel>
  )
}

/** What the address will collect, or why it can't be, while the form is being filled in. */
function AddressNote({ kind, url }: { kind: SourceKind; url: string }) {
  if (!url) return null
  if (kind !== 'social') {
    const platform = platformOf(url)
    return platform ? (
      <p className="-mt-2 text-[11.5px] text-amber">
        This is {platform === 'x' || platform === 'instagram' ? 'an' : 'a'}{' '}
        {PLATFORM_LABEL[platform]} address: choose Social media to collect it.
      </p>
    ) : null
  }
  const t = socialTarget(url)
  return t.ok ? (
    <p className="-mt-2 text-[11.5px] text-green">
      {PLATFORM_LABEL[t.platform]} {t.target}: collects {t.detail}.
    </p>
  ) : (
    <p className="-mt-2 text-[11.5px] text-amber" role="alert">
      {t.problem}
    </p>
  )
}

const versionOf = (etag: string) => Number(etag.replace(/\D/g, ''))

/** Many proposals at once, from a file such as fusion-intake/seed/sources.json. */
function ImportModal({ onClose }: { onClose: () => void }) {
  const { importing } = useSourceBatch()
  const toast = useToast()
  const [parsed, setParsed] = useState<ParsedImport | null>(null)
  const [fileName, setFileName] = useState('')
  const result = importing.data

  return (
    <Modal
      open
      onClose={onClose}
      title="Import sources"
      description="Each new address becomes a proposal by you; someone else approves it. Addresses already in the register are skipped."
    >
      {result ? (
        <div className="space-y-3 text-[12.5px]">
          <p className="text-ink-2">
            <span className="font-medium text-green">{result.created.length} proposed</span>
            {result.skipped.length > 0 && <>, {result.skipped.length} already in the register</>}
            {result.invalid.length > 0 && (
              <span className="text-amber">, {result.invalid.length} refused</span>
            )}
            .
          </p>
          {result.invalid.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[11.5px] text-ink-muted">
              {result.invalid.map((x) => (
                <li key={`${x.index}-${x.field}`}>
                  Row {x.index + 1}, {x.field}: {x.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field
            label="File"
            hint='JSON: a list of {name, kind, url, reliability}, or {"sources": [...]}'
          >
            <input
              type="file"
              accept="application/json,.json"
              className="block w-full text-[12.5px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-tint/[0.06] file:px-3 file:py-1.5 file:text-ink"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setFileName(f.name)
                setParsed(parseSourceImport(await f.text()))
              }}
            />
          </Field>
          {parsed && (
            <div className="space-y-2 text-[12.5px]">
              <p className="text-ink-2">
                {fileName}: <span className="font-medium">{parsed.sources.length}</span> source(s)
                to propose
                {parsed.social > 0 && <>, {parsed.social} of them social</>}.
              </p>
              {parsed.social > 0 && (
                <p className="text-[11.5px] text-ink-muted">
                  Once approved, each social source is a paid Bright Data job every round. Set a
                  monthly cap on the Bright Data screen first.
                </p>
              )}
              {parsed.problems.length > 0 && (
                <ul
                  className="max-h-32 space-y-1 overflow-y-auto text-[11.5px] text-amber"
                  role="alert"
                >
                  {parsed.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={importing.isPending}>
              Cancel
            </Button>
            <Button
              icon={FileUp}
              disabled={!parsed || parsed.sources.length === 0}
              loading={importing.isPending}
              onClick={() =>
                parsed &&
                importing.mutate(parsed.sources, {
                  onError: (e) =>
                    toast({ title: 'Import refused', detail: describeError(e), tone: 'error' }),
                })
              }
            >
              Propose {parsed?.sources.length ?? 0}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Every proposal waiting, except your own: someone else approves those. */
function ApproveAllModal({ sources, onClose }: { sources: SourceRecord[]; onClose: () => void }) {
  const { user } = useAuth()
  const { approving } = useSourceBatch()
  const toast = useToast()
  const [withSocial, setWithSocial] = useState(false)
  const mine = sources.filter((s) => s.proposedBy.id === user?.id)
  const others = sources.filter((s) => s.proposedBy.id !== user?.id)
  const social = others.filter((s) => s.kind === 'social').length
  // Social sources spend Bright Data credits every round: left out unless asked for.
  const theirs = withSocial ? others : others.filter((s) => s.kind !== 'social')
  const result = approving.data
  return (
    <Modal
      open
      onClose={onClose}
      title="Approve all awaiting"
      description="Each is approved under the same rules as one at a time, and audited."
    >
      {result ? (
        <div className="space-y-3 text-[12.5px]">
          <p className="text-ink-2">
            <span className="font-medium text-green">{result.approved.length} approved</span>
            {result.refused.length > 0 && (
              <span className="text-amber">, {result.refused.length} refused</span>
            )}
            . They are crawled from the next round.
          </p>
          {result.refused.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-[11.5px] text-ink-muted">
              {result.refused.map((r) => (
                <li key={r.id}>
                  {sources.find((s) => s.id === r.id)?.name ?? r.id}: {r.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-[12.5px]">
          <p className="text-ink-2">
            Approve <span className="font-medium">{theirs.length}</span> source(s).
          </p>
          {social > 0 && (
            <label className="flex items-start gap-2.5 text-[12.5px] text-ink-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={withSocial}
                onChange={(e) => setWithSocial(e.target.checked)}
              />
              <span>
                Include {social} social source(s)
                <span className="block text-[11.5px] text-ink-muted">
                  Each is a paid Bright Data job every round, up to its post limit. Set a monthly
                  cap on the Bright Data screen first.
                </span>
              </span>
            </label>
          )}
          {mine.length > 0 && (
            <p className="text-[11.5px] text-ink-muted">
              {mine.length} you proposed are left for someone else to approve.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={approving.isPending}>
              Cancel
            </Button>
            <Button
              variant="success"
              icon={CheckCheck}
              disabled={theirs.length === 0}
              loading={approving.isPending}
              onClick={() =>
                approving.mutate(
                  theirs.map((s) => ({ id: s.id, version: versionOf(s.etag) })),
                  {
                    onError: (e) =>
                      toast({ title: 'Approval refused', detail: describeError(e), tone: 'error' }),
                  },
                )
              }
            >
              Approve {theirs.length}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/** Why the approve button is off, said before anyone clicks it. */
function DutyNote({
  isProposer,
  mayApprove,
  verb,
}: {
  isProposer: boolean
  mayApprove: boolean
  verb: string
}) {
  const { activeRole } = useAuth()
  if (isProposer)
    return (
      <div
        role="note"
        className="mb-4 flex gap-3 rounded-lg border border-amber/35 bg-amber/[0.07] px-3.5 py-3"
      >
        <UserX size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          <span className="font-medium text-amber">You proposed this source.</span> Someone else
          must {verb} it; intake refuses with{' '}
          <code className="font-mono text-[11px] text-ink-2">self_approval_forbidden</code>.
        </p>
      </div>
    )
  if (!mayApprove)
    return (
      <div
        role="note"
        className="mb-4 flex gap-3 rounded-lg border border-line-strong bg-tint/[0.025] px-3.5 py-3"
      >
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-cyan" aria-hidden />
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          Acting as <span className="text-ink-2">{ROLE_LABEL[activeRole]}</span>. A supervisor or
          centre lead can {verb} sources.
        </p>
      </div>
    )
  return null
}

function ProposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const act = useSourceAction()
  const toast = useToast()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Propose a source"
      description="It is collected only after someone else approves it."
    >
      <SourceForm
        submitLabel="Propose source"
        pending={act.isPending}
        onCancel={onClose}
        onSubmit={(input) =>
          act.mutate(
            { kind: 'propose', input },
            {
              onSuccess: (s) => {
                toast({
                  title: 'Source proposed',
                  detail: `${s.name} is waiting for approval.`,
                  tone: 'success',
                })
                onClose()
              },
              onError: (e) =>
                toast({ title: 'Proposal refused', detail: describeError(e), tone: 'error' }),
            },
          )
        }
      />
    </Modal>
  )
}

const isWebAddress = (u: string) => {
  try {
    const url = new URL(u)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function SourceForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial?: SourceRecord
  submitLabel: string
  pending: boolean
  onSubmit: (input: SourceInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [kind, setKind] = useState<SourceKind>(initial?.kind ?? 'feed')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [reliability, setReliability] = useState<Reliability | ''>(initial?.reliability ?? '')
  const [touched, setTouched] = useState(false)

  const urlOk = isWebAddress(url.trim())
  const valid = name.trim().length > 0 && urlOk
  const reAddressed =
    initial &&
    initial.status !== 'proposed' &&
    (url.trim() !== initial.url || kind !== initial.kind)

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (valid)
          onSubmit({ name: name.trim(), kind, url: url.trim(), reliability: reliability || null })
      }}
    >
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          placeholder="e.g. Daily Trust"
          className={cn(inputClass, touched && !name.trim() && 'border-red/60')}
        />
      </Field>
      <Field label="Type" hint={KINDS.find((k) => k.value === kind)?.hint}>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SourceKind)}
          className={cn(inputClass, 'appearance-none')}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Address">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          maxLength={2000}
          placeholder="https://"
          className={cn(inputClass, 'font-mono text-[12px]', touched && !urlOk && 'border-red/60')}
        />
      </Field>
      {touched && !urlOk ? (
        <p className="-mt-2 text-[11.5px] text-red" role="alert">
          The address is a full http or https link.
        </p>
      ) : (
        urlOk && <AddressNote kind={kind} url={url.trim()} />
      )}
      <Field label="Reliability">
        <select
          value={reliability}
          onChange={(e) => setReliability(e.target.value as Reliability | '')}
          className={cn(inputClass, 'appearance-none')}
        >
          <option value="">Not graded</option>
          {GRADES.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </Field>
      {reAddressed && (
        <div
          role="note"
          className="flex gap-3 rounded-lg border border-amber/35 bg-amber/[0.07] px-3.5 py-3"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            A new address or type is a new proposal. Collection stops until someone else approves
            it, and you become its proposer.
          </p>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
