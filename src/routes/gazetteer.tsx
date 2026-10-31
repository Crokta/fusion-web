import { createFileRoute } from '@tanstack/react-router'
import { GazetteerPage } from '@/features/geo/GazetteerPage'

export const Route = createFileRoute('/gazetteer')({ component: GazetteerPage })
