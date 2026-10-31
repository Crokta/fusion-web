import { Download, FilePenLine, History, Users } from 'lucide-react'
import { useState } from 'react'
import { describeError } from '@/api'
import { useBriefAction, useBriefDistribution } from '@/api/queries'
import type { Brief, BriefRecipient } from '@/api/types'
import { useToast } from '@/components/Toaster'
import { Badge, Button, ErrorNotice, Field, Panel, Skeleton, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime } from '@/lib/format'

const SOURCE: Record<BriefRecipient['source'], string> = {
  author: 'wrote it',
  releaser: 'released it',
  corrector: 'corrected it',
  download: 'downloaded it',
}

/**
 * Correcting a released brief (ADR 0017): the next version starts as a copy of the released one,
 * with a reason, and is released again by someone else. Shows who holds the brief, since they
 * are the people told when the correction is released.
 */
export function CorrectionPanel({ brief, mayCorrect }: { brief: Brief; mayCorrect: boolean }) {
  const act = useBriefAction(brief.id)
  const holders = useBriefDistribution(brief.id, brief.status !== 'draft')
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const correcting = brief.status === 'correcting'
  const working = brief.versions.find((v) => v.number === brief.currentVersion)

  if (brief.status === 'draft') return null

  const start = () =>
    act.mutate(
      { kind: 'correct', reason: reason.trim(), etag: brief.etag },
      {
        onSuccess: (b) =>
          toast({
            title: `Version ${b.currentVersion} started`,
            detail: 'Edit the sentences, save, then ask a reviewer to release the correction.',
            tone: 'success',
          }),
        onError: (e) =>
          toast({ title: 'Correction not started', detail: describeError(e), tone: 'error' }),
      },
    )

  return (
    <Panel title={correcting ? 'Correction in progress' : 'Correction'} icon={FilePenLine}>
      {correcting ? (
        <div className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
          <p>
            Version {brief.currentVersion} corrects version {working?.correctsVersion}. Recipients
            keep version {working?.correctsVersion} until this one is released.
          </p>
          <p className="text-ink-muted">
            <span className="text-ink-faint">Reason: </span>
            {working?.correctionReason}
          </p>
        </div>
      ) : open ? (
        <div className="space-y-3">
          <Field
            label="Why is it being corrected?"
            hint="Printed at the top of the corrected PDF and kept with the version."
          >
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className={inputClass}
              placeholder="For example: the flood was on 25 October, not 26 October."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              icon={FilePenLine}
              disabled={!reason.trim()}
              loading={act.isPending}
              onClick={start}
            >
              Start version {brief.currentVersion + 1}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-2">
            A released version never changes. To correct it, start a new version: version{' '}
            {brief.currentVersion} is kept and marked as replaced once the correction is released.
          </p>
          {mayCorrect ? (
            <Button icon={FilePenLine} className="w-full" size="md" onClick={() => setOpen(true)}>
              Correct this brief
            </Button>
          ) : (
            <p className="text-[11.5px] text-ink-faint">
              An analyst or supervisor corrects briefs.
            </p>
          )}
        </>
      )}

      <div className="mt-4 border-t border-line-soft pt-3">
        <h3 className="eyebrow mb-2 flex items-center gap-1.5">
          <Users size={12} aria-hidden /> Told when a correction is released
        </h3>
        {holders.isPending ? (
          <Skeleton className="h-10" />
        ) : holders.isError ? (
          <ErrorNotice error={holders.error} />
        ) : holders.data.length === 0 ? (
          <p className="text-[11.5px] text-ink-faint">Nobody holds this brief yet.</p>
        ) : (
          <ul className="space-y-1 text-[12px]">
            {holders.data.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2">
                <span className="text-ink-2">{r.name}</span>
                <span className="text-[11px] text-ink-faint">
                  {SOURCE[r.source]} · v{r.firstVersion}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}

/** Every version: what each was released as, which replaced which, and each released PDF. */
export function VersionsPanel({
  brief,
  opening,
  onOpen,
}: {
  brief: Brief
  opening: boolean
  onOpen: (version: number) => void
}) {
  if (brief.versions.length < 2) return null
  return (
    <Panel title="Versions" icon={History} bodyClassName="p-0">
      <ol className="divide-y divide-line-soft">
        {[...brief.versions].reverse().map((v) => (
          <li key={v.number} className={cn('px-4 py-3', v.supersededBy && 'opacity-80')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12px] font-semibold text-ink">v{v.number}</span>
              {v.supersededBy ? (
                <Badge tone="neutral">Replaced by v{v.supersededBy}</Badge>
              ) : v.releasedAt ? (
                <Badge tone="green" dot>
                  Current
                </Badge>
              ) : (
                <Badge tone="amber" dot>
                  Draft
                </Badge>
              )}
              {v.correctsVersion && (
                <span className="text-[11px] text-ink-faint">corrects v{v.correctsVersion}</span>
              )}
              {v.hasPdf && (
                <Button
                  variant="ghost"
                  size="xs"
                  icon={Download}
                  className="ml-auto"
                  disabled={opening}
                  onClick={() => onOpen(v.number)}
                >
                  PDF
                </Button>
              )}
            </div>
            {v.correctionReason && (
              <p className="mt-1 text-[12px] text-ink-muted">{v.correctionReason}</p>
            )}
            <p className="mt-1 text-[11px] text-ink-faint">
              {v.releasedAt
                ? `Released by ${v.releasedBy} · ${dateTime(v.releasedAt)}`
                : `Started by ${v.createdBy} · ${dateTime(v.createdAt)}`}
            </p>
            {v.sha256 && (
              <p className="mt-0.5 font-mono text-[10px] break-all text-ink-faint">{v.sha256}</p>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  )
}
