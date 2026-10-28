import { createFileRoute } from '@tanstack/react-router'
import { RosterPage } from '@/features/roster/RosterPage'

export const Route = createFileRoute('/roster')({ component: RosterPage })
