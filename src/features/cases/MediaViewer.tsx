import { AlertTriangle, Eye, Fingerprint, MapPin, ShieldCheck } from 'lucide-react'
import { useEffect } from 'react'
import { describeError } from '@/api'
import { useMediaAnalysis, useWorkingCopy } from '@/api/queries'
import type { EvidenceItem, MediaAnalysis, MediaScreening } from '@/api/types'
import { Modal } from '@/components/Overlay'
import { Badge, ErrorNotice, SkeletonRows, type Tone } from '@/components/ui'
import { dateTime } from '@/lib/format'

/** media's verdict vocabulary, in words; an indicator informs, it never decides (Section 7). */
export const VERDICT_LABEL: Record<string, string> = {
  LikelySynthetic: 'Likely AI-generated',
  LikelyAuthentic: 'Likely authentic',
  Inconclusive: 'Inconclusive',
}
const verdictTone = (v: string | null): Tone =>
  v === 'LikelySynthetic' ? 'red' : v === 'LikelyAuthentic' ? 'green' : 'neutral'

export function ScreeningBadge({ screening }: { screening: MediaScreening | undefined }) {
  if (!screening) return null
  if (screening.status === 'requested') return <Badge tone="cyan">Screening…</Badge>
  if (screening.status === 'failed')
    return (
      <span title={screening.failure ?? undefined}>
        <Badge tone="amber">
          <AlertTriangle size={11} aria-hidden /> Not screened
        </Badge>
      </span>
    )
  return (
    <span title="Combined media indicator: advisory only">
      <Badge tone={verdictTone(screening.verdict)}>
        {VERDICT_LABEL[screening.verdict ?? ''] ?? 'Screened'}
        {screening.c2paPresent ? ' · C2PA' : ''}
      </Badge>
    </span>
  )
}

const C2PA_LABEL: Record<NonNullable<MediaAnalysis['c2pa']>['status'], string> = {
  absent: 'No content credentials',
  present_not_validated: 'Content credentials present, not validated',
  valid: 'Content credentials valid',
  invalid: 'Content credentials invalid',
}

/**
 * The original itself and what media found. Opening it takes a working copy from evidence: a
 * read of the original, audited and recorded in its custody, so it happens only on this click.
 */
export function MediaViewer({
  evidence,
  screening,
  onClose,
}: {
  evidence: EvidenceItem
  screening: MediaScreening | undefined
  onClose: () => void
}) {
  const copy = useWorkingCopy()
  const analysis = useMediaAnalysis(evidence.id)
  const { mutate } = copy
  useEffect(() => mutate(evidence.id), [mutate, evidence.id])
  const a = analysis.data
  const isVideo = evidence.kind === 'video'

  return (
    <Modal
      open
      onClose={onClose}
      title={`${evidence.label ?? evidence.title} · ${evidence.ref}`}
      description={evidence.link ?? evidence.source}
    >
      <div className="space-y-4">
        <div className="grid min-h-48 place-items-center overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/[0.06]">
          {copy.isPending ? (
            <p className="text-[12px] text-ink-faint">Opening a working copy…</p>
          ) : copy.isError ? (
            <p className="px-4 py-6 text-[12px] text-red" role="alert">
              {describeError(copy.error)}
            </p>
          ) : copy.data ? (
            isVideo ? (
              <video
                src={copy.data.url}
                controls
                preload="metadata"
                className="max-h-[50vh] w-full"
              />
            ) : (
              <img
                src={copy.data.url}
                alt={`${evidence.ref}, working copy`}
                className="max-h-[50vh] object-contain"
              />
            )
          ) : null}
        </div>
        {copy.data && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-faint">
            <Eye size={12} aria-hidden /> A working copy, recorded in the original’s custody; the
            link lapses at {dateTime(copy.data.expiresAt)}.
          </p>
        )}

        {analysis.isPending ? (
          <SkeletonRows rows={3} />
        ) : analysis.isError ? (
          <ErrorNotice error={analysis.error} onRetry={() => analysis.refetch()} />
        ) : !a ? (
          <p className="text-[12.5px] text-ink-muted">
            {screening?.status === 'requested'
              ? 'Media has not picked it up yet.'
              : 'Media has not analysed this original.'}
          </p>
        ) : (
          <Analysis a={a} />
        )}
      </div>
    </Modal>
  )
}

