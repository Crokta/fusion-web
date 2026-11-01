import { EyeOff, KeyRound, MonitorPlay, PlugZap, ShieldAlert } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, describeError } from '@/api'
import { useWallZoneContent, useWallZones } from '@/api/queries'
import type { WallZone } from '@/api/types'
import { Button, inputClass } from '@/components/ui'
import { cn } from '@/lib/cn'
import { dateTime, relative } from '@/lib/format'
import { CATALOGUE } from './catalogue'

/** Where the controller PC keeps its token: only on that machine (ADR 0019). */
const TOKEN_KEY = 'fusion.wall.renderer-token'

function readToken(): string | null {
  // A token handed over as #token=… goes into storage and off the address bar, so it is not
  // left in the browser's history or on screen.
  const hash = new URLSearchParams(window.location.hash.slice(1)).get('token')
  try {
    if (hash) {
      localStorage.setItem(TOKEN_KEY, hash)
      history.replaceState(null, '', window.location.pathname)
    }
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return hash
  }
}

function forgetToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the token only lived in memory.
  }
}

/**
 * The wall renderer (E34, ADR 0019): what a display on the controller PC draws. It runs with no
 * one signed in, on a read-only token a wall operator issued, and draws the zones of the layout
 * that was last published, never the planner's. Zones under Visitor Mode draw nothing.
 */
export function WallDisplayApp() {
  const [token, setToken] = useState<string | null>(() => readToken())
  const [notice, setNotice] = useState<string>()
  if (!token)
    return (
      <TokenSetup
        notice={notice}
        onSave={(t) => {
          try {
            localStorage.setItem(TOKEN_KEY, t)
          } catch {
            // Storage blocked: keep it for this session only.
          }
          setToken(t)
        }}
      />
    )
  return (
    <WallDisplay
      token={token}
      onRejected={() => {
        forgetToken()
        setNotice(
          'The wall refused this token: it may have been revoked. Ask a wall operator for a new one.',
        )
        setToken(null)
      }}
    />
  )
}

function TokenSetup({ onSave, notice }: { onSave: (token: string) => void; notice?: string }) {
  const [value, setValue] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) onSave(value.trim())
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-void px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-canvas p-6 shadow-lg"
      >
        <div className="mb-4 flex items-center gap-2 text-cyan">
          <MonitorPlay size={18} aria-hidden />
          <span className="eyebrow">Wall display</span>
        </div>
        <h1 className="text-[18px] font-semibold text-ink">Connect this display</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">
          Paste the display token a wall operator issued from the controller view. It is kept on
          this machine only, and lets the display read what is on the wall, nothing else.
        </p>
        {notice && (
          <p role="alert" className="mt-3 text-[12px] text-red">
            {notice}
          </p>
        )}
        <label className="mt-4 block text-[12px] text-ink-2" htmlFor="wall-token">
          Display token
        </label>
        <input
          id="wall-token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="wrt_…"
          className={cn(inputClass, 'mt-1 font-mono text-[12px]')}
        />
        <Button
          type="submit"
          size="md"
          icon={KeyRound}
          className="mt-4 w-full"
          disabled={!value.trim()}
        >
          Connect
        </Button>
      </form>
    </div>
  )
}

function WallDisplay({ token, onRejected }: { token: string; onRejected: () => void }) {
  const zones = useWallZones(token)
  const rejected =
    zones.error instanceof ApiError && (zones.error.status === 401 || zones.error.status === 403)
  useEffect(() => {
    if (rejected) onRejected()
  }, [rejected, onRejected])

  const data = zones.data
  return (
    <div className="flex h-dvh flex-col bg-void text-ink">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-1.5 text-[11px] text-ink-faint">
        <MonitorPlay size={13} className="text-cyan" aria-hidden />
        <span className="eyebrow text-cyan/80">Homeland Fusion Centre</span>
        {data?.published ? (
          <span>
            {data.published.ref} · revision {data.published.revision} · published{' '}
            {relative(data.published.publishedAt)}
          </span>
        ) : (
          <span>Nothing has been published to the wall yet.</span>
        )}
        {data?.visitorMode && (
          <span className="rounded bg-amber/15 px-1.5 py-0.5 font-semibold text-amber">
            Visitor Mode
          </span>
        )}
        <span className="ml-auto">
          {zones.isError && !rejected
            ? `Not updating: ${describeError(zones.error)}`
            : data
              ? `Updated ${dateTime(data.at)}`
              : 'Connecting…'}
        </span>
      </header>
      {data && data.zones.length > 0 ? (
        <main
          className="grid min-h-0 flex-1 gap-1 p-1"
          style={{
            gridTemplateColumns: `repeat(${data.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${data.rows}, minmax(0, 1fr))`,
          }}
        >
          {data.zones.map((z) => (
            <ZoneTile key={z.id} zone={z} cols={data.cols} token={token} />
          ))}
        </main>
      ) : (
        <main className="grid flex-1 place-items-center text-[14px] text-ink-faint">
          {data ? 'The wall shows nothing until a wall operator publishes a layout.' : null}
        </main>
      )}
    </div>
  )
}

