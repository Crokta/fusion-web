import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowLeft, Search } from 'lucide-react'
import { SOON_SECTIONS } from '@/features/shell/nav'

const EPICS: Record<string, string> = {
  products: 'E28 · Briefs, release and distribution',
  'my-feed': 'E19 · Channels and personal feeds',
  analytics: 'E35 · Outcome dashboard',
  entities: 'E22 · Entity resolution',
  network: 'E23 · Link analysis',
  gazetteer: 'E21 · Geo and gazetteer',
  names: 'E24 · Names of interest',
  'live-feeds': 'E36 · Wall inputs and live sources',
}

export const Route = createFileRoute('/$section')({
  loader: ({ params }) => {
    const item = SOON_SECTIONS[params.section]
    if (!item) throw notFound()
    return { section: params.section }
  },
  component: ComingSoon,
})

function ComingSoon() {
  const { section } = Route.useLoaderData()
  const item = SOON_SECTIONS[section]!
  const Icon = item.icon
  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <section className="surface relative isolate mx-auto mt-10 max-w-2xl overflow-hidden rounded-xl px-10 py-14 text-center animate-rise-in">
        <div
          aria-hidden
          className="grid-texture absolute inset-0 -z-10 [mask-image:radial-gradient(circle_at_50%_35%,black,transparent_70%)]"
        />
        <div
          aria-hidden
          className="absolute top-10 left-1/2 -z-10 size-48 -translate-x-1/2 rounded-full bg-cyan/10 blur-3xl"
        />
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-cyan/30 bg-raised/70 text-cyan shadow-[0_0_40px_-8px_rgb(69_215_242/.55)]">
          <Icon size={26} strokeWidth={1.6} />
        </div>
        <div className="eyebrow text-cyan/80">Coming soon</div>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-ink">{item.label}</h1>
        <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-muted">
          {item.description}
        </p>
        <p className="mt-4 inline-flex rounded-full border border-line-strong px-3 py-1 font-mono text-[11px] text-ink-faint">
          Planned in epic {EPICS[section] ?? 'TBC'}
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <Link
            to="/"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[12.5px] text-ink-2 hover:border-cyan/50 hover:text-ink"
          >
            <ArrowLeft size={14} /> Watch floor
          </Link>
          <Link
            to="/search"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-cyan/90 px-3 text-[12.5px] font-semibold text-void hover:bg-cyan"
          >
            <Search size={14} /> Search intelligence
          </Link>
        </div>
      </section>
    </div>
  )
}
