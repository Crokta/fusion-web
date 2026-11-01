import { Copy, ExternalLink, KeyRound, Plus, ShieldOff } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { describeError } from '@/api'
import { useRendererTokenAction, useRendererTokens } from '@/api/queries'
import { useToast } from '@/components/Toaster'
import { Badge, Button, ErrorNotice, Panel, SkeletonRows, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'

/**
 * Display tokens (E34, ADR 0019): what a wall display uses to read the published layout without
 * anyone's account. Issuing and revoking are wall.operate; the secret is shown here once.
 */
export function DisplayTokensPanel() {
  const tokens = useRendererTokens()
  const act = useRendererTokenAction()
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<{ secret: string } | null>(null)

  const issue = (e: FormEvent) => {
    e.preventDefault()
    act.mutate(
      { kind: 'issue', label: label.trim() },
      {
        onSuccess: (r) => {
          if (r.secret) setIssued({ secret: r.secret })
          setLabel('')
        },
        onError: (err) =>
          toast({ title: 'Token not issued', detail: describeError(err), tone: 'error' }),
      },
    )
  }
  const revoke = (id: string, ref: string) =>
    act.mutate(
      { kind: 'revoke', id },
      {
        onSuccess: () =>
          toast({
            title: `${ref} revoked`,
            detail: 'Its display stops at its next read.',
            tone: 'success',
          }),
        onError: (err) =>
          toast({ title: 'Not revoked', detail: describeError(err), tone: 'error' }),
      },
    )
  // The token rides in the fragment, which the browser never sends to a server.
  const displayUrl = (secret: string) =>
    `${window.location.origin}/display#token=${encodeURIComponent(secret)}`

  return (
    <Panel
      title="Display tokens"
      icon={KeyRound}
      actions={
        <a
          href="/display"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11.5px] text-cyan hover:underline"
        >
          Open the display <ExternalLink size={11} aria-hidden />
        </a>
      }
      bodyClassName="p-0"
    >
      <form onSubmit={issue} className="flex gap-2 border-b border-line-soft px-4 py-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={100}
          aria-label="Which display the token is for"
          placeholder="Which display, e.g. Controller PC, ops room"
          className={cn(inputClass, 'min-w-0 flex-1 text-[12px]')}
        />
        <Button type="submit" icon={Plus} disabled={!label.trim()} loading={act.isPending}>
          Issue
        </Button>
      </form>

      {issued && (
        <div
          role="status"
          className="border-b border-line-soft bg-green/[0.06] px-4 py-3 text-[12px]"
        >
          <p className="font-medium text-green">
            Token issued. Copy it now: it is not shown again.
          </p>
          <code className="mt-1.5 block font-mono text-[11px] break-all text-ink">
            {issued.secret}
          </code>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              icon={Copy}
              onClick={() => void navigator.clipboard?.writeText(issued.secret)}
            >
              Copy token
            </Button>
            <a
              href={displayUrl(issued.secret)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-cyan ring-1 ring-cyan/30 hover:bg-cyan/[0.06]"
            >
              Open a display with it <ExternalLink size={11} aria-hidden />
            </a>
            <Button variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </div>
      )}

      {tokens.isPending ? (
        <SkeletonRows rows={2} />
      ) : tokens.isError ? (
        <ErrorNotice error={tokens.error} onRetry={() => tokens.refetch()} />
      ) : tokens.data.length === 0 ? (
        <p className="p-4 text-[12px] text-ink-muted">
          No displays yet. Issue a token for each screen that should draw the wall.
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
          {tokens.data.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-4 py-2 text-[11.5px]">
              <span className="font-mono text-ink">{t.ref}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{t.label}</span>
              {t.revokedAt ? (
                <Badge tone="neutral">Revoked</Badge>
              ) : (
                <>
                  <span className="shrink-0 text-ink-faint">
                    {t.lastSeenAt ? `seen ${relative(t.lastSeenAt)}` : 'not seen yet'}
                  </span>
                  <Button
                    variant="ghost"
                    icon={ShieldOff}
                    onClick={() => revoke(t.id, t.ref)}
                    disabled={act.isPending}
                  >
                    Revoke
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
