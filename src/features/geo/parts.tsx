import type { LocationOrigin, LocationPrecision, Place, PlaceKind } from '@/api/types'
import { Badge } from '@/components/ui'

/** Layer colours keep one meaning: cyan is a case, violet a story. Estimated points are hollow. */
export const LAYER_COLOUR = { cases: '#45d7f2', stories: '#a99bff' } as const

/** Locations are always marked confirmed or estimated (architecture §7.1). */
export function PrecisionBadge({ precision }: { precision: LocationPrecision }) {
  return precision === 'confirmed' ? (
    <Badge tone="green" dot>
      Confirmed
    </Badge>
  ) : (
    <Badge tone="amber" dot>
      Estimated
    </Badge>
  )
}

export function OriginBadge({ origin }: { origin: LocationOrigin }) {
  return origin === 'extracted' ? <Badge tone="violet">From the text</Badge> : null
}

/** What each kind is called; in Nigeria admin1 is a state and admin2 an LGA. */
export function kindLabel(kind: PlaceKind, country: string): string {
  const ng = country === 'NG'
  switch (kind) {
    case 'country':
      return 'Country'
    case 'admin1':
      return ng ? 'State' : 'Region'
    case 'admin2':
      return ng ? 'LGA' : 'District'
    case 'place':
      return 'Town or village'
    case 'feature':
      return 'Feature'
  }
}

/** "Maiduguri · Maiduguri LGA, Borno State" */
export function placeContext(p: Place): string {
  const lga = p.admin2Name && (p.country === 'NG' ? `${p.admin2Name} LGA` : p.admin2Name)
  const parents = [lga, p.admin1Name].filter(Boolean)
  const where = p.country === 'NG' ? parents.join(', ') : [...parents, p.country].join(', ')
  return where || (p.country === 'NG' ? 'Nigeria' : p.country)
}

export const formatPoint = (lat: number, lon: number) => `${lat.toFixed(4)}, ${lon.toFixed(4)}`
