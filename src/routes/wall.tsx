import { createFileRoute } from '@tanstack/react-router'
import { WallPage } from '@/features/wall/WallPage'

export const Route = createFileRoute('/wall')({ component: WallPage })
