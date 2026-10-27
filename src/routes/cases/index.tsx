import { createFileRoute } from '@tanstack/react-router'
import { CasesPage } from '@/features/cases/CasesPage'

export const Route = createFileRoute('/cases/')({ component: CasesPage })
