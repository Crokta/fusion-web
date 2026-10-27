import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { IconButton } from './ui'

/**
 * Modal surfaces are native <dialog> elements opened with showModal(): the browser supplies the
 * focus trap, inert background, top-layer stacking and Escape handling, which is more robust
 * than any hand-rolled equivalent.
 */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal?.()
    if (!open && d.open) d.close?.()
  }, [open])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [onClose])
  return ref
}

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  actions,
  children,
  width = 'min(720px, 94vw)',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: string
}) {
  const ref = useDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 m-0 ml-auto h-dvh max-h-dvh max-w-none overflow-hidden border-0 bg-transparent p-0 text-ink backdrop:bg-void/70 backdrop:backdrop-blur-[2px] open:animate-slide-in-right"
      style={{ width }}
      aria-label={typeof title === 'string' ? title : undefined}
    >
      {open && (
        <div className="flex h-full flex-col border-l border-line-strong bg-panel shadow-[-30px_0_80px_-20px_rgb(0_0_0/.9)]">
          <header className="flex items-start gap-3 border-b border-line px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              {eyebrow && <div className="mb-1.5 flex flex-wrap items-center gap-2">{eyebrow}</div>}
              <h2 className="text-lg leading-snug font-semibold tracking-[-0.01em]">{title}</h2>
            </div>
            {actions}
            <IconButton icon={X} label="Close" onClick={onClose} />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {children}
          </div>
        </div>
      )}
    </dialog>
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const ref = useDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        'm-auto w-[min(560px,94vw)] overflow-visible rounded-xl border border-line-strong bg-panel p-0 text-ink shadow-pop backdrop:bg-void/70 backdrop:backdrop-blur-[2px] open:animate-scale-in',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[86dvh] flex-col">
          <header className="flex items-start gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
              {description && <p className="mt-1 text-xs text-ink-muted">{description}</p>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} className="-mt-1 -mr-1" />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
          {footer && (
            <footer className="flex items-center justify-end gap-2 rounded-b-xl border-t border-line bg-canvas/60 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  )
}
