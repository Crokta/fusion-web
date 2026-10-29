import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import type { CaseState, Marking, Priority } from '@/api/types'
import { cn } from '@/lib/cn'

// ---------------------------------------------------------------- buttons

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'xs' | 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary:
    'bg-cyan/90 text-void font-semibold hover:bg-cyan shadow-[0_0_0_1px_rgb(69_215_242/.5),0_6px_20px_-6px_rgb(69_215_242/.55)] disabled:bg-cyan/30 disabled:shadow-none',
  secondary:
    'bg-raised/70 text-ink-2 border border-line-strong/80 hover:border-cyan/50 hover:text-ink hover:bg-hover',
  ghost: 'text-ink-muted hover:text-ink hover:bg-tint/[0.04]',
  danger: 'bg-red/10 text-red border border-red/35 hover:bg-red/18 hover:border-red/60',
  success: 'bg-green/12 text-green border border-green/35 hover:bg-green/20 hover:border-green/60',
}
const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-[11px] gap-1 rounded-sm',
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-8.5 px-3.5 text-[13px] gap-2 rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  icon: Icon,
  iconRight: IconRight,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'md' ? 15 : size === 'sm' ? 14 : 12
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-[background,border-color,color,box-shadow,transform] duration-150 select-none active:translate-y-px disabled:opacity-50 disabled:active:translate-y-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
        />
      ) : (
        Icon && <Icon size={iconSize} strokeWidth={2} aria-hidden />
      )}
      {children}
      {IconRight && (
        <IconRight size={iconSize} strokeWidth={2} aria-hidden className="opacity-70" />
      )}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  active?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-tint/[0.05] hover:text-ink disabled:opacity-40',
        active && 'bg-cyan/10 text-cyan',
        className,
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={1.9} aria-hidden />
    </button>
  )
}

// ---------------------------------------------------------------- badges

const tones = {
  cyan: 'text-cyan bg-cyan/10 ring-cyan/25',
  green: 'text-green bg-green/10 ring-green/25',
  amber: 'text-amber bg-amber/10 ring-amber/25',
  red: 'text-red bg-red/10 ring-red/30',
  violet: 'text-violet bg-violet/10 ring-violet/25',
  neutral: 'text-ink-2 bg-tint/[0.04] ring-tint/10',
} as const
export type Tone = keyof typeof tones

export function Badge({
  tone = 'neutral',
  children,
  className,
  dot,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 text-[10.5px] font-semibold tracking-wide whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

export const priorityTone: Record<Priority, Tone> = { high: 'red', medium: 'amber', low: 'green' }

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <Badge tone={priorityTone[priority]} className="uppercase">
      {priority}
    </Badge>
  )
}

/** Sensitivity marking. Printed in small caps with a coloured rule so it is never missed. */
export function MarkingTag({ marking, className }: { marking: Marking; className?: string }) {
  const tone =
    marking === 'SECRET'
      ? 'text-red border-red/50'
      : marking === 'OFFICIAL-SENSITIVE'
        ? 'text-amber border-amber/45'
        : 'text-ink-muted border-line-strong'
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center rounded-[3px] border px-1.5 font-mono text-[9.5px] font-medium tracking-[0.08em] whitespace-nowrap',
        tone,
        className,
      )}
      title={`Sensitivity marking: ${marking}`}
    >
      {marking}
    </span>
  )
}

export const CASE_STATES: { key: CaseState; label: string }[] = [
  { key: 'triage', label: 'Triage' },
  { key: 'open', label: 'Open' },
  { key: 'in_assessment', label: 'In assessment' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'released', label: 'Released' },
  { key: 'closed', label: 'Closed' },
]

export const caseStateLabel = (s: CaseState) =>
  s === 'returned' ? 'Returned' : (CASE_STATES.find((x) => x.key === s)?.label ?? s)

const stateTone: Record<CaseState, Tone> = {
  triage: 'violet',
  open: 'cyan',
  in_assessment: 'cyan',
  submitted: 'amber',
  returned: 'red',
  approved: 'green',
  released: 'green',
  closed: 'neutral',
}

export function CaseStateBadge({ state }: { state: CaseState }) {
  return (
    <Badge tone={stateTone[state]} dot>
      {caseStateLabel(state)}
    </Badge>
  )
}

