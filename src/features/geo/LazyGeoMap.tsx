import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { GeoMapProps } from './GeoMap'

// MapLibre is large; it loads with the first map on screen, not with the app.
const GeoMapImpl = lazy(() => import('./GeoMap'))

export function GeoMap(props: GeoMapProps) {
  return (
    <Suspense fallback={<Skeleton className={cn('rounded-md', props.className)} />}>
      <GeoMapImpl {...props} />
    </Suspense>
  )
}
