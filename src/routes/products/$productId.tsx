import { createFileRoute } from '@tanstack/react-router'
import { BriefPage } from '@/features/briefs/BriefPage'

export const Route = createFileRoute('/products/$productId')({ component: RouteComponent })

function RouteComponent() {
  const { productId } = Route.useParams()
  return <BriefPage briefId={productId} />
}
