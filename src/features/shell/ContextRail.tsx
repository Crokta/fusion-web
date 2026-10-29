import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Cpu, MonitorPlay, PanelRightClose } from 'lucide-react'
import { useCase } from '@/api/queries'
import {
  Badge,
  CaseStateBadge,
  IconButton,
  MarkingTag,
  Meter,
  Skeleton,
  priorityTone,
} from '@/components/ui'
import { dateTime, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'
import { useLive } from '@/realtime/LiveProvider'
import { useShell } from './ShellContext'

/**
 * The right-hand rail: whatever the analyst last selected, and the case behind it. It is the
 * one place on every screen that answers "what am I looking at, and what does it belong to?".
 */
export function ContextRail() {
  const { selection, setContextOpen } = useShell()
  const now = useNow()
  const caseId = selection.caseRef?.toLowerCase()
  const kase = useCase(caseId ?? '')
  const { jobs } = useLive()

  return (
    <aside
      aria-label="Context"
      className="flex w-[288px] shrink-0 animate-fade-in flex-col border-l border-line bg-void/50"
    >
      <div className="flex h-11 items-center gap-2 border-b border-line-soft px-4">
        <span className="eyebrow flex-1">Context</span>
        <IconButton
          icon={PanelRightClose}
          label="Hide context"
          onClick={() => setContextOpen(false)}
          className="-mr-2 size-7"
        />
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <section key={selection.title} className="animate-rise-in">
          <div className="eyebrow mb-2 text-cyan/80">Selected {selection.kind}</div>
          <h3 className="text-[14px] leading-snug font-semibold text-ink">{selection.title}</h3>
          <dl className="mt-3 grid grid-cols-[84px_1fr] gap-y-1.5 text-[12px]">
            {selection.source && (
              <>
                <dt className="text-ink-faint">Source</dt>
                <dd className="text-ink-2">{selection.source}</dd>
              </>
            )}
            {selection.priority && (
              <>
                <dt className="text-ink-faint">Priority</dt>
                <dd>
                  <Badge tone={priorityTone[selection.priority]} className="uppercase">
                    {selection.priority === 'high' ? 'Review' : selection.priority}
                  </Badge>
                </dd>
              </>
            )}
            {selection.raisedAt && (
              <>
                <dt className="text-ink-faint">Raised</dt>
                <dd className="num text-ink-2">
                  {dateTime(selection.raisedAt)}{' '}
                  <span className="text-ink-faint">· {relative(selection.raisedAt, now)}</span>
                </dd>
              </>
            )}
            {selection.state && (
              <>
                <dt className="text-ink-faint">State</dt>
                <dd className="text-ink-2">{selection.state}</dd>
              </>
            )}
            {selection.place && (
              <>
                <dt className="text-ink-faint">Location</dt>
                <dd className="text-ink-2">{selection.place}</dd>
              </>
            )}
          </dl>
        </section>

        {caseId && (
          <section className="rounded-lg border border-line bg-panel/70 p-3.5">
            <div className="eyebrow mb-2">Related case</div>
            {kase.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : kase.data ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-cyan">
                    {kase.data.ref}
                  </span>
                  <CaseStateBadge state={kase.data.state} />
                </div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{kase.data.title}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    ['Signals', kase.data.signalCount],
                    ['Evidence', kase.data.evidence.length],
                    ['Findings', kase.data.findings.length],
                    ['Indicators', kase.data.indicators.length],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md bg-tint/[0.025] px-2.5 py-1.5">
                      <dd className="num text-[15px] font-semibold text-ink">{v}</dd>
                      <dt className="text-[10.5px] text-ink-faint">{k}</dt>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex items-center gap-2">
                  <MarkingTag marking={kase.data.marking} />
                  <span className="text-[11px] text-ink-faint">{kase.data.category}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to="/cases/$caseId"
                    params={{ caseId: kase.data.id }}
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md bg-cyan/90 text-xs font-semibold text-void hover:bg-cyan"
                  >
                    Open case <ArrowUpRight size={13} />
                  </Link>
                  <Link
                    to="/wall"
                    className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-line-strong text-xs font-medium text-ink-2 hover:border-cyan/50 hover:text-ink"
                  >
                    <MonitorPlay size={13} /> Wall queue
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-xs text-ink-muted">Case not available for the active role.</p>
            )}
          </section>
        )}

        {jobs.length > 0 && (
          <section>
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <Cpu size={12} className="text-cyan" /> Analysis jobs
            </div>
            <ul className="space-y-2.5">
              {jobs.map((j) => (
                <li key={j.jobId} className="text-[11.5px]">
                  <div className="mb-1 flex justify-between gap-2">
                    <span className="truncate text-ink-2">{j.label}</span>
                    <span className="num text-ink-faint">{j.percent}%</span>
                  </div>
                  <Meter value={j.percent / 100} tone={j.percent >= 100 ? 'green' : 'cyan'} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="rounded-md border border-dashed border-line-strong/70 px-3 py-2.5 text-[11px] leading-relaxed text-ink-faint">
          Indicators are model outputs with stated limitations. They inform findings; they never set
          them.
        </p>
      </div>
    </aside>
  )
}