function Analysis({ a }: { a: MediaAnalysis }) {
  if (a.job.status === 'running')
    return <p className="text-[12.5px] text-ink-muted">Media is analysing it…</p>
  if (a.job.status === 'failed')
    return (
      <p className="text-[12.5px] text-amber" role="alert">
        Media could not analyse it: {a.job.failure?.message ?? a.job.failure?.code ?? 'failed'}.
      </p>
    )
  const m = a.metadata
  const size = m?.width && m.height ? `${m.width} × ${m.height}` : null
  return (
    <div className="space-y-4 text-[12.5px]">
      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-2">
        <dt className="text-ink-faint">File</dt>
        <dd className="text-ink-2">
          {[
            m?.format,
            size,
            m?.durationSeconds ? `${Math.round(m.durationSeconds)} s` : null,
            m?.videoCodec,
          ]
            .filter(Boolean)
            .join(' · ') || a.contentType}
          {a.sha256Verified && <span className="ml-2 text-[11px] text-green">SHA-256 checked</span>}
        </dd>
        <dt className="text-ink-faint">Camera</dt>
        <dd className="text-ink-2">
          {m?.cameraMake || m?.cameraModel
            ? [m.cameraMake, m.cameraModel].filter(Boolean).join(' ')
            : m?.metadataStripped
              ? 'No camera metadata: it was stripped, as most platforms do'
              : 'Not recorded'}
          {m?.capturedAt && (
            <span className="block text-[11.5px] text-ink-faint">
              Taken {m.capturedAt} (as recorded)
            </span>
          )}
          {m?.software && (
            <span className="block text-[11.5px] text-ink-faint">Software: {m.software}</span>
          )}
        </dd>
        <dt className="text-ink-faint">Location</dt>
        <dd className="flex items-center gap-1.5 text-ink-2">
          <MapPin size={12} className="text-ink-faint" aria-hidden />
          {m?.location.present
            ? 'Embedded in the file (coordinates for evidence officers and centre leads)'
            : 'None embedded'}
        </dd>
        <dt className="text-ink-faint">Credentials</dt>
        <dd className="flex items-center gap-1.5 text-ink-2">
          <ShieldCheck size={12} className="text-ink-faint" aria-hidden />
          {a.c2pa ? C2PA_LABEL[a.c2pa.status] : '—'}
          {a.c2pa?.aiGenerated && <Badge tone="red">Declares AI generation</Badge>}
          {a.c2pa?.signedBy && (
            <span className="text-[11.5px] text-ink-faint">signed by {a.c2pa.signedBy}</span>
          )}
        </dd>
      </dl>

      <div>
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Indicators · advisory, never a finding
        </p>
        {a.job.note ? (
          <p className="text-ink-muted">{a.job.note.replace(/^not run: /, 'Not run: ')}.</p>
        ) : (
          <ul className="space-y-1">
            {a.indicators.map((i) => (
              <li key={i.detector} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11.5px] text-ink-2">{i.detector}</span>
                <Badge tone={verdictTone(i.verdict)}>{VERDICT_LABEL[i.verdict] ?? i.verdict}</Badge>
                {i.confidence !== null && (
                  <span className="text-ink-faint">{Math.round(i.confidence * 100)}%</span>
                )}
                {i.limitations && (
                  <span className="text-[11.5px] text-ink-faint">{i.limitations}</span>
                )}
              </li>
            ))}
            {a.combined && (
              <li className="flex items-center gap-2 pt-1">
                <span className="text-ink-2">Combined</span>
                <Badge tone={verdictTone(a.combined.verdict)}>
                  {VERDICT_LABEL[a.combined.verdict] ?? a.combined.verdict}
                </Badge>
              </li>
            )}
          </ul>
        )}
      </div>

      {a.fingerprints && a.fingerprints.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
            <Fingerprint size={12} aria-hidden /> Fingerprints
          </p>
          <ul className="space-y-0.5 font-mono text-[11px] text-ink-muted">
            {a.fingerprints.map((f) => (
              <li key={`${f.kind}-${f.atSeconds ?? ''}`} className="truncate" title={f.value}>
                {f.kind}
                {f.atSeconds !== null ? ` @${f.atSeconds}s` : ''}: {f.value}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
