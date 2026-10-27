import type { ReactNode } from 'react'
import { Pause, Play } from 'lucide-react'
import { useAlerts, useCases, useFeed, useWatchFloor } from '@/api/queries'
import type { Priority, WallContentKey } from '@/api/types'
import { NigeriaMap } from '@/components/NigeriaMap'
import { caseStateLabel } from '@/components/ui'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'

/**
 * Renderers for wall content. Each draws at native size and lets overflow clip under a fade,
 * so the same component works on a single 1/16 screen preview, a merged canvas and the
 * focused full-screen view (`big`).
 */

interface Props {
  content: WallContentKey
  big?: boolean
  contextRef?: string
}

const dot: Record<Priority, string> = { high: 'bg-red', medium: 'bg-amber', low: 'bg-teal' }
const text: Record<Priority, string> = { high: 'text-red', medium: 'text-amber', low: 'text-teal' }

function Row({
  title,
  meta,
  priority,
  big,
  lead,
}: {
  title: string
  meta?: string
  priority?: Priority
  big?: boolean
  lead?: ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 border-b border-white/[0.04] last:border-0',
        big ? 'py-3' : 'py-[5px]',
      )}
    >
      {lead}
      {priority && !lead && (
        <span
          className={cn(
            'mt-[5px] size-1.5 shrink-0 rounded-full',
            dot[priority],
            big && 'mt-2 size-2',
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'truncate font-medium text-ink',
            big ? 'text-[17px]' : 'text-[10.5px] leading-tight',
          )}
        >
          {title}
        </div>
        {meta && (
          <div
            className={cn(
              'truncate text-ink-muted',
              big ? 'mt-0.5 text-[13px]' : 'text-[9.5px] leading-tight',
            )}
          >
            {meta}
          </div>
        )}
      </div>
      {priority && big && (
        <span className={cn('text-xs font-semibold uppercase', text[priority])}>{priority}</span>
      )}
    </div>
  )
}

function Stat({
  value,
  label,
  big,
  tone = 'text-cyan',
}: {
  value: string
  label: string
  big?: boolean
  tone?: string
}) {
  return (
    <div
      className={cn(
        'rounded-[5px] border border-white/[0.05] bg-white/[0.025]',
        big ? 'p-4' : 'px-1.5 py-1',
      )}
    >
      <div
        className={cn(
          'num font-semibold tracking-tight',
          tone,
          big ? 'text-4xl' : 'text-[15px] leading-none',
        )}
      >
        {value}
      </div>
      <div
        className={cn('eyebrow mt-1 truncate', big ? 'text-xs' : 'text-[7.5px] tracking-[0.1em]')}
      >
        {label}
      </div>
    </div>
  )
}

function Bars({ n = 28, big, seed = 1 }: { n?: number; big?: boolean; seed?: number }) {
  return (
    <div className={cn('flex items-end gap-[2px]', big ? 'h-56' : 'h-full min-h-6')}>
      {Array.from({ length: n }, (_, i) => {
        const h = 18 + ((i * 17 * seed + 13 * i * i) % 72) + (i > n - 5 ? 10 : 0)
        return (
          <span
            key={i}
            className="flex-1 rounded-t-[1.5px] bg-gradient-to-t from-cyan-deep/40 to-cyan/80"
            style={{ height: `${Math.min(100, h)}%` }}
          />
        )
      })}
    </div>
  )
}

