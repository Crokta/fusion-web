import { createFileRoute } from '@tanstack/react-router'
import { WallSimulatorPage } from '@/features/wall/WallSimulatorPage'

export const Route = createFileRoute('/wall_/simulator')({ component: WallSimulatorPage })
