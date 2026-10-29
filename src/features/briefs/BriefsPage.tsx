import { Link } from '@tanstack/react-router'
import { FileText, ShieldAlert } from 'lucide-react'
import { useBriefs, useCases } from '@/api/queries'
import { ROLE_LABEL } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { Badge, EmptyState, ErrorNotice, PageHeader, Panel, SkeletonRows } from '@/components/ui'
import { since } from '@/lib/format'
import { useNow } from '@/lib/hooks'

export function BriefsPage() {
  const { activeRole } = useAuth()
  const briefs = useBriefs()
  const cases = useCases()
  const now = useNow()
  const refOf = new Map((cases.data?.items ?? []).map((c) => [c.id, c.ref]))
  const items = briefs.data?.items ?? []

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <PageHeader
        eyebrow="Operations · Products"
        title="Briefs"
        description="Drafted from a case's approved findings. Every sentence cites what it rests on; a brief is released as a PDF by someone other than its author."
      />
      {!can.readBriefs(activeRole) ? (
        <Panel>
          <EmptyState icon={ShieldAlert} title="Briefs aren't open to your role">
            Acting as {ROLE_LABEL[activeRole]}.
          </EmptyState>
        </Panel>
      ) : (
        <Panel title="All briefs" icon={FileText} bodyClassName="p-0">
          {briefs.isPending ? (
            <SkeletonRows rows={4} />
          ) : briefs.isError ? (
            <ErrorNotice error={briefs.error} onRetry={() => briefs.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={FileText} title="No briefs yet">
              Draft one from an approved case: open the case and choose “Draft brief”.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line-soft">
              {items.map((b) => (
                <li key={b.id}>
                  <Link
                    to="/products/$productId"
                    params={{ productId: b.id }}
                    className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-tint/[0.025]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{b.title}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-ink-faint">
                        {refOf.get(b.caseId) ?? 'Case'} · v{b.currentVersion} · {b.sentences.length}{' '}
                        sentences · {b.authorName} · {since(b.updatedAt, now)}
                      </p>
                    </div>
                    <Badge tone={b.status === 'released' ? 'green' : 'amber'} dot>
                      {b.status === 'released' ? 'Released' : 'Draft'}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  )
}
