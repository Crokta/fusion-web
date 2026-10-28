import { createFileRoute } from '@tanstack/react-router'
import { AlertPage } from '@/features/alerts/AlertPage'

export const Route = createFileRoute('/alerts/$alertId')({ component: RouteComponent })

function RouteComponent() {
  const { alertId } = Route.useParams()
  return <AlertPage alertId={alertId} />
}
