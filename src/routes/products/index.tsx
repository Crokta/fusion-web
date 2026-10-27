import { createFileRoute } from '@tanstack/react-router'
import { BriefsPage } from '@/features/briefs/BriefsPage'

export const Route = createFileRoute('/products/')({ component: BriefsPage })
