import { createFileRoute } from '@tanstack/react-router'
import { CctvRequestsPage } from '@/features/cctv/CctvRequestsPage'

export const Route = createFileRoute('/cctv')({ component: CctvRequestsPage })
