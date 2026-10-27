import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowUpRight,
  FolderPlus,
  Inbox,
  Loader2,
  Newspaper,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { usePromoteTriage, useTriage } from '@/api/queries'
import { ROLE_LABEL, type Priority, type TriageItem, type TriageStatus } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Panel,
  Segmented,
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { since } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { EvidenceList } from '@/features/cases/EvidenceList'

const STATUSES: { value: TriageStatus; label: string }[] = [
  { value: 'pending', label: 'Waiting' },
  { value: 'promoted', label: 'Promoted' },
]

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Normal' },
  { value: 'high', label: 'High' },
]

/** A date input's value, `days` from today in local time. */
const dateInDays = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function TriagePage() {
  const [status, setStatus] = useState<TriageStatus>('pending')
  const triage = useTriage(status)
  const now = useNow()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const items = triage.data?.items ?? []
  const selected = items.find((t) => t.id === selectedId) ?? items[0]

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Operations · Triage"
        title="Triage"
        description="Stories sent from the feed. Their originals are captured and sealed while they wait; promoting one opens a case with that evidence attached."
        actions={
          <Segmented label="Status" value={status} onChange={setStatus} options={STATUSES} />
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <Panel
          title="Queue"
          icon={Inbox}
          actions={
            <span className="num text-[11.5px] text-ink-faint">
              {items.length} {status === 'pending' ? 'waiting' : 'promoted'}
            </span>
          }
          bodyClassName="p-0"
        >
          {triage.isPending ? (
            <SkeletonRows rows={4} />
          ) : triage.isError ? (
            <ErrorNotice error={triage.error} onRetry={() => triage.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={status === 'pending' ? 'Nothing waiting in triage' : 'Nothing promoted yet'}
            >
              {status === 'pending' ? (
                <>
                  Send a story from the{' '}
                  <Link to="/feed" className="text-cyan hover:underline">
                    News Feed
                  </Link>{' '}
                  to start.
                </>
              ) : (
                'Promoted items appear here with a link to their case.'
              )}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line-soft" role="listbox" aria-label="Triage items">
              {items.map((t) => {
                const active = selected?.id === t.id
                return (
                  <li key={t.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(t.id)}
                      className={cn(
                        'relative flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors focus-visible:-outline-offset-2',
                        active ? 'bg-cyan/[0.06]' : 'hover:bg-white/[0.025]',
                      )}
                    >
                      {active && (
                        <span
                          className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-cyan"
                          aria-hidden
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">{t.headline}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                          {t.outlet} · sent {since(t.sentAt, now)}
                        </p>
                      </div>
                      <PreservationBadge item={t} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {selected && <TriageDetail key={selected.id} item={selected} />}
      </div>
    </div>
  )
}

function PreservationBadge({ item }: { item: TriageItem }) {
  if (item.evidenceCount === 0)
    return (
      <Badge tone="amber" className="shrink-0">
        <Loader2 size={11} className="animate-spin" aria-hidden /> Preserving
      </Badge>
    )
  return (
    <Badge tone="green" className="shrink-0">
      <ShieldCheck size={11} aria-hidden /> {item.evidenceCount} sealed
    </Badge>
  )
}

function TriageDetail({ item }: { item: TriageItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-5 self-start animate-rise-in">
      <Panel eyebrow={item.outlet} title={item.headline}>
        {item.summary && <p className="text-[12.5px] leading-relaxed text-ink-2">{item.summary}</p>}
        <p className="mt-2 truncate font-mono text-[11px] text-ink-faint" title={item.url}>
          {item.url}
        </p>
      </Panel>

      <Panel
        title="Originals"
        icon={ShieldCheck}
        actions={<PreservationBadge item={item} />}
        bodyClassName="p-0"
      >
        {item.evidence.length === 0 ? (
          <p className="px-4 py-5 text-[12px] text-ink-muted">
            The collector is capturing the page (web archive, HTML and a full-page screenshot).
            Evidence seals each file with a hash and a timestamp; this updates by itself.
          </p>
        ) : (
          <EvidenceList evidence={item.evidence} />
        )}
      </Panel>

      {item.status === 'pending' ? (
        <PromotePanel item={item} />
      ) : item.caseId ? (
        <Link
          to="/cases/$caseId"
          params={{ caseId: item.caseId }}
          className="flex items-center justify-between rounded-lg border border-line bg-canvas/50 px-3.5 py-2.5 text-[12.5px] text-ink-2 transition-colors hover:border-cyan/40 hover:text-ink"
        >
          Promoted{item.promotedBy ? ` by ${item.promotedBy}` : ''} — open the case
          <ArrowUpRight size={14} className="text-cyan" />
        </Link>
      ) : null}
    </div>
  )
}

function PromotePanel({ item }: { item: TriageItem }) {
  const { user, activeRole } = useAuth()
  const promote = usePromoteTriage()
  const toast = useToast()
  const navigate = useNavigate()
  const [title, setTitle] = useState(item.headline)
  const [priority, setPriority] = useState<Priority>('medium')
  const [deadline, setDeadline] = useState(dateInDays(7))
  const allowed = can.workTriage(activeRole)
  const titleMissing = title.trim().length === 0
  const ready = allowed && !!user && !titleMissing && !!deadline

  const submit = () => {
    if (!user || !ready) return
    promote.mutate(
      {
        id: item.id,
        // End of the chosen day, local time: "due on the 3rd" means by the end of the 3rd.
        input: {
          title: title.trim(),
          ownerId: user.id,
          priority,
          deadline: new Date(`${deadline}T23:59:00`).toISOString(),
        },
      },
      {
        onSuccess: ({ caseId }) => {
          toast({
            title: 'Case opened',
            detail:
              item.evidenceCount > 0
                ? `${item.evidenceCount} sealed originals moved to the case.`
                : 'Originals still being preserved will follow to the case.',
            tone: 'success',
          })
          void navigate({ to: '/cases/$caseId', params: { caseId } })
        },
        onError: (e) =>
          toast({ title: 'Promotion refused', detail: describeError(e), tone: 'error' }),
      },
    )
  }

  return (
    <Panel title="Promote to case" icon={FolderPlus}>
      {!allowed && (
        <div
          role="note"
          className="mb-4 flex gap-3 rounded-lg border border-line-strong bg-white/[0.025] px-3.5 py-3"
        >
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-cyan" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Acting as <span className="text-ink-2">{ROLE_LABEL[activeRole]}</span>. Switch to
            Analyst or Supervisor in the user menu to promote.
          </p>
        </div>
      )}
      <div className="space-y-4">
        <Field label="Case title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!allowed || promote.isPending}
            maxLength={300}
            className={cn(inputClass, titleMissing && 'border-red/60')}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="eyebrow mb-1.5 block">Priority</span>
            <Segmented
              label="Priority"
              value={priority}
              onChange={setPriority}
              options={PRIORITIES}
            />
          </div>
          <Field label="Deadline">
            <input
              type="date"
              value={deadline}
              min={dateInDays(0)}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={!allowed || promote.isPending}
              className={cn(inputClass, '[color-scheme:dark]')}
            />
          </Field>
        </div>
        <div>
          <span className="eyebrow mb-1.5 block">Owner</span>
          <span className="flex items-center gap-2 text-[12.5px] text-ink-2">
            {user && <Avatar name={user.name} size={20} />} {user?.name ?? '—'}
            <span className="text-ink-faint">· reassign from the case</span>
          </span>
        </div>
        <Button
          size="md"
          icon={FolderPlus}
          disabled={!ready}
          loading={promote.isPending}
          onClick={submit}
          className="w-full"
        >
          Promote to case
        </Button>
      </div>
    </Panel>
  )
}
