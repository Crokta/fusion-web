import { EyeOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { WallState } from '@/api/types'
import { Kbd } from '@/components/ui'
import { WallGrid } from './WallGrid'

const PRESET_NAME: Record<string, string> = {
  standing: 'Standing Watch',
  incident: 'Incident Command',
  verification: 'Verification Focus',
  briefing: 'Executive Brief',
  custom: 'Custom layout',
}

/**
 * What the room sees: the wall alone, letterboxed to 16:9, with a slim status strip. It also
 * asks the browser for real fullscreen so it can drive a secondary display directly.
 */
export function PresentationView({
  state,
  open,
  onClose,
}: {
  state: WallState
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal?.()
      d.requestFullscreen?.().catch(() => {})
    }
    if (!open && d.open) {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      d.close?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(new Date()), 1000)
    const onFs = () => !document.fullscreenElement && open && onClose()
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      clearInterval(t)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [open, onClose])

  return (
    <dialog
      // The wall's own content: dark whatever the desk's theme (index.css).
      data-theme="dark"
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-ink open:animate-fade-in"
      aria-label="Wall presentation view"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex h-9 shrink-0 items-center gap-4 border-b border-tint/[0.06] bg-void px-4 text-[11px] text-ink-muted">
            <span className="font-semibold tracking-[0.18em] text-ink-2 uppercase">
              Homeland Fusion Centre
            </span>
            <span className="text-ink-faint">·</span>
            <span>{PRESET_NAME[state.preset] ?? state.preset}</span>
            <span className="num text-ink-faint">rev {state.revision}</span>
            {state.visitorMode && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber/15 px-2 py-0.5 font-semibold text-amber">
                <EyeOff size={11} /> Visitor mode · sensitive zones withheld
              </span>
            )}
            <span className="flex-1" />
            <span className="num text-[13px] font-medium text-ink">
              {now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos' })} WAT
            </span>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-tint/5 hover:text-ink"
            >
              <X size={13} /> Exit <Kbd>Esc</Kbd>
            </button>
          </div>
          <div className="grid min-h-0 flex-1 place-items-center p-3">
            <div className="aspect-video max-h-full w-full max-w-[calc((100dvh-3.5rem)*16/9)] bg-[#020507] p-[3px]">
              <WallGrid
                state={state}
                selection={[]}
                onSelectionChange={() => {}}
                onFocus={() => {}}
                onSwap={() => {}}
                statusOverlay
                presentation
              />
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
