import {
  AlertTriangle,
  ArrowRight,
  Clapperboard,
  FolderKanban,
  MapPin,
  MessagesSquare,
  Newspaper,
  Search,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useSearch } from '@/api/queries'
import type { SearchHit, SearchKind } from '@/api/types'
import { CaseLink, EmptyState, IconButton, Kbd, MarkingTag, Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { relative } from '@/lib/format'
import { useShell } from '@/features/shell/ShellContext'

export const KIND_META: Record<SearchKind, { label: string; icon: LucideIcon; tone: string }> = {
  person: { label: 'People', icon: User, tone: 'text-violet' },
  location: { label: 'Locations', icon: MapPin, tone: 'text-teal' },
  news: { label: 'News', icon: Newspaper, tone: 'text-cyan' },
  social: { label: 'Social', icon: MessagesSquare, tone: 'text-cyan' },
  media: { label: 'Media', icon: Clapperboard, tone: 'text-amber' },
  alert: { label: 'Alerts', icon: AlertTriangle, tone: 'text-red' },
  case: { label: 'Cases', icon: FolderKanban, tone: 'text-green' },
}

const SUGGESTIONS = ['Kaduna', 'Amina', 'Abuja', 'video', 'Port Harcourt', 'INV-0264']

/**
 * Unified intelligence search across news, social, media, people, places, alerts and cases.
 * Used inline on /search and as the full-screen overlay opened with "/" or from ⌘K.
 */
export function SearchExperience({
  initialQuery = '',
  onClose,
  autoFocus,
}: {
  initialQuery?: string
  onClose?: () => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState(initialQuery)
  const [kind, setKind] = useState<SearchKind | undefined>()
  const deferred = useDeferredValue(q.trim())
  const result = useSearch(deferred, kind)
  const { openItem } = useShell()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const facets = result.data?.facets
  const total = facets ? Object.values(facets).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-void/70 px-5 py-3.5 backdrop-blur">
        <span className="eyebrow hidden shrink-0 text-cyan sm:block">Intelligence search</span>
        <label className="relative flex-1">
          <span className="sr-only">Search all intelligence records</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-muted"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search names, places, events, articles, media, cases…"
            autoComplete="off"
            className="h-11 w-full rounded-full border border-line-strong bg-panel pr-4 pl-11 text-[14px] text-ink placeholder:text-ink-faint transition-colors focus:border-cyan/60 focus:ring-4 focus:ring-cyan/10 focus:outline-none focus-visible:outline-none"
          />
        </label>
        {onClose && (
          <>
            <Kbd className="hidden sm:inline-flex">Esc</Kbd>
            <IconButton icon={X} label="Close search" onClick={onClose} />
          </>
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[232px_1fr]">
        <aside className="hidden overflow-y-auto border-r border-line bg-void/30 p-4 md:block">
          <div className="eyebrow mb-2">Explore all sources</div>
          <FacetButton
            active={!kind}
            onClick={() => setKind(undefined)}
            label="All results"
            count={total}
            icon={Search}
            tone="text-ink-2"
          />
          {(Object.keys(KIND_META) as SearchKind[]).map((k) => (
            <FacetButton
              key={k}
              active={kind === k}
              onClick={() => setKind(k)}
              label={KIND_META[k].label}
              count={facets?.[k] ?? 0}
              icon={KIND_META[k].icon}
              tone={KIND_META[k].tone}
            />
          ))}
          <p className="mt-5 text-[11px] leading-relaxed text-ink-faint">
            Every query carries an ACL filter from your token. Private-individual searches are
            refused unless the policy flag is on and PI_SEARCH approval is complete.
          </p>
        </aside>

        <section className="min-h-0 overflow-y-auto px-5 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">
                {deferred ? <>Results for “{deferred}”</> : 'Unified intelligence results'}
              </h2>
              <p className="num mt-0.5 text-xs text-ink-faint">
                {result.data
                  ? `${result.data.items.length} matching records · ${Object.values(result.data.facets).filter(Boolean).length} source categories · ${result.data.tookMs} ms`
                  : 'Searching…'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQ(s)}
                  className={cn(
                    'h-6.5 rounded-full border px-2.5 text-[11.5px] transition-colors',
                    q === s
                      ? 'border-cyan/60 bg-cyan/10 text-cyan'
                      : 'border-line-strong text-ink-muted hover:border-cyan/40 hover:text-ink',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {result.isPending ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="surface space-y-3 rounded-lg p-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : result.data && result.data.items.length === 0 ? (
            <EmptyState icon={Search} title="No matching records">
              Try Kaduna, Abuja, Amina, Zamfara, video, or a case ID such as INV-0264.
            </EmptyState>
          ) : (
            <div
              className={cn(
                'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 transition-opacity',
                result.isFetching && 'opacity-70',
              )}
            >
              {result.data?.items.map((hit, i) => (
                <ResultCard
                  key={hit.id}
                  hit={hit}
                  index={i}
                  onOpen={() => openItem(hit.id)}
                  onPlace={() => setQ(hit.place)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function FacetButton({
  active,
  onClick,
  label,
  count,
  icon: Icon,
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon: LucideIcon
  tone: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'mb-0.5 flex h-8.5 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[12.5px] transition-colors',
        active
          ? 'bg-cyan/[0.09] text-ink ring-1 ring-cyan/30 ring-inset'
          : 'text-ink-muted hover:bg-white/[0.035] hover:text-ink-2',
      )}
    >
      <Icon size={14} className={tone} aria-hidden />
      <span className="flex-1">{label}</span>
      <span className="num text-[11px] text-ink-faint">{count}</span>
    </button>
  )
}

function ResultCard({
  hit,
  index,
  onOpen,
  onPlace,
}: {
  hit: SearchHit
  index: number
  onOpen: () => void
  onPlace: () => void
}) {
  const meta = KIND_META[hit.kind]
  return (
    <article
      className="surface group relative flex animate-rise-in flex-col rounded-lg p-4 transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-line-strong hover:shadow-[0_18px_40px_-24px_rgb(69_215_242/.35)]"
      style={{ animationDelay: `${Math.min(index, 10) * 25}ms` }}
    >
      <div className="flex items-center gap-2">
        <meta.icon size={13} className={meta.tone} aria-hidden />
        <span className={cn('text-[10.5px] font-semibold tracking-[0.1em] uppercase', meta.tone)}>
          {hit.kind}
        </span>
        <span className="truncate text-[11px] text-ink-faint">{hit.source}</span>
        <span className="flex-1" />
        <MarkingTag marking={hit.marking} />
      </div>
      <h3 className="mt-2.5 text-[14.5px] leading-snug font-semibold text-ink">
        <button
          type="button"
          onClick={onOpen}
          className="text-left after:absolute after:inset-0 hover:text-cyan focus-visible:outline-offset-4"
        >
          {hit.title}
        </button>
      </h3>
      {(hit.highlight ?? hit.summary) && (
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
          <Highlighted text={hit.highlight ?? hit.summary} />
        </p>
      )}
      <div className="relative z-10 mt-auto flex flex-wrap items-center gap-1.5 pt-3.5 text-[11px]">
        <button
          type="button"
          onClick={onPlace}
          className="inline-flex h-5.5 items-center gap-1 rounded-full bg-white/[0.04] px-2 text-ink-2 ring-1 ring-white/[0.06] hover:text-cyan"
        >
          <MapPin size={11} /> {hit.place}
        </button>
        {hit.caseRef && (
          <CaseLink
            caseRef={hit.caseRef}
            className="rounded-full bg-cyan/[0.06] px-2 py-0.5 ring-1 ring-cyan/15"
          />
        )}
        <span className="num text-ink-faint">{relative(hit.at)}</span>
        <ArrowRight
          size={14}
          className="ml-auto text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-cyan"
          aria-hidden
        />
      </div>
    </article>
  )
}

export function FusionSearchOverlay() {
  const { searchQuery, closeSearch, itemId } = useShell()
  const ref = useRef<HTMLDialogElement>(null)
  const open = searchQuery !== null
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        // Escape closes the item drawer first, then the search.
        if (!itemId) closeSearch()
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-base/97 p-0 text-ink backdrop:bg-void/80 open:animate-fade-in"
      aria-label="Unified intelligence search"
    >
      {open && (
        <SearchExperience initialQuery={searchQuery ?? ''} onClose={closeSearch} autoFocus />
      )}
    </dialog>
  )
}

/**
 * The index marks matched words with <mark>…</mark>. Split on the tags and render each part as
 * text, so nothing else in the snippet is ever treated as markup.
 */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(<mark>.*?<\/mark>)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('<mark>') ? (
          <mark key={i} className="rounded-[3px] bg-cyan/15 px-0.5 text-ink">
            {part.slice(6, -7)}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  )
}
