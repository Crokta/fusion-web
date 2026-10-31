import { ApiError, describeError } from '@/api'
import type { NameClusterStatus, NameSearchKind, NameSearchStatus } from '@/api/types'
import { Badge, type Tone } from '@/components/ui'

const STATUS: Record<NameSearchStatus, { label: string; tone: Tone }> = {
  created: { label: 'Running', tone: 'cyan' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  refused: { label: 'Refused', tone: 'red' },
  expired: { label: 'Expired', tone: 'neutral' },
}

export function StatusBadge({ status }: { status: NameSearchStatus }) {
  const s = STATUS[status]
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  )
}

export function KindBadge({ kind }: { kind: NameSearchKind }) {
  return kind === 'private_individual' ? (
    <Badge tone="violet">Private individual</Badge>
  ) : (
    <Badge>Public figure</Badge>
  )
}

const CLUSTER: Record<NameClusterStatus, { label: string; tone: Tone }> = {
  suggested: { label: 'Suggested', tone: 'neutral' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  rejected: { label: 'Not this person', tone: 'red' },
}

export function ClusterBadge({ status }: { status: NameClusterStatus }) {
  const c = CLUSTER[status]
  return <Badge tone={c.tone}>{c.label}</Badge>
}

/** A passage from the index, with the name wrapped in <mark> (never rendered as HTML). */
export function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(<mark>.*?<\/mark>)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('<mark>') ? (
          <mark key={i} className="rounded-[3px] bg-cyan/15 px-0.5 text-ink">
            {part.slice(6, -7)}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}

/**
 * Search says why a name query was refused (the PI policy off, PI results for the centre lead
 * only), which the generic wording for capability_not_authorised would hide.
 */
export function refusalText(error: unknown): string {
  // Fusion.Web puts a refusal's reason in the problem's title; detail when there is one.
  return error instanceof ApiError
    ? (error.problem.detail ?? error.problem.title ?? describeError(error))
    : describeError(error)
}
