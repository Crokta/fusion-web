import { AlertTriangle, Grid3x3, MessageSquareQuote } from 'lucide-react'
import { useCaseMatrix } from '@/api/queries'
import type { EvidenceItem, MatrixRow, MatrixSource } from '@/api/types'
import { Badge, EmptyState, ErrorNotice, Panel, SkeletonRows, type Tone } from '@/components/ui'
import { cn } from '@/lib/cn'
import { evidenceIcon } from './EvidenceList'
import { VERDICT_HINT, VERDICT_LABEL, verdictTone } from './MediaViewer'

const ASSESSMENT_TONE: Record<string, Tone> = {
  high: 'green',
  moderate: 'amber',
  low: 'neutral',
  supported: 'green',
  contradicted: 'red',
  inconclusive: 'amber',
  unassessed: 'neutral',
}

const dotTone: Record<Tone, string> = {
  red: 'bg-red',
  green: 'bg-green',
  amber: 'bg-amber',
  cyan: 'bg-cyan',
  violet: 'bg-violet',
  neutral: 'bg-ink-faint',
}

/**
 * The evidence matrix (E26): each finding and claim down the side, the case's originals and
 * statements across, a mark where one cites the other. An original's colour is media's verdict,
 * so a finding resting on a likely AI-generated image shows red in its row, and an original no row
 * cites shows that it has not been weighed yet.
 */
export function MatrixPanel({ caseId, evidence }: { caseId: string; evidence: EvidenceItem[] }) {
  const matrix = useCaseMatrix(caseId)
  const byId = new Map(evidence.map((e) => [e.id, e]))

  return (
    <Panel
      title="Evidence matrix"
      icon={Grid3x3}
      eyebrow="What each judgement rests on"
      bodyClassName="p-0"
    >
      {matrix.isLoading ? (
        <SkeletonRows rows={3} />
      ) : matrix.error ? (
        <ErrorNotice error={matrix.error} onRetry={() => void matrix.refetch()} />
      ) : !matrix.data || matrix.data.rows.length === 0 ? (
        <EmptyState icon={Grid3x3} title="Nothing to weigh yet">
          Record a finding or a claim, citing originals or statements, and it appears here against
          what it rests on.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line-soft">
                <th className="sticky left-0 z-10 min-w-[10rem] sm:min-w-[16rem] bg-panel px-4 py-2 text-left font-medium text-ink-muted">
                  Finding or claim
                </th>
                {matrix.data.sources.map((s) => (
                  <SourceHeader key={s.id} source={s} item={byId.get(s.id)} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {matrix.data.rows.map((r) => (
                <Row key={r.id} row={r} sources={matrix.data.sources} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-soft text-[11px] text-ink-faint">
                <td className="sticky left-0 z-10 bg-panel px-4 py-2">Cited by</td>
                {matrix.data.sources.map((s) => (
                  <td
                    key={s.id}
                    className={cn('px-2 py-2 text-center num', s.citedBy === 0 && 'text-amber/80')}
                    title={s.citedBy === 0 ? 'Not cited by any finding or claim yet' : undefined}
                  >
                    {s.citedBy === 0 ? 'none' : s.citedBy}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Panel>
  )
}

function SourceHeader({ source, item }: { source: MatrixSource; item?: EvidenceItem }) {
  const Icon =
    source.kind === 'statement' ? MessageSquareQuote : evidenceIcon[item?.kind ?? 'document']
  const name =
    source.kind === 'statement'
      ? (source.label ?? 'Statement')
      : (item?.ref ?? `EV-${source.id.slice(-6).toUpperCase()}`)
  const verdict = source.verdict ? VERDICT_LABEL[source.verdict] : undefined
  const title = [
    source.kind === 'statement' ? `Statement by ${name}` : (item?.label ?? item?.title ?? name),
    verdict,
    source.screeningStatus === 'requested' ? 'Screening…' : undefined,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <th scope="col" className="min-w-[5.5rem] px-2 py-2 align-bottom font-normal" title={title}>
      <span className="flex flex-col items-center gap-1">
        <Icon size={13} className="text-ink-faint" aria-hidden />
        <span className="max-w-[6rem] truncate font-mono text-[10.5px] text-ink-muted">{name}</span>
        {source.verdict ? (
          <span
            className={cn('size-2 rounded-full', dotTone[verdictTone(source.verdict)])}
            aria-label={verdict ?? source.verdict}
            title={VERDICT_HINT}
          />
        ) : (
          <span className="size-2" aria-hidden />
        )}
      </span>
    </th>
  )
}

function Row({ row, sources }: { row: MatrixRow; sources: MatrixSource[] }) {
  const synthetic = row.flags.includes('cites_likely_synthetic')
  return (
    <tr className={cn('align-top', synthetic && 'bg-red/[0.04]')}>
      <th
        scope="row"
        className="sticky left-0 z-10 max-w-[12rem] bg-panel px-4 py-2.5 text-left font-normal sm:max-w-[24rem]"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={row.kind === 'finding' ? 'cyan' : 'neutral'}>
            {row.kind === 'finding' ? 'Finding' : 'Claim'}
          </Badge>
          <Badge tone={ASSESSMENT_TONE[row.assessment] ?? 'neutral'}>
            {row.kind === 'finding' ? `${row.assessment} confidence` : row.assessment}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] text-ink">{row.text}</p>
        {synthetic && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-red">
            <AlertTriangle size={11} aria-hidden /> Rests on an original that is likely AI-generated
          </p>
        )}
        {row.flags.includes('unsupported') && (
          <p className="mt-1 text-[11px] text-amber">Cites nothing yet</p>
        )}
      </th>
      {sources.map((s) => {
        const cited = row.cites.includes(s.id)
        const tone = s.verdict ? verdictTone(s.verdict) : 'cyan'
        return (
          <td key={s.id} className="px-2 py-2.5 text-center">
            {cited ? (
              <span
                className={cn(
                  'inline-block size-2.5 rounded-full',
                  dotTone[tone === 'neutral' ? 'cyan' : tone],
                )}
                aria-label="Cited"
              />
            ) : (
              <span className="inline-block size-1 rounded-full bg-line-strong" aria-hidden />
            )}
          </td>
        )
      })}
    </tr>
  )
}
