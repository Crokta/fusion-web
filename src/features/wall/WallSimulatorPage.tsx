import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Cable,
  History,
  MonitorOff,
  MonitorPlay,
  ScrollText,
  ShieldAlert,
  VolumeX,
} from 'lucide-react'
import { useMemo } from 'react'
import { useWallController, useWallLayoutPublications, useWallState } from '@/api/queries'
import { ROLE_LABEL, type WallControllerStatus, type WallState } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
  Badge,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Panel,
  Skeleton,
  SkeletonRows,
} from '@/components/ui'
import { relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { screenLabel } from '@/lib/wall-model'
import { WallGrid } from './WallGrid'
import { DisplayTokensPanel } from './DisplayTokensPanel'

/**
 * What the wall controller says the physical wall shows. Until the AV vendor's hardware is
 * wired (E36) the controller is reporting's simulator (ADR 0015), so this is the only place a
 * published layout can be seen. It shows the controller's copy, not the planner's layout.
 */
export function WallSimulatorPage() {
  const { activeRole } = useAuth()
  const allowed = can.viewWall(activeRole)
  return (
    <div className="mx-auto max-w-[1600px] px-6 py-6">
      <PageHeader
        eyebrow={
          <Link to="/wall" className="inline-flex items-center gap-1 hover:text-cyan">
            <ArrowLeft size={11} /> Wall planner
          </Link>
        }
        title="Wall controller"
        description="What the controller is showing on the 16 screens now. Layouts reach it only when an operator publishes them from the planner."
      />
      {allowed ? (
        <Controller />
      ) : (
        <Panel>
          <EmptyState icon={ShieldAlert} title="The wall isn't open to your role">
            Acting as {ROLE_LABEL[activeRole]}. Analysts, supervisors, reviewers, centre leads and
            leadership can see it.
          </EmptyState>
        </Panel>
      )}
    </div>
  )
}

function Controller() {
  const { activeRole } = useAuth()
  const controller = useWallController()
  const wall = useWallState()
  const history = useWallLayoutPublications()
  const now = useNow()
  const status = controller.data
  const shown = useMemo(() => (status ? asState(status) : undefined), [status])

  if (controller.isError)
    return <ErrorNotice error={controller.error} onRetry={() => controller.refetch()} />
  if (!status)
    return (
      <div className="aspect-video">
        <Skeleton className="h-full rounded-xl" />
      </div>
    )

  const draft = wall.data
  const behind = !!draft && !!status.layout && draft.revision !== status.layout.revision

  return (
    <div className="grid grid-cols-1 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <section aria-label="Simulated wall" className="min-w-0">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Badge tone={status.online ? 'green' : 'red'}>
            {status.online ? 'Controller online' : 'Controller offline'}
          </Badge>
          <Badge tone="cyan">Adapter · {status.adapter}</Badge>
          {status.inputsMuted && (
            <Badge tone="amber">
              <VolumeX size={11} className="mr-1 inline -translate-y-px" />
              Share inputs muted
            </Badge>
          )}
          {status.layout && (
            <span className="text-[12px] text-ink-muted">
              {status.layout.publicationRef} · {status.layout.preset} · revision{' '}
              {status.layout.revision}
              {status.layoutActivatedAt && ` · ${relative(status.layoutActivatedAt, now)}`}
            </span>
          )}
          {behind && (
            <Badge tone="amber" className="ml-auto">
              Planner is at revision {draft.revision}: not yet published
            </Badge>
          )}
        </div>
        <div className="rounded-xl border border-line-strong bg-[#020507] p-2" data-theme="dark">
          <div className="relative aspect-video">
            {shown ? (
              <WallGrid
                state={shown}
                selection={[]}
                onSelectionChange={() => {}}
                onFocus={() => {}}
                onSwap={() => {}}
                statusOverlay
                presentation
              />
            ) : (
              <div className="grid h-full place-items-center">
                <EmptyState
                  icon={MonitorOff}
                  title="Nothing published since the controller started"
                >
                  Publish a layout from the planner to put it on the wall.
                </EmptyState>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 content-start gap-3 md:grid-cols-2 2xl:grid-cols-1">
        <Panel title="Share inputs" icon={Cable}>
          {status.routes.length === 0 ? (
            <p className="text-[12px] text-ink-muted">
              {status.inputsMuted
                ? 'Muted: the wall is in Visitor Mode.'
                : 'No share input is routed to the wall.'}
            </p>
          ) : (
            <ul className="space-y-1 text-[12px]">
              {status.routes.map((r) => (
                <li key={r.input} className="flex justify-between gap-2">
                  <span className="font-mono text-ink">{r.input}</span>
                  <span className="text-ink-muted">{r.screens.map(screenLabel).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Publications" icon={History} bodyClassName="p-0">
          {history.isPending ? (
            <div className="p-4">
              <SkeletonRows rows={3} />
            </div>
          ) : !history.data?.length ? (
            <p className="p-4 text-[12px] text-ink-muted">No layout has been published yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {history.data.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2 text-[12px]">
                  <MonitorPlay
                    size={13}
                    className={p.delivered ? 'text-green' : 'text-red'}
                    aria-hidden
                  />
                  <span className="font-mono text-ink">{p.ref}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {p.delivered
                      ? `${p.preset} · rev ${p.revision}`
                      : (p.failure ?? 'Not delivered')}
                  </span>
                  <span className="shrink-0 text-ink-faint">
                    {p.publishedBy} · {relative(p.publishedAt, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Controller log" icon={ScrollText} bodyClassName="p-0">
          {status.log.length === 0 ? (
            <p className="p-4 text-[12px] text-ink-muted">
              No commands since the controller started.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
              {status.log.map((c, i) => (
                <li
                  key={`${c.at}-${i}`}
                  className="flex items-center gap-2 px-4 py-1.5 text-[11.5px]"
                >
                  <span
                    className={
                      c.accepted ? 'size-1.5 rounded-full bg-green' : 'size-1.5 rounded-full bg-red'
                    }
                    aria-label={c.accepted ? 'Accepted' : 'Refused'}
                  />
                  <span className="font-mono text-ink">{c.command}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-muted">{c.detail}</span>
                  <span className="shrink-0 text-ink-faint">{relative(c.at, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {can.publishToWall(activeRole) && <DisplayTokensPanel />}
      </div>
    </div>
  )
}

/** The controller's layout in the planner's shape, so the same tiles render it. */
function asState(status: WallControllerStatus): WallState | undefined {
  const layout = status.layout
  if (!layout) return undefined
  return {
    revision: layout.revision,
    preset: layout.preset,
    rows: 4,
    cols: 4,
    screens: layout.screens,
    groups: layout.groups,
    visitorMode: status.inputsMuted,
    controller: status.online ? 'simulated' : 'offline',
    updatedAt: status.layoutActivatedAt ?? '',
    updatedBy: '',
  }
}
