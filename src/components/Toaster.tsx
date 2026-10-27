import { CheckCircle2, Info, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

type ToastTone = 'info' | 'success' | 'warning' | 'error'
interface Toast {
  id: number
  title: string
  detail?: string
  tone: ToastTone
}

const ToastContext = createContext<
  ((t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => void) | null
>(null)

const icons: Record<ToastTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: TriangleAlert,
}
const toneClass: Record<ToastTone, string> = {
  info: 'text-cyan',
  success: 'text-green',
  warning: 'text-amber',
  error: 'text-red',
}

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback(
    (t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => {
      const id = ++seq
      setToasts((prev) => [...prev.slice(-3), { id, tone: 'info', ...t }])
      setTimeout(() => dismiss(id), t.tone === 'error' ? 6000 : 3600)
    },
    [dismiss],
  )
  const value = useMemo(() => push, [push])
  return (
    <ToastContext value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[1000] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = icons[t.tone]
          return (
            <div
              key={t.id}
              className="pointer-events-auto flex animate-rise-in items-start gap-3 rounded-lg border border-line-strong bg-raised/95 px-3.5 py-3 shadow-pop backdrop-blur"
            >
              <Icon size={16} className={cn('mt-px shrink-0', toneClass[t.tone])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{t.title}</p>
                {t.detail && <p className="mt-0.5 text-xs text-ink-muted">{t.detail}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-ink-faint hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext>
  )
}

export function useToast() {
  const ctx = use(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
