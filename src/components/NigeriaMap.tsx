import { useId } from 'react'
import type { MapEvent, Priority } from '@/api/types'
import { cn } from '@/lib/cn'

/**
 * A stylised situation map. It is deliberately not a slippy map: the wall and the watch floor
 * need an at-a-glance picture, and the real tile server (Martin + OSM vector tiles) arrives
 * with the geo epic. The outline is a simplified trace of Nigeria's borders.
 */

const BOUNDS = { minLon: 2.4, maxLon: 15.0, minLat: 3.9, maxLat: 14.1 }
const W = 400
const H = 330

export function project(lon: number, lat: number): [number, number] {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * W
  const y = H - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * H
  return [x, y]
}

const OUTLINE: [number, number][] = [
  [2.69, 6.37],
  [2.72, 7.8],
  [2.75, 9.05],
  [3.1, 9.4],
  [3.6, 10.3],
  [3.65, 11.7],
  [3.6, 11.95],
  [4.1, 12.9],
  [4.25, 13.45],
  [5.3, 13.75],
  [6.1, 13.65],
  [6.8, 13.1],
  [7.8, 13.35],
  [9.0, 12.85],
  [9.6, 12.8],
  [10.6, 13.3],
  [11.5, 13.35],
  [12.3, 13.1],
  [13.1, 13.55],
  [13.6, 13.7],
  [14.1, 12.95],
  [14.2, 12.4],
  [14.6, 12.15],
  [14.55, 11.6],
  [13.95, 11.0],
  [13.7, 10.15],
  [13.25, 9.6],
  [13.15, 8.9],
  [12.8, 8.6],
  [12.2, 8.15],
  [12.0, 7.4],
  [11.6, 6.8],
  [11.1, 6.45],
  [10.6, 6.95],
  [10.15, 6.95],
  [9.75, 6.6],
  [9.45, 6.1],
  [8.85, 5.1],
  [8.5, 4.75],
  [7.95, 4.45],
  [7.0, 4.4],
  [6.4, 4.3],
  [5.85, 4.35],
  [5.45, 5.1],
  [5.0, 5.75],
  [4.5, 6.25],
  [3.75, 6.4],
  [2.69, 6.37],
]

const RIVERS: [number, number][][] = [
  // Niger, entering from the north-west and meeting the Benue at Lokoja
  [
    [3.6, 11.75],
    [4.3, 11.0],
    [4.6, 10.2],
    [5.2, 9.4],
    [6.0, 8.95],
    [6.7, 8.4],
    [6.75, 7.8],
    [6.7, 6.9],
    [6.5, 5.9],
    [6.2, 5.1],
  ],
  // Benue
  [
    [12.95, 9.3],
    [12.4, 9.25],
    [11.2, 9.0],
    [10.1, 8.4],
    [9.0, 7.8],
    [7.9, 7.8],
    [6.75, 7.8],
  ],
]

const CITIES: { name: string; lon: number; lat: number; capital?: boolean }[] = [
  { name: 'Abuja', lon: 7.49, lat: 9.06, capital: true },
  { name: 'Lagos', lon: 3.38, lat: 6.52 },
  { name: 'Kano', lon: 8.52, lat: 12.0 },
  { name: 'Kaduna', lon: 7.44, lat: 10.52 },
  { name: 'Port Harcourt', lon: 7.03, lat: 4.82 },
  { name: 'Maiduguri', lon: 13.16, lat: 11.85 },
  { name: 'Sokoto', lon: 5.24, lat: 13.06 },
  { name: 'Jos', lon: 8.89, lat: 9.9 },
  { name: 'Enugu', lon: 7.5, lat: 6.45 },
  { name: 'Ibadan', lon: 3.9, lat: 7.38 },
]

const path = (pts: [number, number][], close = false) =>
  pts
    .map(
      ([lon, lat], i) =>
        `${i ? 'L' : 'M'}${project(lon, lat)
          .map((n) => n.toFixed(1))
          .join(',')}`,
    )
    .join(' ') + (close ? ' Z' : '')

const priorityColor: Record<Priority, string> = {
  high: 'var(--color-red)',
  medium: 'var(--color-amber)',
  low: 'var(--color-teal)',
}

