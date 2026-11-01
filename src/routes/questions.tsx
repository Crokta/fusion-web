import { createFileRoute } from '@tanstack/react-router'
import { QuestionsPage } from '@/features/leadership/QuestionsPage'

export const Route = createFileRoute('/questions')({ component: QuestionsPage })
