import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  CornerDownLeft,
  Download,
  Eye,
  FileText,
  Heading2,
  Plus,
  Rocket,
  Save,
  ShieldCheck,
  Trash2,
  UserX,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { describeError } from '@/api'
import { api } from '@/api'
import { qk, useBrief, useBriefAction, useCase, useSupportCheck } from '@/api/queries'
import type { Brief, BriefSentence, Citable, SupportCheck } from '@/api/types'
import { can, useAuth } from '@/auth/AuthProvider'
import { useToast } from '@/components/Toaster'
import {
  Badge,
  Button,
  EmptyState,
  ErrorNotice,
  IconButton,
  Panel,
  Skeleton,
  inputClass,
} from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime } from '@/lib/format'
import { CorrectionPanel, VersionsPanel } from './CorrectionPanel'

export function BriefPage({ briefId }: { briefId: string }) {
  const brief = useBrief(briefId)
  if (brief.isPending)
    return (
      <div className="mx-auto max-w-[1440px] space-y-4 px-6 py-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    )
  if (brief.isError)
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-6">
        <ErrorNotice error={brief.error} onRetry={() => brief.refetch()} />
      </div>
    )
  return <BriefEditor key={`${brief.data.id}-${brief.data.etag}`} brief={brief.data} />
}

/**
 * Opens a PDF from the API in a new tab. The token can't ride on a plain link, so the file is
 * fetched first; the tab is opened inside the click (before any await) so pop-up blockers allow
 * it, and if one still refuses, the file is downloaded instead.
 */
