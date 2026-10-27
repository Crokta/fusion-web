import { Briefcase, ShieldCheck, Siren, Telescope, type LucideIcon } from 'lucide-react'
import type { WallPreset, WallPresetKey, WallState } from '@/api/types'
import { Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import { MiniWall } from './MiniWall'

const ICON: Record<WallPresetKey, LucideIcon> = {
  standing: Telescope,
  incident: Siren,
  verification: ShieldCheck,
  briefing: Briefcase,
}

export function PresetBar({
  presets,
  state,
  pendingKey,
  onActivate,
}: {
  presets?: WallPreset[]
  state?: WallState
  pendingKey?: WallPresetKey
  onActivate: (key: WallPresetKey) => void
}) {
  if (!presets) {
    return (
      <div className="grid grid-cols-2 gap-2.5 min-[1400px]:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-lg" />
        ))}
      </div>
    )
  }
  return (
    <div
      role="radiogroup"
      aria-label="Wall preset"
      className="grid grid-cols-2 gap-2.5 min-[1400px]:grid-cols-4"
    >
      {presets.map((p) => {
        const active = state?.preset === p.key
        const Icon = ICON[p.key]
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onActivate(p.key)}
            className={cn(
              'group relative flex items-center gap-3.5 overflow-hidden rounded-lg border p-2.5 pr-3.5 text-left transition-[border-color,background,box-shadow] duration-200',
              active
                ? 'border-cyan/55 bg-cyan/[0.07] shadow-[0_0_0_1px_rgb(69_215_242/.25),0_10px_30px_-14px_rgb(69_215_242/.5)]'
                : 'surface hover:border-line-strong hover:bg-panel-2',
            )}
          >
            <MiniWall
              screens={p.screens}
              groups={p.groups}
              showIcons
              className={cn(
                'w-[104px] shrink-0 transition-transform duration-300 group-hover:scale-[1.03]',
                active && 'ring-cyan/40',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <Icon size={13} className={active ? 'text-cyan' : 'text-ink-muted'} aria-hidden />
                <span className="truncate text-[13px] font-semibold text-ink">{p.name}</span>
              </span>
              <span className="mt-1 line-clamp-2 block text-[11.5px] leading-snug text-ink-muted">
                {p.description}
              </span>
              <span
                className={cn(
                  'mt-1.5 block text-[10px] font-semibold tracking-[0.12em] uppercase',
                  active ? 'text-cyan' : 'text-ink-faint',
                )}
              >
                {pendingKey === p.key ? 'Activating…' : active ? '● On wall' : 'Activate'}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
