import { createFileRoute } from '@tanstack/react-router'
import { SupervisorDeskPage } from '@/features/desk/SupervisorDeskPage'

export const Route = createFileRoute('/desk')({ component: SupervisorDeskPage })
