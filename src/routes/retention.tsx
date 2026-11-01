import { createFileRoute } from '@tanstack/react-router'
import { RetentionPage } from '@/features/retention/RetentionPage'

export const Route = createFileRoute('/retention')({ component: RetentionPage })
