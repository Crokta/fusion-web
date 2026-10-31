import { createFileRoute } from '@tanstack/react-router'
import { OutcomesPage } from '@/features/outcomes/OutcomesPage'

export const Route = createFileRoute('/outcomes')({ component: OutcomesPage })
