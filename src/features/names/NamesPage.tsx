import { useNavigate, Link } from '@tanstack/react-router'
import { ArrowRight, FolderOpen, Search, ShieldAlert, UserSearch } from 'lucide-react'
import { useState } from 'react'
import { useNameSearches, useStartNameSearch } from '@/api/queries'
import type { NameSearchKind } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import {
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
import { relative } from '@/lib/format'
import { KindBadge, StatusBadge, refusalText } from './badges'

/**
 * Name-of-interest searches (architecture §7.1, ADR 0013). Analysts and supervisors ask for them
 * and work a public figure's results; a private individual's results are the centre lead's, and
 * only while the PI policy is on.
 */
export function NamesPage() {
  const { activeRole } = useAuth()
  const asks = can.searchNames(activeRole)
  const readsPi = can.readPiResults(activeRole)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Analysis"
        title="Names of interest"
        description="Search the platform's stories, cases and evidence for a name. Its mentions are grouped into clusters, so you can confirm which ones mean the person you are after, and take report data for a brief or the wall. Every search and every read is audited."
      />
      {!asks && !readsPi && (
        <Panel>
          <EmptyState icon={ShieldAlert} title="Your active role cannot use name searches">
            Analysts and supervisors ask for name searches. The centre lead reads a private
            individual's results.
          </EmptyState>
        </Panel>
      )}
      {asks && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <NewSearch />
          <MySearches />
        </div>
      )}
      {readsPi && <OpenPiSearch />}
    </div>
  )
}

function NewSearch() {
  const navigate = useNavigate()
  const start = useStartNameSearch()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<NameSearchKind>('public')
  const [reason, setReason] = useState('')
  const pi = kind === 'private_individual'
  const ready = name.trim().length > 1 && (!pi || reason.trim().length > 0)

  const submit = () =>
    start.mutate(
      { name: name.trim(), kind, reason: pi ? reason.trim() : undefined },
      { onSuccess: (s) => navigate({ to: '/names/$searchId', params: { searchId: s.id } }) },
    )

  return (
    <Panel title="New name search" icon={UserSearch}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready) submit()
        }}
      >
        <Field label="Name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Amina Bello"
            maxLength={300}
          />
        </Field>
        <div>
          <span className="eyebrow mb-1.5 block">Who is it</span>
          <Segmented
            label="Who is it"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'public', label: 'Public figure' },
              { value: 'private_individual', label: 'Private individual' },
            ]}
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {pi
              ? 'Needs the PI policy on, then PI_SEARCH approval by the centre lead and an evidence officer. Only the centre lead reads the results, which are deleted when the approval lapses.'
              : 'Runs at once. Its results are open to analysts and supervisors.'}
          </p>
        </div>
        {pi && (
          <Field
            label="Reason"
            hint="Say why this person's name is searched. It goes to the approvers."
          >
            <textarea
              className={inputClass}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
            />
          </Field>
        )}
        {start.isError && (
          <p
            role="alert"
            className="rounded-md border border-red/30 bg-red/[0.06] px-3 py-2 text-xs text-red"
          >
            {refusalText(start.error)}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          icon={Search}
          disabled={!ready}
          loading={start.isPending}
        >
          {pi ? 'Ask for approval' : 'Search'}
        </Button>
      </form>
    </Panel>
  )
}

function MySearches() {
  const searches = useNameSearches()
  return (
    <Panel title="Your name searches" icon={FolderOpen} bodyClassName="p-0">
      {searches.isPending && <SkeletonRows rows={4} />}
      {searches.isError && (
        <ErrorNotice error={searches.error} onRetry={() => searches.refetch()} />
      )}
      {searches.data?.items.length === 0 && (
        <EmptyState icon={UserSearch} title="No name searches yet">
          Your searches appear here, newest first.
        </EmptyState>
      )}
      <ul className="divide-y divide-line-soft">
        {searches.data?.items.map((s) => (
          <li key={s.id}>
            <Link
              to="/names/$searchId"
              params={{ searchId: s.id }}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-tint/[0.03]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{s.name}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-faint">
                  {relative(s.requestedAt)}
                  {s.status === 'completed' && (
                    <>
                      {' '}
                      · <span className="num">{s.resultCount}</span> mentions
                    </>
                  )}
                </div>
              </div>
              <KindBadge kind={s.kind} />
              <StatusBadge status={s.status} />
              <ArrowRight size={14} className="text-ink-faint" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** The centre lead holds no search.names, so a private individual's search is opened by its id (from its PI_SEARCH approval). */
function OpenPiSearch() {
  const navigate = useNavigate()
  const [id, setId] = useState('')
  return (
    <Panel title="Open a private individual's search" icon={ShieldAlert} className="mt-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (id.trim()) navigate({ to: '/names/$searchId', params: { searchId: id.trim() } })
        }}
      >
        <div className="min-w-64 flex-1">
          <Field label="Search id" hint="The PI_SEARCH approval names the search it is for.">
            <input className={inputClass} value={id} onChange={(e) => setId(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" icon={ArrowRight} disabled={!id.trim()}>
          Open
        </Button>
      </form>
    </Panel>
  )
}
