import { useMutation } from '@tanstack/react-query'
import {
  BadgeCheck,
  ChevronDown,
  ExternalLink,
  Info,
  MapPin,
  Newspaper,
  Send,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { api, describeError } from '@/api'
import { useFeed } from '@/api/queries'
import type { StoryGroup } from '@/api/types'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  CaseLink,
  EmptyState,
  ErrorNotice,
  PageHeader,
  PriorityBadge,
  Segmented,
  SkeletonRows,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useLive } from '@/realtime/LiveProvider'
import { useShell } from '@/features/shell/ShellContext'

type Channel = 'all' | StoryGroup['channel']

const CHANNELS: { value: Channel; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'security', label: 'Security' },
  { value: 'public-safety', label: 'Public safety' },
  { value: 'politics', label: 'Politics' },
  { value: 'economy', label: 'Economy' },
  { value: 'health', label: 'Health' },
  { value: 'information', label: 'Information' },
]

const priorityRule = { high: 'bg-red', medium: 'bg-amber', low: 'bg-teal' } as const

export function FeedPage() {
  const [channel, setChannel] = useState<Channel>('all')
  const feed = useFeed(channel === 'all' ? undefined : channel)
  const live = useLive()
  const toast = useToast()
  const items = feed.data?.items ?? []

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Analysis · Intake"
        title="News Feed"
        description="Story groups from approved sources, deduplicated and grouped. Only headline, summary and link are stored until a story becomes evidence."
        actions={
          live.client.simulate && (
            <Button
              icon={Sparkles}
              onClick={() => {
                live.client.simulate?.()
                toast({
                  title: 'Synthetic signal published',
                  detail: 'A new story group arrived on the feed.',
                  tone: 'info',
                })
              }}
            >
              Generate signal
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Channel" value={channel} onChange={setChannel} options={CHANNELS} />
        <p className="ml-auto flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <Info size={12} /> Independent outlets exclude syndicated copies: repetition is not
          corroboration.
        </p>
      </div>

      {feed.isPending ? (
        <div className="surface rounded-lg">
          <SkeletonRows rows={6} />
        </div>
      ) : feed.isError ? (
        <ErrorNotice error={feed.error} onRetry={() => feed.refetch()} />
      ) : items.length === 0 ? (
        <div className="surface rounded-lg">
          <EmptyState icon={Newspaper} title="No stories on this channel" />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((g) => (
            <StoryGroupCard key={g.id} group={g} />
          ))}
        </ul>
      )}
    </div>
  )
}

function StoryGroupCard({ group: g }: { group: StoryGroup }) {
  const [open, setOpen] = useState(false)
  const { select } = useShell()
  const toast = useToast()
  const now = useNow()
  const triage = useMutation({
    mutationFn: () => api.sendToTriage(g.id),
    onSuccess: () =>
      toast({
        title: 'Sent to triage',
        detail: `${g.headline} · evidence capture requested`,
        tone: 'success',
      }),
    onError: (e) => toast({ title: 'Not sent', detail: describeError(e), tone: 'error' }),
  })
  const fresh = now - new Date(g.firstSeen).getTime() < 120_000

  return (
    <li
      className={cn(
        'surface group relative animate-rise-in overflow-hidden rounded-lg transition-colors hover:border-line-strong',
        fresh && 'animate-flash',
      )}
      onClick={() =>
        select({
          kind: 'story',
          title: g.headline,
          caseRef: g.caseRef,
          priority: g.priority,
          place: g.place,
          source: `${g.independentOutlets} independent outlets`,
          raisedAt: g.firstSeen,
          state: g.caseRef ? 'Linked to case' : 'Unverified',
        })
      }
    >
      <span
        className={cn('absolute inset-y-0 left-0 w-[3px]', priorityRule[g.priority])}
        aria-hidden
      />
      <div className="flex gap-5 py-3.5 pr-4 pl-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <PriorityBadge priority={g.priority} />
            <Badge tone="neutral" className="capitalize">
              {g.channel.replace('-', ' ')}
            </Badge>
            {fresh && (
              <Badge tone="cyan" dot>
                New
              </Badge>
            )}
            <span className="inline-flex items-center gap-1 text-ink-muted">
              <MapPin size={11} />
              {g.place}
            </span>
            <span className="num text-ink-faint">· updated {relative(g.lastUpdated, now)}</span>
            {g.caseRef && <CaseLink caseRef={g.caseRef} />}
          </div>
          <h3 className="mt-1.5 text-[14.5px] leading-snug font-semibold text-ink">{g.headline}</h3>
          <p className="mt-1 max-w-4xl text-[12.5px] leading-relaxed text-ink-muted">{g.summary}</p>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className="mt-2 inline-flex items-center gap-1 rounded text-[11.5px] font-medium text-ink-muted hover:text-cyan"
          >
            <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
            {g.stories.length} member {g.stories.length === 1 ? 'story' : 'stories'}
          </button>
          {open && (
            <ul className="mt-2 animate-fade-in divide-y divide-line-soft rounded-md border border-line-soft bg-canvas/50">
              {g.stories.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-[12px]">
                  <span className="w-40 shrink-0 truncate font-medium text-ink-2">{s.outlet}</span>
                  {s.official && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-green">
                      <BadgeCheck size={12} />
                      Official
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{s.headline}</span>
                  <span className="num shrink-0 text-[11px] text-ink-faint">
                    {relative(s.publishedAt, now)}
                  </span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="text-ink-faint hover:text-cyan"
                    aria-label={`Open ${s.outlet} story`}
                  >
                    <ExternalLink size={12} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-3">
          <div className="text-right" title="Distinct outlets reporting independently">
            <div className="num text-[22px] leading-none font-semibold text-cyan">
              {g.independentOutlets}
            </div>
            <div className="eyebrow mt-1 text-[9px]">Independent</div>
          </div>
          {!g.caseRef && (
            <Button
              size="xs"
              icon={Send}
              loading={triage.isPending}
              disabled={triage.isSuccess}
              onClick={(e) => {
                e.stopPropagation()
                triage.mutate()
              }}
            >
              {triage.isSuccess ? 'In triage' : 'Send to triage'}
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}