export function NigeriaMap({
  events,
  className,
  selectedId,
  onSelect,
  labels = true,
  dense = false,
}: {
  events: MapEvent[]
  className?: string
  selectedId?: string
  onSelect?: (e: MapEvent) => void
  labels?: boolean
  dense?: boolean
}) {
  const uid = useId().replace(/:/g, '')
  return (
    <svg
      viewBox={`-10 -10 ${W + 20} ${H + 20}`}
      className={cn('h-full w-full', className)}
      role="img"
      aria-label="Situation map of Nigeria with reported events"
    >
      <defs>
        <radialGradient id={`land-${uid}`} cx="55%" cy="45%" r="70%">
          <stop offset="0" stopColor="#123447" />
          <stop offset="1" stopColor="#0a1c28" />
        </radialGradient>
        <pattern id={`grid-${uid}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="rgb(69 215 242 / .06)" strokeWidth="0.6" />
        </pattern>
        <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id={`clip-${uid}`}>
          <path d={path(OUTLINE, true)} />
        </clipPath>
      </defs>

      <rect x="-10" y="-10" width={W + 20} height={H + 20} fill={`url(#grid-${uid})`} />
      <path
        d={path(OUTLINE, true)}
        fill={`url(#land-${uid})`}
        stroke="rgb(69 215 242 / .55)"
        strokeWidth="1.2"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 0 10px rgb(69 215 242 / .18))' }}
      />
      <g clipPath={`url(#clip-${uid})`}>
        <rect x="0" y="0" width={W} height={H} fill={`url(#grid-${uid})`} opacity="0.8" />
      </g>
      {RIVERS.map((r, i) => (
        <path
          key={i}
          d={path(r)}
          fill="none"
          stroke="rgb(69 180 242 / .28)"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ))}

      {labels &&
        CITIES.map((c) => {
          const [x, y] = project(c.lon, c.lat)
          return (
            <g key={c.name} opacity={dense ? 0.55 : 0.8}>
              {c.capital ? (
                <rect
                  x={x - 2.4}
                  y={y - 2.4}
                  width="4.8"
                  height="4.8"
                  transform={`rotate(45 ${x} ${y})`}
                  fill="none"
                  stroke="#cfe6ef"
                  strokeWidth="1"
                />
              ) : (
                <circle cx={x} cy={y} r="1.6" fill="#8fb1c1" />
              )}
              <text
                x={x + 6}
                y={y + 3}
                fontSize={dense ? 8 : 9}
                fill="#9cb7c6"
                fontFamily="var(--font-sans)"
                fontWeight="500"
                letterSpacing="0.02em"
              >
                {c.name}
              </text>
            </g>
          )
        })}

      {events.map((e) => {
        const [x, y] = project(e.lon, e.lat)
        const color = priorityColor[e.priority]
        const selected = e.id === selectedId
        const r = e.priority === 'high' ? 5 : 4
        return (
          <g
            key={e.id}
            className={cn(onSelect && 'cursor-pointer')}
            onClick={() => onSelect?.(e)}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={onSelect ? `${e.title}, ${e.place}` : undefined}
            onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && onSelect?.(e)}
          >
            <title>{`${e.title} · ${e.place} · ${e.precision}`}</title>
            {e.priority !== 'low' && (
              <circle
                cx={x}
                cy={y}
                r={r}
                fill={color}
                opacity="0.5"
                className="origin-center animate-ping-slow"
                style={{ transformBox: 'fill-box' }}
              />
            )}
            {e.precision === 'estimated' && (
              <circle
                cx={x}
                cy={y}
                r={r + 7}
                fill="none"
                stroke={color}
                strokeOpacity="0.5"
                strokeDasharray="2 2.5"
                strokeWidth="0.9"
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={r}
              fill={color}
              stroke="#e8fbff"
              strokeWidth={selected ? 2 : 1.2}
              filter={`url(#glow-${uid})`}
            />
            {selected && (
              <circle
                cx={x}
                cy={y}
                r={r + 4}
                fill="none"
                stroke="var(--color-cyan)"
                strokeWidth="1.5"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}
