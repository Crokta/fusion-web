import { MonitorUp, UserPlus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { WallContentKey } from '@/api/types'
import { Badge, Button, Kbd, LiveDot, MarkingTag } from '@/components/ui'
import { useReducedMotion } from '@/lib/hooks'
import { screenLabel } from '@/lib/wall-model'
import { CATALOGUE, isWithheld } from './catalogue'
import { ScreenContent } from './ScreenContent'

export interface FocusTarget {
  index: number
  span: number[]
  content: WallContentKey
  contextRef?: string
  from: DOMRect | null
}

/**
 * Full-screen view of one screen. It opens with a shared-element zoom from the tile that was
 * focused, so the operator never loses track of which physical screen they are looking at.
 */
export function FocusView({
  target,
  visitorMode,
  onClose,
  onSendToWall,
  onSendToAnalyst,
}: {
  target: FocusTarget | null
  visitorMode: boolean
  onClose: () => void
  onSendToWall: (content: WallContentKey) => void
  onSendToAnalyst: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const ghost = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const open = !!target

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])

  useLayoutEffect(() => {
    if (!target?.from || reduced || !ghost.current || !body.current) return
    const r = target.from
    const g = ghost.current
    const vw = window.innerWidth
    const vh = window.innerHeight
    const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'
    g.style.display = 'block'
    // Hide the ghost by timer as well as on finish: background tabs may never run the animation.
    const hide = window.setTimeout(() => (g.style.display = 'none'), 650)
    g.animate(
      [
        {
          left: `${r.left}px`,
          top: `${r.top}px`,
          width: `${r.width}px`,
          height: `${r.height}px`,
          opacity: 1,
          borderRadius: '4px',
        },
        {
          left: '0px',
          top: '0px',
          width: `${vw}px`,
          height: `${vh}px`,
          opacity: 0,
          borderRadius: '0px',
        },
      ],
      { duration: 520, easing: ease, fill: 'forwards' },
    )
    body.current.animate(
      [
        { opacity: 0, transform: 'scale(0.985)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 380, delay: 120, easing: ease, fill: 'backwards' },
    )
    return () => window.clearTimeout(hide)
  }, [target, reduced])

  const def = target ? CATALOGUE[target.content] : null
  const withheld = target ? isWithheld(target.content, visitorMode) : false

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-base p-0 text-ink backdrop:bg-void"
      aria-label={
        def ? `Focused screen ${screenLabel(target!.index)}: ${def.title}` : 'Focused screen'
      }
    >
      {target && def && (
        <>
          <div
            ref={ghost}
            aria-hidden
            className="pointer-events-none fixed z-10 border border-cyan bg-[linear-gradient(150deg,#10283a,#07141e)] shadow-[0_0_60px_rgb(69_215_242/.35)]"
            style={{ display: 'none' }}
          />
          <div ref={body} className="flex h-full flex-col">
            <header className="flex flex-wrap items-center gap-3 border-b border-line bg-void/80 px-6 py-3.5 backdrop-blur">
              <Badge tone="cyan" className="font-mono">
                SCREEN {screenLabel(target.index)}
                {target.span.length > 1 && `–${screenLabel(Math.max(...target.span))}`}
              </Badge>
              <def.icon size={18} className="text-cyan" />
              <h2 className="text-[17px] font-semibold tracking-[0.04em] uppercase">{def.title}</h2>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-green">
                <LiveDot /> Simulated live
              </span>
              <MarkingTag marking={def.marking} />
              {target.contextRef && (
                <Badge tone="neutral" className="font-mono">
                  {target.contextRef}
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Button icon={MonitorUp} onClick={() => onSendToWall(target.content)}>
                  Send to wall
                </Button>
                <Button icon={UserPlus} onClick={onSendToAnalyst}>
                  Send to analyst
                </Button>
                <Button variant="danger" icon={X} onClick={onClose}>
                  Exit focus <Kbd className="ml-1 border-red/30 text-red/80">Esc</Kbd>
                </Button>
              </div>
            </header>
            <div className="min-h-0 flex-1 p-6">
              <div className="surface h-full overflow-auto rounded-xl p-6">
                {withheld ? (
                  <div className="grid h-full place-items-center text-ink-muted">
                    Withheld while Visitor mode is on.
                  </div>
                ) : (
                  <ScreenContent content={target.content} big contextRef={target.contextRef} />
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </dialog>
  )
}