export function LiveDot({
  tone = 'green',
  className,
}: {
  tone?: 'green' | 'cyan' | 'red' | 'amber'
  className?: string
}) {
  const color = { green: 'bg-green', cyan: 'bg-cyan', red: 'bg-red', amber: 'bg-amber' }[tone]
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      <span className={cn('absolute inset-0 rounded-full opacity-60 animate-ping-slow', color)} />
      <span className={cn('relative inline-flex size-2 rounded-full', color)} />
    </span>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-strong bg-tint/[0.03] px-1 font-sans text-[10px] font-medium text-ink-muted shadow-[0_1px_0_0_rgb(255_255_255/.04)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

// ---------------------------------------------------------------- panels

export function Panel({
  title,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
  eyebrow,
  ...rest
}: Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  eyebrow?: ReactNode
  bodyClassName?: string
}) {
  return (
    <section className={cn('surface flex min-w-0 flex-col rounded-lg', className)} {...rest}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center gap-2.5 border-b border-line-soft px-4 py-2">
          {Icon && (
            <Icon size={15} className="shrink-0 text-cyan/80" strokeWidth={1.9} aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && (
              <h2 className="truncate text-[13px] font-semibold tracking-[-0.005em] text-ink">
                {title}
              </h2>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1', bodyClassName ?? 'p-4')}>{children}</div>
    </section>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-6 gap-y-3 animate-rise-in">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="eyebrow mb-1.5 text-cyan/80">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] text-ink-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4', className)} aria-hidden />
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}
    >
      <div className="mb-3 grid size-11 place-items-center rounded-xl border border-line-strong bg-raised/60 text-cyan/80 shadow-[0_0_30px_-8px_rgb(69_215_242/.4)]">
        <Icon size={20} strokeWidth={1.7} aria-hidden />
      </div>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-xs text-ink-muted">{children}</div>}
    </div>
  )
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Request failed'
  return (
    <div
      role="alert"
      className="m-4 flex items-center gap-3 rounded-md border border-red/30 bg-red/[0.06] px-3 py-2.5 text-xs text-red"
    >
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="xs" variant="danger" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- data display

export function Sparkline({
  data,
  className,
  tone = 'cyan',
  height = 28,
}: {
  data: number[]
  className?: string
  tone?: 'cyan' | 'green' | 'amber' | 'red'
  height?: number
}) {
  // A trend needs two points; the real gateway sends none until history exists.
  if (data.length < 2) return <div className={className} style={{ height }} aria-hidden />
  const w = 100
  const h = height
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map(
    (v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 6)] as const,
  )
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = `var(--color-${tone})`
  const id = `spark-${tone}`
  const last = pts[pts.length - 1]!
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn('w-full overflow-visible', className)}
      style={{ height: h }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function Meter({
  value,
  tone = 'cyan',
  className,
}: {
  value: number
  tone?: Tone
  className?: string
}) {
  const bg = {
    cyan: 'bg-cyan',
    green: 'bg-green',
    amber: 'bg-amber',
    red: 'bg-red',
    violet: 'bg-violet',
    neutral: 'bg-ink-muted',
  }[tone]
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-tint/[0.06]', className)}
      role="meter"
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', bg)}
        style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }}
      />
    </div>
  )
}

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string
  size?: number
  className?: string
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-white/90 ring-1 ring-white/10',
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(140deg, hsl(${hue} 45% 34%), hsl(${(hue + 40) % 360} 50% 22%))`,
      }}
      aria-hidden
    >
      {initials}
    </span>
  )
}

export function CaseLink({ caseRef, className }: { caseRef: string; className?: string }) {
  return (
    <Link
      to="/cases/$caseId"
      params={{ caseId: caseRef.toLowerCase() }}
      className={cn(
        'font-mono text-[11px] font-medium text-cyan hover:text-ink hover:underline underline-offset-2',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {caseRef}
    </Link>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  label: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-md border border-line bg-canvas/80 p-0.5', className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-6.5 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-raised text-ink shadow-[0_0_0_1px_var(--color-line-strong)]'
              : 'text-ink-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className="num text-[10.5px] text-ink-faint">{o.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-line-strong/80 bg-canvas px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint transition-colors hover:border-line-strong focus:border-cyan/60 focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-cyan/20'
