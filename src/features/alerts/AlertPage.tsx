import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  BellRing,
  Check,
  CornerDownRight,
  Mail,
  MessageSquareText,
  MonitorSmartphone,
  Send,
  type LucideIcon,
} from 'lucide-react'
import { describeError } from '@/api'
import { useAcknowledgeAlert, useAlert, useAlertDeliveries } from '@/api/queries'
import {
  TIER_LABEL,
  TIERS,
  type Alert,
  type Delivery,
  type DeliveryChannel,
  type DeliveryStatus,
} from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  SkeletonRows,
  type Tone,
  priorityTone,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, since } from '@/lib/format'
import { useNow } from '@/lib/hooks'

const channelIcon: Record<DeliveryChannel, LucideIcon> = {
  in_app: MonitorSmartphone,
  email: Mail,
  sms: MessageSquareText,
}
const channelLabel: Record<DeliveryChannel, string> = {
  in_app: 'In-app',
  email: 'Email',
  sms: 'SMS',
}
const statusTone: Record<DeliveryStatus, Tone> = { sent: 'green', pending: 'amber', failed: 'red' }

/**
 * One alert: who it went to at each tier, on which channel, whether each message arrived, and
 * the button that stops escalation.
 */
export function AlertPage({ alertId }: { alertId: string }) {
  const alert = useAlert(alertId)
  const deliveries = useAlertDeliveries(alertId)
  const ack = useAcknowledgeAlert()
  const toast = useToast()
  const { activeRole } = useAuth()
  const now = useNow(15_000)

  if (alert.isPending) return <SkeletonRows rows={6} />
  if (alert.isError) return <ErrorNotice error={alert.error} onRetry={() => alert.refetch()} />
  const a = alert.data
  const open = a.status === 'open' || a.status === 'escalated'
  const messages = deliveries.data ?? []

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        to="/"
        hash="alerts"
        className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> Watch Floor
      </Link>
      <PageHeader
        eyebrow={`Alert ${a.reference ?? ''}`}
        title={a.title}
        description={`Raised ${since(a.raisedAt, now)} (${dateTime(a.raisedAt)}) · ${a.detail}`}
        actions={
          open && can.ackAlert(activeRole) ? (
            <Button
              variant="success"
              size="md"
              icon={Check}
              loading={ack.isPending}
              onClick={() =>
                ack.mutate(a.id, {
                  onSuccess: () =>
                    toast({
                      title: 'Alert acknowledged',
                      detail: 'Escalation stopped',
                      tone: 'success',
                    }),
                  onError: (e) =>
                    toast({ title: 'Not acknowledged', detail: describeError(e), tone: 'error' }),
                })
              }
            >
              Acknowledge
            </Button>
          ) : undefined
        }
      >
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Badge tone={priorityTone[a.severity]} className="uppercase">
            {a.severity}
          </Badge>
          {a.status === 'acknowledged' ? (
            <Badge tone="green" dot>
              Acknowledged by {a.acknowledgedBy}
            </Badge>
          ) : (
            <Badge tone={a.escalationLevel > 0 ? 'red' : 'amber'} dot>
              {a.escalationLevel > 0
                ? `Escalated · L${a.escalationLevel}`
                : 'Awaiting acknowledgement'}
            </Badge>
          )}
          {a.tier && <Badge tone="cyan">With the {TIER_LABEL[a.tier].toLowerCase()}</Badge>}
          <span className="font-mono text-[11px] text-ink-faint">{a.rule}</span>
          {a.caseRef && <span className="font-mono text-[11px] text-ink-faint">{a.caseRef}</span>}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
        <Panel title="Escalation" icon={BellRing} className="self-start">
          <EscalationLadder alert={a} messages={messages} now={now} />
        </Panel>
        <Panel
          title="Deliveries"
          icon={Send}
          actions={<span className="text-[11px] text-ink-faint">{summary(messages)}</span>}
          bodyClassName="p-0"
        >
          {deliveries.isPending ? (
            <SkeletonRows rows={4} />
          ) : deliveries.isError ? (
            <ErrorNotice error={deliveries.error} onRetry={() => deliveries.refetch()} />
          ) : messages.length === 0 ? (
            <EmptyState icon={Send} title="Nothing sent">
              Nobody was on the duty roster at any tier when this alert was raised.{' '}
              <Link to="/roster" className="text-cyan hover:underline">
                Fill the roster
              </Link>
            </EmptyState>
          ) : (
            <DeliveryList messages={messages} now={now} />
          )}
        </Panel>
      </div>
    </div>
  )
}

