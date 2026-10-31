import { createFileRoute } from '@tanstack/react-router'
import { MissionsPage } from '@/features/missions/MissionsPage'

export const Route = createFileRoute('/missions')({ component: MissionsPage })
