import { createFileRoute } from '@tanstack/react-router'
import { NameSearchPage } from '@/features/names/NameSearchPage'

export const Route = createFileRoute('/names/$searchId')({ component: RouteComponent })

function RouteComponent() {
  const { searchId } = Route.useParams()
  return <NameSearchPage key={searchId} searchId={searchId} />
}