function summary(messages: Delivery[]) {
  const sent = messages.filter((m) => m.status === 'sent').length
  const failed = messages.filter((m) => m.status === 'failed').length
  const pending = messages.length - sent - failed
  return [`${sent} sent`, pending && `${pending} pending`, failed && `${failed} failed`]
    .filter(Boolean)
    .join(' · ')
}

/** Each tier, when the alert reached it and who it told; acknowledgement closes the ladder. */
function EscalationLadder({
  alert: a,
  messages,
  now,
}: {
  alert: Alert
  messages: Delivery[]
  now: number
}) {
  return (
    <ol className="relative space-y-4">
      {TIERS.map((tier, level) => {
        const atLevel = messages.filter((m) => m.level === level)
        const reached = level <= a.escalationLevel
        const current = level === a.escalationLevel && a.status !== 'acknowledged'
        const reachedAt =
          level === 0
            ? a.raisedAt
            : (atLevel.map((m) => m.createdAt).sort()[0] ??
              (level === a.escalationLevel ? a.lastEscalatedAt : undefined))
        const people = [...new Set(atLevel.map((m) => m.recipientName))]
        return (
          <li key={tier} className="relative flex gap-3">
            <span
              className={cn(
                'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10.5px] font-bold ring-1',
                current
                  ? 'bg-red/15 text-red ring-red/40 shadow-[0_0_12px_-2px_var(--color-red)]'
                  : reached
                    ? 'bg-cyan/12 text-cyan ring-cyan/35'
                    : 'bg-tint/[0.03] text-ink-faint ring-tint/10',
              )}
            >
              L{level}
            </span>
            <div className="min-w-0">
              <div
                className={cn('text-[13px] font-medium', reached ? 'text-ink' : 'text-ink-faint')}
              >
                {TIER_LABEL[tier]}
              </div>
              {reached ? (
                <div className="mt-0.5 text-[11.5px] text-ink-muted">
                  {reachedAt
                    ? `${level === 0 ? 'Raised' : 'Reached'} ${since(reachedAt, now)}`
                    : 'Reached'}
                  {' · '}
                  {people.length > 0 ? (
                    people.join(', ')
                  ) : (
                    <span className="text-amber">nobody on duty, skipped</span>
                  )}
                </div>
              ) : (
                <div className="mt-0.5 text-[11.5px] text-ink-faint">
                  {a.status === 'acknowledged' ? 'Not needed' : 'Next if nobody acknowledges'}
                </div>
              )}
            </div>
          </li>
        )
      })}
      {a.status === 'acknowledged' && (
        <li className="flex gap-3">
          <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-green/12 text-green ring-1 ring-green/35">
            <Check size={13} />
          </span>
          <div className="text-[12px] text-ink-muted">
            <div className="text-[13px] font-medium text-ink">Acknowledged</div>
            {a.acknowledgedBy}
            {a.acknowledgedAt && ` · ${since(a.acknowledgedAt, now)}`}
          </div>
        </li>
      )}
    </ol>
  )
}

function DeliveryList({ messages, now }: { messages: Delivery[]; now: number }) {
  return (
    <ul>
      {messages.map((m) => {
        const Icon = channelIcon[m.channel]
        return (
          <li
            key={m.id}
            className={cn(
              'flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3 last:border-0',
              m.fallbackFor && 'pl-8',
            )}
          >
            {m.fallbackFor ? (
              <CornerDownRight size={14} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden />
            ) : (
              <Icon size={15} className="mt-0.5 shrink-0 text-cyan/80" aria-hidden />
            )}
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-x-2 text-[13px]">
                <span className="font-medium text-ink">{m.recipientName}</span>
                <span className="text-[11.5px] text-ink-muted">
                  {channelLabel[m.channel]}
                  {m.address && <span className="font-mono"> · {m.address}</span>}
                </span>
              </div>
              <div className="mt-0.5 text-[11.5px] text-ink-faint">
                L{m.level} · {TIER_LABEL[TIERS[m.level] ?? 'centre_lead']}
                {m.fallbackFor && ' · instead of the SMS that failed'}
                {m.channel === 'in_app' && m.readAt && ` · read ${since(m.readAt, now)}`}
              </div>
              {m.lastError && (
                <div className="mt-1 text-[11.5px] break-words text-red/90">{m.lastError}</div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge tone={statusTone[m.status]}>{m.status}</Badge>
              <span className="num text-[10.5px] text-ink-faint">
                {m.sentAt
                  ? since(m.sentAt, now)
                  : `${m.attempts} attempt${m.attempts === 1 ? '' : 's'}`}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
