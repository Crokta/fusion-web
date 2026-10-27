import { createFileRoute } from '@tanstack/react-router'
import { SearchExperience } from '@/features/search/FusionSearch'

export const Route = createFileRoute('/search')({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search.q === 'string' && search.q ? { q: search.q } : {},
  component: SearchRoute,
})

function SearchRoute() {
  const { q } = Route.useSearch()
  return (
    <div className="h-full">
      <SearchExperience key={q ?? ''} initialQuery={q ?? ''} autoFocus />
    </div>
  )
}
