import { createFileRoute } from '@tanstack/react-router'
import { MapPage } from '@/features/geo/MapPage'

export const Route = createFileRoute('/map')({ component: MapPage })
