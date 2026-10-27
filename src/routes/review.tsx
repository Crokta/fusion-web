import { createFileRoute } from '@tanstack/react-router'
import { ReviewPage } from '@/features/review/ReviewPage'

export const Route = createFileRoute('/review')({ component: ReviewPage })
