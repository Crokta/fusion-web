import { createFileRoute } from '@tanstack/react-router'
import { ProviderPage } from '@/features/provider/ProviderPage'

export const Route = createFileRoute('/provider')({ component: ProviderPage })