export function ScreenContent({ content, big, contextRef }: Props) {
  switch (content) {
    case 'news':
      return <NewsList big={big} />
    case 'events':
      return <EventsList big={big} />
    case 'alerts':
      return <AlertsList big={big} />
    case 'cases':
      return <CasesList big={big} />
    case 'map-ng':
      return <MapScreen big={big} contextRef={contextRef} />
    case 'map-region':
      return <RegionScreen big={big} />
    case 'news-analytics':
      return (
        <div className="flex h-full flex-col gap-1.5">
          <div className={cn('grid grid-cols-4', big ? 'gap-3' : 'gap-1')}>
            <Stat big={big} value="428" label="Articles" />
            <Stat big={big} value="89" label="Sources" />
            <Stat big={big} value="12" label="Events" />
            <Stat big={big} value="3" label="High" tone="text-red" />
          </div>
          <div className="min-h-0 flex-1">
            <Bars big={big} />
          </div>
          {big && (
            <p className="text-sm text-ink-muted">
              24 h article volume · Security 38% · Public safety 21% · Economy 12%
            </p>
          )}
        </div>
      )
    case 'social':
      return (
        <div className="flex h-full flex-col gap-1">
          <div className={cn('grid grid-cols-2', big ? 'gap-3' : 'gap-1')}>
            <Stat big={big} value="12.4K" label="Public posts" />
            <Stat big={big} value="15" label="Topics" />
          </div>
          {[
            ['Transport safety discussion · Kaduna', '2.4K interactions'],
            ['Emergency guidance shared · FCT', '1.2K interactions'],
            ['Unverified incident claim circulating', '640 interactions'],
            ['Regional road update · Zamfara', '410 interactions'],
          ].map(([t, m]) => (
            <Row key={t} big={big} title={t!} meta={m} />
          ))}
        </div>
      )
    case 'trending':
      return (
        <div>
          {[
            '#KadunaUpdates',
            '#NigeriaSecurity',
            '#RoadSafety',
            '#PHBlast',
            '#RegionalNews',
            '#FCTAdvisory',
          ].map((tag, i) => (
            <div
              key={tag}
              className={cn(
                'flex items-center gap-2 border-b border-white/[0.04]',
                big ? 'py-3' : 'py-[4px]',
              )}
            >
              <span className={cn('num w-3 text-cyan/70', big ? 'w-6 text-base' : 'text-[9.5px]')}>
                {i + 1}
              </span>
              <span
                className={cn('flex-1 truncate font-medium', big ? 'text-[17px]' : 'text-[10.5px]')}
              >
                {tag}
              </span>
              <span className={cn('num text-ink-muted', big ? 'text-sm' : 'text-[9.5px]')}>
                {(24 - i * 3.4).toFixed(1)}K
              </span>
              <span className={cn('num font-semibold text-red', big ? 'text-sm' : 'text-[9.5px]')}>
                ↗{320 - i * 43}%
              </span>
            </div>
          ))}
        </div>
      )
    case 'risk':
      return (
        <div className="flex h-full flex-col gap-1.5">
          <div className={cn('grid grid-cols-2', big ? 'gap-3' : 'gap-1')}>
            <Stat big={big} value="64" label="Risk index" tone="text-amber" />
            <Stat big={big} value="8" label="High priority" tone="text-red" />
          </div>
          {[
            ['Public safety', 0.78, 'bg-red'],
            ['Civil unrest', 0.52, 'bg-amber'],
            ['Information integrity', 0.66, 'bg-amber'],
            ['Critical infrastructure', 0.58, 'bg-amber'],
            ['Health', 0.24, 'bg-teal'],
          ].map(([label, v, c]) => (
            <div key={label as string} className={big ? 'py-1' : ''}>
              <div
                className={cn(
                  'flex justify-between text-ink-2',
                  big ? 'text-sm' : 'text-[9px] leading-tight',
                )}
              >
                <span>{label as string}</span>
                <span className="num text-ink-muted">{Math.round((v as number) * 100)}</span>
              </div>
              <div
                className={cn(
                  'mt-0.5 overflow-hidden rounded-full bg-white/[0.06]',
                  big ? 'h-2' : 'h-[3px]',
                )}
              >
                <div
                  className={cn('h-full rounded-full', c as string)}
                  style={{ width: `${(v as number) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )
    case 'media-images':
      return (
        <div className={cn('flex h-full', big ? 'gap-5' : 'gap-1.5')}>
          <div
            className={cn(
              'grid shrink-0 grid-cols-2 grid-rows-2',
              big ? 'w-1/2 gap-2' : 'w-[46%] gap-1',
            )}
          >
            {[190, 28, 210, 165].map((hue, i) => (
              <div
                key={hue}
                className="relative overflow-hidden rounded-[4px] ring-1 ring-white/10"
                style={{
                  background: `linear-gradient(140deg, hsl(${hue} 30% 26%), hsl(${hue + 30} 35% 12%))`,
                }}
              >
                <div className="absolute inset-0 scanlines opacity-60" />
                {i === 2 && (
                  <span
                    className={cn(
                      'absolute right-0.5 bottom-0.5 rounded-[2px] bg-amber/90 px-1 font-semibold text-void',
                      big ? 'text-xs' : 'text-[7px]',
                    )}
                  >
                    0.91
                  </span>
                )}
              </div>
            ))}
          </div>
          <div
            className={cn(
              'min-w-0 flex-1 text-ink-2',
              big ? 'space-y-2 text-base' : 'space-y-[2px] text-[9.5px] leading-tight',
            )}
          >
            <div className={cn('font-semibold text-ink', big ? 'text-lg' : 'text-[10.5px]')}>
              Image review
            </div>
            <div>Scene: urban exterior</div>
            <div>
              Prior occurrence: <span className="text-amber">5 results</span>
            </div>
            <div>
              Location: <span className="text-ink-muted">estimated</span>
            </div>
            <div>
              Synthetic: <span className="text-green">no indication</span>
            </div>
          </div>
        </div>
      )
    case 'video':
      return <VideoScreen big={big} />
    case 'verification':
      return (
        <div>
          {[
            ['Viral video of reported fire', 'Check date and location · A. Nwosu', 'high'],
            ['Government announcement (audio)', 'Verify provenance · I. Sani', 'high'],
            ['Image of convoy', 'Recycled content check · unassigned', 'medium'],
            ['Social media claim', 'Compare with official · M. Abdullahi', 'medium'],
          ].map(([t, m, p]) => (
            <Row key={t} big={big} title={t!} meta={m} priority={p as Priority} />
          ))}
        </div>
      )
    case 'entities':
      return <EntityGraph big={big} />
    case 'system':
      return (
        <div className="flex h-full flex-col gap-1">
          <div className={cn('grid grid-cols-3', big ? 'gap-3' : 'gap-1')}>
            <Stat big={big} value="99.8%" label="Uptime" tone="text-green" />
            <Stat big={big} value="8/8" label="Workers" tone="text-green" />
            <Stat big={big} value="41s" label="Feed lag" />
          </div>
          <div className={cn('grid grid-cols-2 gap-x-2', big && 'mt-2 gap-y-2')}>
            {['Ingestion', 'AI processing', 'Evidence store', 'Wall controller'].map((s, i) => (
              <div
                key={s}
                className={cn(
                  'flex items-center gap-1.5 text-ink-2',
                  big ? 'text-base' : 'text-[9.5px]',
                )}
              >
                <span className={cn('size-1.5 rounded-full', i === 3 ? 'bg-amber' : 'bg-green')} />
                {s}
                <span className="ml-auto text-ink-faint">{i === 3 ? 'sim' : 'ok'}</span>
              </div>
            ))}
          </div>
        </div>
      )
    case 'live-feeds':
      return (
        <div className={cn('grid h-full grid-cols-2 grid-rows-2', big ? 'gap-3' : 'gap-1')}>
          {['Abuja traffic', 'Lagos transit', 'Kaduna bulletin', 'Weather · Sahel'].map((f, i) => (
            <div
              key={f}
              className="relative overflow-hidden rounded-[4px] ring-1 ring-white/10"
              style={{
                background: `linear-gradient(160deg, hsl(${200 + i * 12} 25% 18%), hsl(${210 + i * 8} 30% 9%))`,
              }}
            >
              <div className="absolute inset-0 scanlines" />
              <span
                className={cn(
                  'absolute top-1 left-1 flex items-center gap-1 rounded-[2px] bg-black/50 px-1 text-white/85',
                  big ? 'text-xs' : 'text-[7.5px]',
                )}
              >
                <span className="size-1 rounded-full bg-red" /> {f}
              </span>
            </div>
          ))}
        </div>
      )
  }
}

function NewsList({ big }: { big?: boolean }) {
  const { data } = useFeed()
  const now = useNow()
  return (
    <div>
      {(data?.items ?? []).slice(0, big ? 9 : 6).map((g) => (
        <Row
          key={g.id}
          big={big}
          title={g.headline}
          meta={`${g.place} · ${g.independentOutlets} outlets · ${relative(g.lastUpdated, now)}`}
          priority={g.priority}
        />
      ))}
    </div>
  )
}

function EventsList({ big }: { big?: boolean }) {
  const { data } = useWatchFloor()
  return (
    <div>
      {(data?.events ?? []).slice(0, big ? 10 : 6).map((e) => (
        <Row
          key={e.id}
          big={big}
          title={e.title}
          meta={`${e.place} · ${e.precision}${e.caseRef ? ` · ${e.caseRef}` : ''}`}
          priority={e.priority}
        />
      ))}
    </div>
  )
}

function AlertsList({ big }: { big?: boolean }) {
  const { data } = useAlerts()
  const now = useNow(15_000)
  const open = (data?.items ?? []).filter((a) => a.status !== 'resolved')
  return (
    <div>
      {open.slice(0, big ? 9 : 6).map((a) => (
        <Row
          key={a.id}
          big={big}
          title={a.title}
          meta={`${a.status === 'acknowledged' ? `Ack · ${a.acknowledgedBy}` : a.status === 'escalated' ? `Escalated L${a.escalationLevel}` : 'Open'} · ${relative(a.raisedAt, now)}`}
          priority={a.severity}
        />
      ))}
    </div>
  )
}

function CasesList({ big }: { big?: boolean }) {
  const { data } = useCases('active')
  return (
    <div>
      {(data?.items ?? []).slice(0, big ? 10 : 6).map((c) => (
        <div
          key={c.id}
          className={cn(
            'flex items-center gap-2 border-b border-white/[0.04]',
            big ? 'py-3' : 'py-[4px]',
          )}
        >
          <span
            className={cn(
              'num shrink-0 font-mono text-cyan',
              big ? 'w-24 text-sm' : 'w-[46px] text-[9px]',
            )}
          >
            {c.ref}
          </span>
          <span className={cn('min-w-0 flex-1 truncate', big ? 'text-[17px]' : 'text-[10px]')}>
            {c.title}
          </span>
          <span className={cn('shrink-0 text-ink-muted', big ? 'text-sm' : 'text-[8.5px]')}>
            {caseStateLabel(c.state)}
          </span>
        </div>
      ))}
    </div>
  )
}

function MapScreen({ big, contextRef }: { big?: boolean; contextRef?: string }) {
  const { data } = useWatchFloor()
  const events = data?.events ?? []
  const focus = contextRef ? events.find((e) => e.caseRef === contextRef) : undefined
  return (
    <div className="relative h-full">
      <NigeriaMap events={events} selectedId={focus?.id} dense={!big} labels />
      {focus && (
        <div
          className={cn(
            'absolute top-0 left-0 rounded-[4px] border border-cyan/30 bg-void/70 backdrop-blur-sm',
            big ? 'p-3 text-sm' : 'px-1.5 py-0.5 text-[8.5px]',
          )}
        >
          <span className="font-mono text-cyan">{contextRef}</span> · {focus.title}
        </div>
      )}
    </div>
  )
}

function RegionScreen({ big }: { big?: boolean }) {
  const states = [
    ['Niger', 'Border exercise announced', 'low'],
    ['Benin', 'Trade corridor normal', 'low'],
    ['Cameroon', 'Displacement reports, north', 'medium'],
    ['Chad', 'Lake Chad basin advisory', 'medium'],
    ['Ghana', 'No significant reporting', 'low'],
  ] as const
  return (
    <div
      className={cn(
        'grid h-full',
        big ? 'grid-cols-[1.2fr_1fr] gap-6' : 'grid-cols-[1fr_1.15fr] gap-1.5',
      )}
    >
      <div className="relative overflow-hidden rounded-[4px] grid-texture ring-1 ring-white/[0.06]">
        <svg viewBox="0 0 100 70" className="h-full w-full" aria-hidden>
          <path
            d="M8 20 L30 12 L52 14 L70 10 L92 22 L88 40 L70 52 L48 60 L26 56 L10 40 Z"
            fill="rgb(69 215 242 / .06)"
            stroke="rgb(69 215 242 / .35)"
            strokeWidth=".6"
          />
          <path
            d="M44 30 L58 28 L66 36 L62 50 L48 54 L40 44 Z"
            fill="rgb(69 215 242 / .16)"
            stroke="rgb(69 215 242 / .7)"
            strokeWidth=".8"
          />
          {[
            [52, 40, 'red'],
            [74, 26, 'amber'],
            [78, 44, 'amber'],
            [30, 34, 'teal'],
          ].map(([x, y, c]) => (
            <circle
              key={`${x}${y}`}
              cx={x as number}
              cy={y as number}
              r="1.8"
              fill={`var(--color-${c})`}
            />
          ))}
        </svg>
      </div>
      <div>
        {states.map(([s, t, p]) => (
          <Row key={s} big={big} title={s} meta={t} priority={p} />
        ))}
      </div>
    </div>
  )
}

function VideoScreen({ big }: { big?: boolean }) {
  return (
    <div className="flex h-full flex-col gap-1">
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-[4px] ring-1 ring-white/10"
        style={{ background: 'linear-gradient(150deg, #24343b, #0c1418 70%)' }}
      >
        <div className="absolute inset-0 scanlines" />
        <div className="absolute inset-x-[18%] top-[22%] h-[36%] rounded-sm border border-amber/70">
          <span
            className={cn(
              'absolute -top-px left-0 -translate-y-full bg-amber px-1 font-semibold text-void',
              big ? 'text-xs' : 'text-[6.5px]',
            )}
          >
            smoke 0.88
          </span>
        </div>
        <div className="absolute right-[12%] bottom-[18%] h-[22%] w-[20%] rounded-sm border border-cyan/70">
          <span
            className={cn(
              'absolute -top-px left-0 -translate-y-full bg-cyan px-1 font-semibold text-void',
              big ? 'text-xs' : 'text-[6.5px]',
            )}
          >
            vehicle
          </span>
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <span
            className={cn(
              'grid place-items-center rounded-full bg-black/45 text-white/90 ring-1 ring-white/20',
              big ? 'size-16' : 'size-6',
            )}
          >
            {big ? <Pause size={28} /> : <Play size={11} />}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={cn('num text-ink-muted', big ? 'text-sm' : 'text-[8.5px]')}>
          00:21 / 01:24
        </span>
        <div className="relative h-[3px] flex-1 rounded-full bg-white/10">
          <div className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-cyan" />
          <div
            className="absolute top-1/2 left-[61%] size-[5px] -translate-y-1/2 rounded-full bg-amber"
            title="Archive match"
          />
        </div>
      </div>
    </div>
  )
}

function EntityGraph({ big }: { big?: boolean }) {
  const nodes = [
    { id: 'a', x: 50, y: 34, r: 7, label: 'Kawo fire', c: 'red' },
    { id: 'b', x: 22, y: 18, r: 4.5, label: 'SEMA', c: 'cyan' },
    { id: 'c', x: 80, y: 20, r: 4.5, label: 'T. Okafor', c: 'violet' },
    { id: 'd', x: 18, y: 50, r: 4, label: 'Archive clip', c: 'amber' },
    { id: 'e', x: 82, y: 52, r: 4, label: 'Kawo, Kaduna N.', c: 'teal' },
    { id: 'f', x: 52, y: 60, r: 3.5, label: 'Radio caller', c: 'violet' },
  ]
  const edges = [
    ['a', 'b'],
    ['a', 'c'],
    ['a', 'd'],
    ['a', 'e'],
    ['a', 'f'],
    ['c', 'e'],
    ['d', 'f'],
  ]
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  return (
    <div className="relative h-full overflow-hidden rounded-[4px] bg-[radial-gradient(circle_at_50%_45%,rgb(69_215_242/.08),transparent_70%)]">
      <svg viewBox="0 0 100 70" className="h-full w-full" aria-label="Entity link graph">
        {edges.map(([a, b]) => (
          <line
            key={`${a}${b}`}
            x1={byId[a!]!.x}
            y1={byId[a!]!.y}
            x2={byId[b!]!.x}
            y2={byId[b!]!.y}
            stroke="rgb(69 215 242 / .35)"
            strokeWidth=".5"
            strokeDasharray={a === 'c' || a === 'd' ? '1.5 1.2' : undefined}
          />
        ))}
        {nodes.map((n) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={`color-mix(in oklab, var(--color-${n.c}) 22%, #0b1621)`}
              stroke={`var(--color-${n.c})`}
              strokeWidth=".7"
            />
            <text
              x={n.x}
              y={n.y + n.r + (big ? 4.5 : 5)}
              textAnchor="middle"
              fontSize={big ? 3.2 : 4}
              fill="#a9c2cf"
              fontFamily="var(--font-sans)"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>
      {big && (
        <p className="absolute bottom-2 left-3 text-sm text-ink-muted">
          Graph shows potential relationships, not confirmed associations.
        </p>
      )}
    </div>
  )
}