async function openPdf(id: string, version?: number) {
  const tab = window.open('', '_blank')
  try {
    const url = URL.createObjectURL(await api.briefPdf(id, version))
    if (tab) tab.location.href = url
    else {
      const a = document.createElement('a')
      a.href = url
      a.download = `brief-${id}${version ? `-v${version}` : '-draft'}.pdf`
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (e) {
    tab?.close()
    throw e
  }
}

function BriefEditor({ brief }: { brief: Brief }) {
  const { user, activeRole } = useAuth()
  const check = useSupportCheck(brief.id)
  const theCase = useCase(brief.caseId)
  const act = useBriefAction(brief.id)
  const qc = useQueryClient()
  const toast = useToast()
  const [title, setTitle] = useState(brief.title)
  const [sentences, setSentences] = useState<BriefSentence[]>(brief.sentences)
  const [opening, setOpening] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  const released = brief.status === 'released'
  const correcting = brief.status === 'correcting'
  const isAuthor = brief.authorId === user?.id
  // A correction is released by neither its author nor whoever opened it (ADR 0017).
  const isCorrector =
    correcting &&
    brief.versions.find((v) => v.number === brief.currentVersion)?.createdById === user?.id
  const canEdit = !released && can.draftBrief(activeRole)
  const dirty =
    title !== brief.title || JSON.stringify(sentences) !== JSON.stringify(brief.sentences)
  const current = brief.versions.find((v) => v.number === brief.currentVersion)

  // Leaving with unsaved sentences loses them: ask the browser to warn.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (i: number, next: Partial<BriefSentence>) =>
    setSentences((list) => list.map((s, j) => (j === i ? { ...s, ...next } : s)))
  // A new sentence goes under the last heading; a new section starts with one empty sentence (E34).
  const lastSection = () => sentences[sentences.length - 1]?.section
  const addSentence = (s: Partial<BriefSentence> = {}) =>
    setSentences((l) => [
      ...l,
      { text: '', supportRefs: [], ...(lastSection() ? { section: lastSection() } : {}), ...s },
    ])
  const renameSection = (from: number, name: string) =>
    setSentences((list) => {
      const old = list[from]?.section
      return list.map((s, j) => {
        // The run of sentences that shares the heading at `from`.
        const inRun = j >= from && list.slice(from, j + 1).every((x) => x.section === old)
        return inRun ? { ...s, section: name } : s
      })
    })
  const move = (i: number, by: number) =>
    setSentences((list) => {
      const next = [...list]
      const [s] = next.splice(i, 1)
      next.splice(i + by, 0, s!)
      return next
    })

  const save = () =>
    act.mutate(
      {
        kind: 'redraft',
        title: title.trim(),
        sentences: sentences.filter((s) => s.text.trim()),
        etag: brief.etag,
      },
      {
        onSuccess: () => toast({ title: 'Draft saved', tone: 'success' }),
        onError: (e) => toast({ title: 'Not saved', detail: describeError(e), tone: 'error' }),
      },
    )
  const release = () =>
    act.mutate(
      { kind: 'release', etag: brief.etag },
      {
        onSuccess: () =>
          toast(
            correcting
              ? {
                  title: 'Correction released',
                  detail: `Version ${brief.currentVersion} replaces version ${brief.currentVersion - 1}; everyone who holds the brief is told.`,
                  tone: 'success',
                }
              : {
                  title: 'Brief released',
                  detail: 'The PDF is sealed with its SHA-256; the case moves to Released.',
                  tone: 'success',
                },
          ),
        onError: (e) => toast({ title: 'Not released', detail: describeError(e), tone: 'error' }),
      },
    )
  const pdf = async (version?: number) => {
    setOpening(true)
    try {
      await openPdf(brief.id, version)
      // Downloading a released version makes you one of its holders (ADR 0017).
      if (version) void qc.invalidateQueries({ queryKey: qk.briefDistribution(brief.id) })
    } catch (e) {
      toast({ title: 'No PDF', detail: describeError(e), tone: 'error' })
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <Link
        to="/cases/$caseId"
        params={{ caseId: brief.caseId }}
        className="mb-3 inline-flex items-center gap-1.5 rounded text-[12px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={13} /> {theCase.data?.ref ?? 'Case'}
        {theCase.data ? ` · ${theCase.data.title}` : ''}
      </Link>

      <header className="mb-5 animate-rise-in">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="eyebrow text-cyan/80">Brief · v{brief.currentVersion}</span>
          <Badge tone={released ? 'green' : 'amber'} dot>
            {released ? 'Released' : correcting ? 'Correction in progress' : 'Draft'}
          </Badge>
          <span className="text-[11.5px] text-ink-faint">by {brief.authorName}</span>
        </div>
        {canEdit ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            aria-label="Title"
            className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink hover:border-line focus:border-cyan/50 focus:outline-none"
          />
        ) : (
          <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] text-ink">
            {brief.title}
          </h1>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title={mode === 'edit' ? 'Sentences' : 'Preview'}
          icon={mode === 'edit' ? FileText : Eye}
          actions={
            <div className="flex items-center gap-1.5">
              <div
                role="tablist"
                aria-label="Edit or preview"
                className="flex rounded-md p-0.5 ring-1 ring-tint/10"
              >
                {(['edit', 'preview'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      'rounded px-2.5 py-1 text-[11.5px] transition-colors',
                      mode === m ? 'bg-cyan/[0.12] text-ink' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {m === 'edit' ? (canEdit ? 'Edit' : 'Sentences') : 'Preview'}
                  </button>
                ))}
              </div>
              {canEdit && mode === 'edit' && (
                <>
                  <Button
                    variant="ghost"
                    icon={Heading2}
                    onClick={() => addSentence({ section: 'New section' })}
                  >
                    Add section
                  </Button>
                  <Button variant="ghost" icon={Plus} onClick={() => addSentence()}>
                    Add sentence
                  </Button>
                </>
              )}
            </div>
          }
          bodyClassName="p-0"
        >
          {mode === 'preview' ? (
            <BriefPreview
              title={title}
              caseRef={theCase.data?.ref}
              version={brief.currentVersion}
              released={released}
              sentences={sentences}
              citable={check.data?.citable ?? []}
              dirty={dirty}
              briefId={brief.id}
            />
          ) : sentences.length === 0 ? (
            <EmptyState icon={FileText} title="No sentences" />
          ) : (
            <ol className="divide-y divide-line-soft">
              {sentences.map((s, i) => (
                <Fragment key={i}>
                  {(i === 0 || s.section !== sentences[i - 1]?.section) && (
                    <SectionHeading
                      name={s.section}
                      editable={canEdit}
                      onRename={(name) => renameSection(i, name)}
                    />
                  )}
                  <SentenceRow
                    index={i}
                    sentence={s}
                    last={i === sentences.length - 1}
                    check={dirty ? undefined : check.data?.sentences[i]}
                    citable={check.data?.citable ?? []}
                    editable={canEdit}
                    onChange={(next) => update(i, next)}
                    onMove={(by) => move(i, by)}
                    onRemove={() => setSentences((l) => l.filter((_, j) => j !== i))}
                  />
                </Fragment>
              ))}
            </ol>
          )}
          {canEdit && mode === 'edit' && (
            <div className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
              {dirty && <span className="mr-auto text-[11.5px] text-amber">Unsaved changes</span>}
              <Button
                variant="ghost"
                disabled={!dirty || act.isPending}
                onClick={() => {
                  setTitle(brief.title)
                  setSentences(brief.sentences)
                }}
              >
                Discard
              </Button>
              <Button
                icon={Save}
                disabled={!dirty || !title.trim()}
                loading={act.isPending}
                onClick={save}
              >
                Save draft
              </Button>
            </div>
          )}
        </Panel>

        <div className="min-w-0 space-y-5">
          <ReleasePanel
            brief={brief}
            check={check.data}
            checkError={check.error}
            dirty={dirty}
            isAuthor={isAuthor || isCorrector}
            mayRelease={can.releaseBrief(activeRole)}
            pending={act.isPending}
            onRelease={release}
          />

          <CorrectionPanel brief={brief} mayCorrect={can.draftBrief(activeRole)} />

          <Panel title="PDF" icon={Download}>
            {released && current?.hasPdf ? (
              <>
                <Button
                  size="md"
                  icon={Download}
                  loading={opening}
                  className="w-full"
                  onClick={() => pdf(current.number)}
                >
                  Open released PDF (v{current.number})
                </Button>
                <dl className="mt-3 space-y-1.5 text-[11.5px]">
                  <div className="flex gap-2">
                    <dt className="text-ink-faint">Released</dt>
                    <dd className="text-ink-2">
                      {current.releasedBy} · {current.releasedAt && dateTime(current.releasedAt)}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 text-ink-faint">SHA-256</dt>
                    <dd className="font-mono text-[10.5px] break-all text-ink-muted">
                      {current.sha256}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <Button
                  size="md"
                  variant="secondary"
                  icon={FileText}
                  loading={opening}
                  className="w-full"
                  onClick={() => pdf()}
                >
                  Preview PDF
                </Button>
                <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                  Marked DRAFT, rendered from the last saved version
                  {dirty ? ' (save to include your changes)' : ''}. Release stores the final PDF and
                  its SHA-256.
                </p>
              </>
            )}
          </Panel>

          <VersionsPanel brief={brief} opening={opening} onOpen={(v) => pdf(v)} />

          {check.data && check.data.citable.length > 0 && (
            <Panel title="What the case offers" icon={ShieldCheck} bodyClassName="p-0">
              <ul className="divide-y divide-line-soft">
                {check.data.citable.map((c) => (
                  <li key={c.ref} className="flex gap-3 px-4 py-2.5 text-[12px]">
                    <span className="w-16 shrink-0 font-mono text-[11px] font-semibold text-cyan">
                      {c.label}
                    </span>
                    <span className="min-w-0 flex-1 text-ink-2">{c.text}</span>
                    {canEdit && (
                      <IconButton
                        icon={CornerDownLeft}
                        label={`Add ${c.label} as a sentence that cites it`}
                        onClick={() => {
                          addSentence({ text: c.text, supportRefs: [c.ref] })
                          setMode('edit')
                        }}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function SentenceRow({
  index,
  sentence,
  last,
  check,
  citable,
  editable,
  onChange,
  onMove,
  onRemove,
}: {
  index: number
  sentence: BriefSentence
  last: boolean
  check?: SupportCheck['sentences'][number]
  citable: Citable[]
  editable: boolean
  onChange: (next: Partial<BriefSentence>) => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const labelOf = useMemo(() => new Map(citable.map((c) => [c.ref, c.label])), [citable])
  const toggle = (ref: string) =>
    onChange({
      supportRefs: sentence.supportRefs.includes(ref)
        ? sentence.supportRefs.filter((r) => r !== ref)
        : [...sentence.supportRefs, ref],
    })
  const status = check ? (check.supported ? 'supported' : 'unsupported') : 'unchecked'

  return (
    <li className="flex gap-3 px-4 py-3.5">
      <span
        className={cn(
          'mt-1 grid size-6 shrink-0 place-items-center rounded-md font-mono text-[11px] ring-1',
          status === 'supported' && 'bg-green/10 text-green ring-green/30',
          status === 'unsupported' && 'bg-red/10 text-red ring-red/30',
          status === 'unchecked' && 'bg-tint/[0.04] text-ink-muted ring-tint/[0.06]',
        )}
        title={
          status === 'unchecked'
            ? 'Save to check'
            : status === 'supported'
              ? 'Supported'
              : 'Cites nothing this case holds'
        }
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {editable ? (
          <textarea
            value={sentence.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            maxLength={4000}
            aria-label={`Sentence ${index + 1}`}
            placeholder="Write the sentence as it should read."
            className={cn(inputClass, 'resize-y text-[13.5px] leading-relaxed')}
          />
        ) : (
          <p className="text-[13.5px] leading-relaxed text-ink">{sentence.text}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {editable
            ? citable.map((c) => {
                const on = sentence.supportRefs.includes(c.ref)
                return (
                  <button
                    key={c.ref}
                    type="button"
                    aria-pressed={on}
                    title={c.text}
                    onClick={() => toggle(c.ref)}
                    className={cn(
                      'rounded-full px-2 py-0.5 font-mono text-[10.5px] ring-1 transition-colors',
                      on
                        ? 'bg-cyan/[0.12] text-ink ring-cyan/50'
                        : 'text-ink-faint ring-tint/10 hover:text-ink',
                    )}
                  >
                    {c.label}
                  </button>
                )
              })
            : sentence.supportRefs.map((r) => (
                <span
                  key={r}
                  className="rounded-[4px] bg-tint/[0.035] px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted ring-1 ring-tint/[0.06]"
                >
                  {labelOf.get(r) ?? 'unknown'}
                </span>
              ))}
          {/* References the case no longer holds (or never did) show, so they can be removed. */}
          {editable &&
            sentence.supportRefs
              .filter((r) => !labelOf.has(r))
              .map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(r)}
                  title="This reference doesn't resolve against the case. Click to remove."
                  className="rounded-full px-2 py-0.5 font-mono text-[10.5px] text-red ring-1 ring-red/40"
                >
                  unknown ×
                </button>
              ))}
          {status === 'unsupported' && (
            <span className="text-[11px] text-red">cites nothing this case holds</span>
          )}
        </div>
      </div>
      {editable && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <IconButton
            icon={ArrowUp}
            label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          />
          <IconButton
            icon={ArrowDown}
            label="Move down"
            disabled={last}
            onClick={() => onMove(1)}
          />
          <IconButton icon={Trash2} label="Remove sentence" onClick={onRemove} />
        </div>
      )}
    </li>
  )
}

function ReleasePanel({
  brief,
  check,
  checkError,
  dirty,
  isAuthor,
  mayRelease,
  pending,
  onRelease,
}: {
  brief: Brief
  check?: SupportCheck
  checkError: unknown
  dirty: boolean
  isAuthor: boolean
  mayRelease: boolean
  pending: boolean
  onRelease: () => void
}) {
  const released = brief.status === 'released'
  const correcting = brief.status === 'correcting'
  return (
    <Panel
      title={released ? 'Released' : 'Support check'}
      icon={released ? CheckCircle2 : ShieldCheck}
    >
      {checkError ? (
        <ErrorNotice error={checkError} />
      ) : !check ? (
        <Skeleton className="h-16" />
      ) : released ? (
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Version {brief.currentVersion} is released and can no longer change.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            {check.ready && !dirty ? (
              <Badge tone="green">
                <CheckCircle2 size={11} aria-hidden /> Ready to release
              </Badge>
            ) : (
              <Badge tone="amber">
                <AlertTriangle size={11} aria-hidden /> {dirty ? 'Unsaved changes' : 'Not ready'}
              </Badge>
            )}
            <span className="text-[11.5px] text-ink-faint">
              {check.caseReference} · {check.caseState.replace('_', ' ')}
            </span>
          </div>
          {check.blockers.length > 0 && !dirty && (
            <ul className="mb-3 space-y-1 text-[12px] text-ink-muted">
              {check.blockers.map((b) => (
                <li key={b} className="flex gap-2">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber" aria-hidden /> {b}
                </li>
              ))}
            </ul>
          )}
          {isAuthor && mayRelease && (
            <p className="mb-3 flex gap-2 text-[12px] text-amber">
              <UserX size={13} className="mt-0.5 shrink-0" aria-hidden />
              {correcting
                ? 'You wrote this brief or opened this correction: someone else releases it.'
                : 'You wrote this brief: someone else releases it.'}
            </p>
          )}
          {mayRelease ? (
            <Button
              variant="success"
              size="md"
              icon={Rocket}
              className="w-full"
              disabled={dirty || !check.ready || isAuthor}
              loading={pending}
              onClick={onRelease}
            >
              {correcting ? `Release correction (v${brief.currentVersion})` : 'Release brief'}
            </Button>
          ) : (
            <p className="text-[11.5px] text-ink-faint">
              A reviewer or centre lead releases briefs.
            </p>
          )}
        </>
      )}
    </Panel>
  )
}

/**
 * A section's heading (E34). It names every sentence in the run below it until the next heading;
 * renaming it renames the run, and an empty name leaves the sentences without a heading.
 */
function SectionHeading({
  name,
  editable,
  onRename,
}: {
  name?: string
  editable: boolean
  onRename: (name: string) => void
}) {
  if (!editable && !name) return null
  return (
    <li className="bg-tint/[0.02] px-4 py-2">
      {editable ? (
        <input
          value={name ?? ''}
          onChange={(e) => onRename(e.target.value)}
          maxLength={120}
          aria-label="Section heading"
          placeholder="No heading: name this section"
          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-semibold tracking-wide text-ink-2 uppercase placeholder:font-normal placeholder:normal-case placeholder:text-ink-faint hover:border-line focus:border-cyan/50 focus:outline-none"
        />
      ) : (
        <h3 className="text-[12px] font-semibold tracking-wide text-ink-2 uppercase">{name}</h3>
      )}
    </li>
  )
}

/**
 * The brief as a reader will get it, before release (E34): headings, each sentence with the
 * labels of what it cites, then only the sources cited. The PDF itself can be shown here too.
 */
function BriefPreview({
  title,
  caseRef,
  version,
  released,
  sentences,
  citable,
  dirty,
  briefId,
}: {
  title: string
  caseRef?: string
  version: number
  released: boolean
  sentences: BriefSentence[]
  citable: Citable[]
  dirty: boolean
  briefId: string
}) {
  const toast = useToast()
  const [pdf, setPdf] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => () => void (pdf && URL.revokeObjectURL(pdf)), [pdf])

  const labelOf = new Map(citable.map((c) => [c.ref, c.label]))
  const cited = new Set(sentences.flatMap((s) => s.supportRefs))
  const sources = citable.filter((c) => cited.has(c.ref))
  const written = sentences.filter((s) => s.text.trim())

  const showPdf = async () => {
    setLoading(true)
    try {
      setPdf(URL.createObjectURL(await api.briefPdf(briefId, released ? version : undefined)))
    } catch (e) {
      toast({ title: 'No PDF', detail: describeError(e), tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-6 py-5">
      {!released && (
        <p className="mb-4 rounded-md border border-amber/30 bg-amber/[0.06] px-3 py-2 text-[11.5px] text-amber">
          Draft: not for distribution.{' '}
          {dirty
            ? 'This preview includes your unsaved changes; the PDF shows the last saved version.'
            : ''}
        </p>
      )}
      <article className="font-serif text-ink">
        <p className="eyebrow text-cyan/80">Homeland Fusion Centre · Brief</p>
        <h2 className="mt-1 text-[22px] leading-tight font-semibold">
          {title || 'Untitled brief'}
        </h2>
        <p className="mt-1 text-[11.5px] text-ink-faint">
          {caseRef ?? 'Case'} · Version {version}
        </p>
        {written.length === 0 ? (
          <p className="mt-5 text-[13px] text-ink-muted">Nothing written yet.</p>
        ) : (
          written.map((s, i) => (
            <Fragment key={i}>
              {s.section && s.section !== written[i - 1]?.section && (
                <h3 className="mt-5 mb-2 font-sans text-[13px] font-semibold text-ink">
                  {s.section}
                </h3>
              )}
              <p className="mb-2.5 text-[14px] leading-relaxed">
                {s.text}
                {/* As the PDF prints it: only the labels of references that resolve. */}
                {s.supportRefs.some((r) => labelOf.has(r)) && (
                  <sup className="ml-1 font-sans text-[10px] font-bold text-cyan">
                    [{s.supportRefs.flatMap((r) => labelOf.get(r) ?? []).join(', ')}]
                  </sup>
                )}
              </p>
            </Fragment>
          ))
        )}
        {sources.length > 0 && (
          <>
            <h3 className="mt-6 border-t border-line pt-3 font-sans text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase">
              Sources
            </h3>
            <dl className="mt-2 space-y-1 font-sans text-[12px]">
              {sources.map((c) => (
                <div key={c.ref} className="flex gap-3">
                  <dt className="w-16 shrink-0 font-mono text-[11px] font-semibold text-cyan">
                    {c.label}
                  </dt>
                  <dd className="text-ink-2">{c.text}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </article>
      <div className="mt-6 border-t border-line-soft pt-4">
        {pdf ? (
          <iframe
            src={pdf}
            title={released ? `Released PDF, version ${version}` : 'Draft PDF preview'}
            className="h-[70vh] w-full rounded-md border border-line bg-white"
          />
        ) : (
          <Button variant="secondary" icon={FileText} loading={loading} onClick={showPdf}>
            {released ? `Show the released PDF (v${version}) here` : 'Show the draft PDF here'}
          </Button>
        )}
      </div>
    </div>
  )
}
