import { createFileRoute } from '@tanstack/react-router'
import { CaseDetailPage } from '@/features/cases/CaseDetailPage'

export const Route = createFileRoute('/cases/$caseId')({ component: RouteComponent })

function RouteComponent() {
  const { caseId } = Route.useParams()
  return <CaseDetailPage caseId={caseId} />
}
