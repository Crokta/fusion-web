import { createFileRoute } from '@tanstack/react-router'
import { NamesPage } from '@/features/names/NamesPage'

export const Route = createFileRoute('/names/')({ component: NamesPage })
