import {
  Check,
  Clock3,
  Copy,
  FileAudio,
  FileText,
  FileVideo,
  Globe,
  Image,
  MessageSquareQuote,
  PlayCircle,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import type { EvidenceItem, MediaScreening } from '@/api/types'
import { useToast } from '@/components/Toaster'
import { Badge, MarkingTag } from '@/components/ui'
import { dateTime } from '@/lib/format'
import { MediaViewer, ScreeningBadge } from './MediaViewer'

export const evidenceIcon: Record<EvidenceItem['kind'], LucideIcon> = {
  image: Image,
  video: FileVideo,
  document: FileText,
  'web-capture': Globe,
  audio: FileAudio,
  statement: MessageSquareQuote,
}

const withoutScheme = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '')

/**
 * Originals as rows rather than a table: a capture's link is long, and a table column would
 * grow to fit it. Each row says what the file is first; the facts that prove it (time, hash,
 * timestamp, custody, marking) sit beside it on a wide panel and under it on a narrow one.
 */
export function EvidenceList({
  evidence,
  screenings,
}: {
  evidence: EvidenceItem[]
  /** casework's media screenings, for a case; a triage item has none yet. */
  screenings?: MediaScreening[]
}) {
  const toast = useToast()
  const [copied, setCopied] = useState<string | null>(null)
  const [viewing, setViewing] = useState<EvidenceItem | null>(null)
  const screeningOf = (id: string) => screenings?.find((m) => m.evidenceId === id)
  const copy = async (e: EvidenceItem) => {
    try {
      await navigator.clipboard.writeText(e.sha256)
      setCopied(e.id)
      setTimeout(() => setCopied((c) => (c === e.id ? null : c)), 1600)
    } catch {
      toast({
        title: 'Copy failed',
        detail: 'Clipboard is not available in this browser.',
        tone: 'warning',
      })
    }
  }

  return (
    <ul className="@container divide-y divide-line-soft" aria-label="Evidence originals">
      {evidence.map((e) => {
        const Icon = evidenceIcon[e.kind]
        return (
          <li
            key={e.id}
            className="grid items-center gap-x-5 gap-y-2 px-4 py-3 transition-colors hover:bg-tint/[0.02] @[680px]:grid-cols-[minmax(14rem,1fr)_auto]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-tint/[0.04] text-cyan/80 ring-1 ring-tint/[0.06]"
                aria-hidden
              >
                <Icon size={14} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-[12.5px] font-medium text-ink">{e.label ?? e.title}</span>
                  <span className="whitespace-nowrap font-mono text-[10.5px] text-ink-faint">
                    {e.ref}
                  </span>
                </div>
                <p
                  className="mt-0.5 truncate text-[11.5px] text-ink-muted"
                  title={e.link ?? e.source}
                >
                  {e.link ? withoutScheme(e.link) : e.source}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-10 text-[11px] @[680px]:justify-end @[680px]:pl-0">
              <span className="num whitespace-nowrap text-ink-muted" title="Registered">
                {dateTime(e.capturedAt)}
              </span>
              <button
                type="button"
                onClick={() => copy(e)}
                className="group inline-flex items-center gap-1.5 rounded px-1 font-mono text-[11px] text-ink-muted hover:text-ink"
                aria-label={`Copy SHA-256 of ${e.ref}`}
                title={e.sha256}
              >
                {e.sha256.slice(0, 8)}…{e.sha256.slice(-6)}
                {copied === e.id ? (
                  <Check size={12} className="text-green" />
                ) : (
                  <Copy size={12} className="text-ink-faint group-hover:text-cyan" />
                )}
              </button>
              {e.timestamped === undefined ? null : e.timestamped ? (
                <Badge tone="green">
                  <ShieldCheck size={11} aria-hidden /> RFC 3161
                </Badge>
              ) : (
                <Badge tone="amber">
                  <Clock3 size={11} aria-hidden /> Timestamp pending
                </Badge>
              )}
              <span className="num whitespace-nowrap text-ink-faint">
                {e.custodyEvents} custody
              </span>
              <MarkingTag marking={e.marking} />
              {(e.kind === 'image' || e.kind === 'video') && (
                <>
                  <ScreeningBadge screening={screeningOf(e.id)} />
                  <button
                    type="button"
                    onClick={() => setViewing(e)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-cyan hover:bg-cyan/10"
                    aria-label={`View ${e.ref}`}
                  >
                    {e.kind === 'video' ? (
                      <PlayCircle size={12} aria-hidden />
                    ) : (
                      <Image size={12} aria-hidden />
                    )}
                    View
                  </button>
                </>
              )}
            </div>
          </li>
        )
      })}
      {viewing && (
        <MediaViewer
          evidence={viewing}
          screening={screeningOf(viewing.id)}
          onClose={() => setViewing(null)}
        />
      )}
    </ul>
  )
}
