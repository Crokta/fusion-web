import type { QueryClient } from '@tanstack/react-query'
import { Link, createRootRouteWithContext } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { EmptyState } from '@/components/ui'
import { AppShell } from '@/features/shell/AppShell'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: AppShell,
  notFoundComponent: () => (
    <EmptyState icon={Compass} title="Nothing on this channel" className="py-28">
      The page you asked for does not exist.{' '}
      <Link to="/" className="text-cyan hover:underline">
        Back to the watch floor
      </Link>
    </EmptyState>
  ),
})
