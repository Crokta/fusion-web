import { createFileRoute } from '@tanstack/react-router'
import { LeadershipPage } from '@/features/leadership/LeadershipPage'

export const Route = createFileRoute('/leadership')({ component: LeadershipPage })
