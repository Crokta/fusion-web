import { FileLock2, Link2, Search, SlidersHorizontal } from 'lucide-react'
import { useDeferredValue, useState } from 'react'
import { describeError } from '@/api'
import { useAudit, usePolicies, useUpdatePolicy } from '@/api/queries'
import { ROLE_LABEL, type PolicyRecord } from '@/api/types'
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
  SkeletonRows,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, relative } from '@/lib/format'
import { useNow } from '@/lib/hooks'

function Toggle({
  on,
  disabled,
  onClick,
  label,
}: {
  on: boolean
  disabled?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-45',
        on ? 'bg-cyan/80 shadow-[0_0_12px_-2px_rgb(69_215_242/.7)]' : 'bg-tint/[0.1]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform duration-200',
          on && 'translate-x-4',
        )}
      />
    </button>
  )
}

const ACTIONS = ['', 'approval', 'case', 'review', 'wall', 'policy', 'search', 'evidence', 'alert']

export function AdminPage() {
  const { activeRole } = useAuth()
  const policies = usePolicies()
  const update = useUpdatePolicy()
  const toast = useToast()
  const now = useNow()
  const [pending, setPending] = useState<PolicyRecord | null>(null)
  const [authority, setAuthority] = useState('')
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const deferredActor = useDeferredValue(actor.trim())
  const audit = useAudit(deferredActor || undefined, action || undefined)
  const allowed = can.changePolicy(activeRole)

  const confirm = () => {
    if (!pending) return
    update.mutate(
      { key: pending.key, value: !pending.value, authorityRef: authority.trim() },
      {
        onSuccess: (p) => {
          toast({
            title: `${p.label} ${p.value ? 'enabled' : 'disabled'}`,
            detail: `Version ${p.version} · ${p.authorityRef}`,
            tone: 'success',
          })
          setPending(null)
          setAuthority('')
        },
        onError: (e) =>
          toast({ title: 'Policy not changed', detail: describeError(e), tone: 'error' }),
      },
    )
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Governance · System"
        title="Admin"
        description="Signed policy records and the audit trail. Every change needs an authority reference and is versioned."
      />

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[400px_minmax(0,1fr)]">
        <Panel
          title="Policy flags"
          icon={SlidersHorizontal}
          className="self-start"
          actions={!allowed && <Badge tone="neutral">Read only · {ROLE_LABEL[activeRole]}</Badge>}
          bodyClassName="p-0"
        >
          {policies.isPending ? (
            <SkeletonRows rows={5} />
          ) : policies.isError ? (
            <ErrorNotice error={policies.error} onRetry={() => policies.refetch()} />
          ) : (
            <ul className="divide-y divide-line-soft">
              {policies.data.map((p) => (
                <li key={p.key} className="flex gap-4 px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-ink">{p.label}</span>
                      <span className="font-mono text-[10px] text-ink-faint">v{p.version}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-ink-muted">
                      {p.description}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[10.5px] text-ink-faint">
                      <span className="inline-flex items-center gap-1 font-mono text-ink-muted">
                        <Link2 size={10} />
                        {p.authorityRef}
                      </span>
                      <span>
                        · {p.changedBy} · {relative(p.changedAt, now)}
                      </span>
                    </p>
                  </div>
                  <Toggle
                    on={p.value}
                    disabled={!allowed}
                    label={p.label}
                    onClick={() => setPending(p)}
                  />
                </li>
              ))}
            </ul>
          )}
          {!allowed && (
            <p className="border-t border-line-soft px-4 py-2.5 text-[11px] text-ink-faint">
              Switch to Administrator or Centre lead to change policy.
            </p>
          )}
        </Panel>

        <Panel
          title="Audit log"
          icon={FileLock2}
          eyebrow="Hash-chained · INSERT-only"
          bodyClassName="p-0"
          actions={
            <div className="flex items-center gap-2">
              <label className="relative">
                <span className="sr-only">Filter by actor</span>
                <Search
                  size={13}
                  className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-ink-faint"
                />
                <input
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="Actor"
                  className={cn(inputClass, 'h-7 w-36 py-0 pl-7 text-[12px]')}
                />
              </label>
              <label>
                <span className="sr-only">Filter by action</span>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className={cn(inputClass, 'h-7 w-32 py-0 text-[12px]')}
                >
                  {ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {a ? `${a}.*` : 'All actions'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          }
        >
          {audit.isPending ? (
            <SkeletonRows rows={8} />
          ) : audit.isError ? (
            <ErrorNotice error={audit.error} onRetry={() => audit.refetch()} />
          ) : audit.data.items.length === 0 ? (
            <EmptyState icon={FileLock2} title="No audit events match" />
          ) : (
            <div
              className={cn('overflow-x-auto transition-opacity', audit.isFetching && 'opacity-70')}
            >
              <table className="w-full min-w-[820px] text-left text-[12px]">
                <thead>
                  <tr className="eyebrow border-b border-line-soft text-[9.5px]">
                    <th className="py-2 pr-2 pl-4 font-semibold">Time</th>
                    <th className="px-2 py-2 font-semibold">Actor</th>
                    <th className="px-2 py-2 font-semibold">Action</th>
                    <th className="px-2 py-2 font-semibold">Target</th>
                    <th className="px-2 py-2 font-semibold">Outcome</th>
                    <th className="px-2 py-2 font-semibold">Purpose</th>
                    <th className="py-2 pr-4 pl-2 font-semibold">Row hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {audit.data.items.map((e) => (
                    <tr key={e.id} className="hover:bg-tint/[0.02]">
                      <td className="num py-2.5 pr-2 pl-4 whitespace-nowrap text-ink-muted">
                        {dateTime(e.at)}
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="whitespace-nowrap text-ink-2">{e.actor}</div>
                        <div className="text-[10.5px] text-ink-faint">
                          {e.role === 'service' ? 'Service account' : ROLE_LABEL[e.role]}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 font-mono text-[11px] text-cyan/90">{e.action}</td>
                      <td
                        className="max-w-[220px] truncate px-2 py-2.5 text-ink-2"
                        title={e.target}
                      >
                        {e.target}
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge tone={e.outcome === 'allowed' ? 'green' : 'red'}>{e.outcome}</Badge>
                      </td>
                      <td
                        className="max-w-[200px] truncate px-2 py-2.5 text-ink-muted"
                        title={e.purpose}
                      >
                        {e.purpose ?? '—'}
                      </td>
                      <td
                        className="py-2.5 pr-4 pl-2 font-mono text-[10.5px] text-ink-faint"
                        title={e.rowHash}
                      >
                        {e.rowHash.slice(0, 10)}…
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `${pending.value ? 'Disable' : 'Enable'} “${pending.label}”` : ''}
        description="Policy changes are signed, versioned and audited. Cite the directive or SOP that authorises this change."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={update.isPending}
              disabled={!authority.trim()}
              onClick={confirm}
            >
              Sign and apply
            </Button>
          </>
        }
      >
        <Field
          label="Authority reference"
          hint={pending ? `Current: ${pending.authorityRef} (v${pending.version})` : undefined}
        >
          <input
            value={authority}
            onChange={(e) => setAuthority(e.target.value)}
            placeholder="e.g. DG-DIR-2026-052"
            className={inputClass}
            autoFocus
          />
        </Field>
      </Modal>
    </div>
  )
}