/** A zone's rectangle on the grid, from its cells (row-major, 0-based). */
function area(cells: number[], cols: number) {
  const rows = cells.map((c) => Math.floor(c / cols))
  const columns = cells.map((c) => c % cols)
  return {
    gridRow: `${Math.min(...rows) + 1} / ${Math.max(...rows) + 2}`,
    gridColumn: `${Math.min(...columns) + 1} / ${Math.max(...columns) + 2}`,
  }
}

function ZoneTile({ zone, cols, token }: { zone: WallZone; cols: number; token: string }) {
  const def = CATALOGUE[zone.content]
  const content = useWallZoneContent(zone.id, token)
  const Icon = def?.icon ?? MonitorPlay
  const c = content.data
  return (
    <section
      aria-label={def?.title ?? zone.content}
      style={area(zone.cells, cols)}
      className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-line bg-canvas"
    >
      <header className="flex items-center gap-2 border-b border-line-soft px-3 py-1.5">
        <Icon size={13} className="text-cyan" aria-hidden />
        <h2 className="truncate text-[12px] font-semibold tracking-wide uppercase">
          {def?.title ?? zone.content}
        </h2>
        {zone.contextRef && (
          <span className="ml-auto truncate font-mono text-[10.5px] text-ink-faint">
            {zone.contextRef}
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {zone.muted || c?.source === 'muted' ? (
          <Slate icon={EyeOff} title="Withheld for visitors">
            Visitor Mode is on.
          </Slate>
        ) : content.isError ? (
          <Slate icon={ShieldAlert} title="Not available">
            {describeError(content.error)}
          </Slate>
        ) : !c ? null : c.source === 'not_connected' ? (
          <Slate icon={PlugZap} title={def?.short ?? zone.content}>
            No released feed reaches the wall for this yet.
          </Slate>
        ) : (
          <div className="flex h-full flex-col gap-3">
            {c.counts.length > 0 && (
              <dl className="flex flex-wrap gap-x-6 gap-y-2">
                {c.counts.map((n) => (
                  <div key={n.key}>
                    <dt className="text-[10.5px] tracking-wide text-ink-faint uppercase">
                      {n.label}
                    </dt>
                    <dd className="num text-[26px] leading-none font-semibold">{n.count}</dd>
                  </div>
                ))}
              </dl>
            )}
            {c.items.length > 0 && (
              <ul className="min-h-0 space-y-1.5 overflow-hidden">
                {c.items.map((i) => (
                  <li key={`${i.title}-${i.ref}-${i.at}`} className="text-[12.5px] leading-snug">
                    <span className="mr-1.5 font-mono text-[10.5px] text-cyan">{i.ref}</span>
                    <span className="font-medium">{i.title}</span>
                    <span className="text-ink-faint">
                      {i.detail ? ` · ${i.detail}` : ''}
                      {i.at ? ` · released ${relative(i.at)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {c.items.length === 0 && c.counts.length === 0 && (
              <p className="text-[12px] text-ink-faint">Nothing released yet.</p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function Slate({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof EyeOff
  title: string
  children: ReactNode
}) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div>
        <Icon size={20} className="mx-auto text-ink-faint" aria-hidden />
        <p className="mt-1.5 text-[12.5px] font-medium text-ink-2">{title}</p>
        <p className="mt-0.5 text-[11.5px] text-ink-faint">{children}</p>
      </div>
    </div>
  )
}
