import { Link, useNavigate } from '@tanstack/react-router'
import { FilePlus2, FileText } from 'lucide-react'
import { describeError } from '@/api'
import { useBriefs, useCreateBrief } from '@/api/queries'
import type { CaseDetail } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import { Badge, Button, Panel } from '@/components/ui'

/** A case's briefs, and the way to start one once its findings are approved. */
export function CaseBriefsPanel({ c }: { c: CaseDetail }) {
  const { activeRole } = useAuth()
  const briefs = useBriefs(c.id)
  const create = useCreateBrief()
  const toast = useToast()
  const navigate = useNavigate()
  const approved = c.state === 'approved' || c.state === 'released'
  const items = briefs.data?.items ?? []
  if (!can.readBriefs(activeRole)) return null

  return (
    <Panel
      title="Briefs"
      icon={FileText}
      actions={<span className="num text-[11.5px] text-ink-faint">{items.length}</span>}
      bodyClassName="p-0"
    >
      {items.length > 0 && (
        <ul className="divide-y divide-line-soft">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                to="/products/$productId"
                params={{ productId: b.id }}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-tint/[0.025]"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{b.title}</span>
                <Badge tone={b.status === 'released' ? 'green' : 'amber'} dot>
                  {b.status === 'released' ? `Released v${b.currentVersion}` : 'Draft'}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="px-4 py-3">
        {approved && can.draftBrief(activeRole) ? (
          <Button
            size="md"
            variant={items.length ? 'secondary' : 'primary'}
            icon={FilePlus2}
            className="w-full"
            loading={create.isPending}
            onClick={() =>
              create.mutate(c.id, {
                onSuccess: (b) =>
                  void navigate({ to: '/products/$productId', params: { productId: b.id } }),
                onError: (e) =>
                  toast({ title: 'No brief', detail: describeError(e), tone: 'error' }),
              })
            }
          >
            Draft brief
          </Button>
        ) : (
          <p className="text-[11.5px] leading-relaxed text-ink-faint">
            {approved
              ? 'An analyst or supervisor drafts briefs.'
              : 'A brief is drafted from approved findings: it opens once the case is approved.'}
          </p>
        )}
      </div>
    </Panel>
  )
}
