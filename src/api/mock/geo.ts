import type { FusionApi } from '../contract'
import type { ProblemCode } from '../problem'
import type {
  GeoLocation,
  LocationSubject,
  MapArea,
  MapBoundaries,
  MapFeature,
  MapLayer,
  MapLayerKey,
  MapQuery,
  Place,
  Role,
} from '../types'
import { ago, caseSummaries, places as townPoints, storyGroups } from './fixtures'

/**
 * Geo for the mock gateway (E32, ADR 0018), with search's rules: a layer is read with the owner's
 * permission (cases case.read, stories feed.read) and placed with case.write or triage.work. The
 * gazetteer here is Nigeria's 36 states and the FCT, plus the towns the fixtures use; search
 * ships GeoNames' full Nigerian and West African extract.
 */
interface Deps {
  delay: <T>(value: () => T) => Promise<T>
  refuse: (code: ProblemCode, title: string, status?: number) => never
  audit: (outcome: 'allowed' | 'refused', action: string, target: string) => void
  role: () => Role
  me: () => { id: string; name: string }
}

type GeoApi = Pick<
  FusionApi,
  | 'places'
  | 'place'
  | 'nearestPlace'
  | 'gazetteerDatasets'
  | 'locations'
  | 'attachLocation'
  | 'confirmLocation'
  | 'removeLocation'
  | 'mapLayers'
  | 'mapFeatures'
  | 'mapAreas'
  | 'mapBoundaries'
>

const FEED_READ: Role[] = ['analyst', 'supervisor', 'reviewer', 'centre_lead', 'leadership']
const CASE_READ: Role[] = ['analyst', 'supervisor', 'reviewer', 'centre_lead', 'evidence_officer']
const SEARCH_RUN: Role[] = ['analyst', 'supervisor', 'reviewer', 'centre_lead']
const PLACE: Role[] = ['analyst', 'supervisor'] // case.write and triage.work hold the same roles

const readable = (r: Role, s: LocationSubject) => (s === 'case' ? CASE_READ : FEED_READ).includes(r)
const LAYERS: { key: MapLayerKey; label: string; subjectType: LocationSubject }[] = [
  { key: 'cases', label: 'Cases', subjectType: 'case' },
  { key: 'stories', label: 'Stories', subjectType: 'story' },
]

const STATES: [string, number, number][] = [
  ['Abia', 5.45, 7.52],
  ['Adamawa', 9.33, 12.4],
  ['Akwa Ibom', 5.0, 7.85],
  ['Anambra', 6.22, 6.94],
  ['Bauchi', 10.31, 9.84],
  ['Bayelsa', 4.77, 6.07],
  ['Benue', 7.34, 8.74],
  ['Borno', 11.5, 13.0],
  ['Cross River', 5.87, 8.6],
  ['Delta', 5.53, 5.9],
  ['Ebonyi', 6.26, 8.01],
  ['Edo', 6.63, 5.93],
  ['Ekiti', 7.72, 5.31],
  ['Enugu', 6.54, 7.44],
  ['Federal Capital Territory', 8.89, 7.19],
  ['Gombe', 10.36, 11.19],
  ['Imo', 5.57, 7.06],
  ['Jigawa', 12.23, 9.56],
  ['Kaduna', 10.38, 7.71],
  ['Kano', 11.75, 8.52],
  ['Katsina', 12.37, 7.61],
  ['Kebbi', 11.5, 4.2],
  ['Kogi', 7.73, 6.69],
  ['Kwara', 8.97, 4.39],
  ['Lagos', 6.53, 3.58],
  ['Nasarawa', 8.54, 8.32],
  ['Niger', 9.93, 5.6],
  ['Ogun', 6.99, 3.47],
  ['Ondo', 7.1, 5.1],
  ['Osun', 7.56, 4.52],
  ['Oyo', 8.12, 3.42],
  ['Plateau', 9.22, 9.52],
  ['Rivers', 4.84, 6.92],
  ['Sokoto', 13.06, 5.32],
  ['Taraba', 7.99, 10.77],
  ['Yobe', 12.29, 11.44],
  ['Zamfara', 12.12, 6.22],
]

/** The fixtures' towns and the state each lies in. Zamfara and Adamawa are states already. */
const TOWN_STATE: Record<string, string> = {
  Abuja: 'Federal Capital Territory',
  Kaduna: 'Kaduna',
  Kano: 'Kano',
  Lagos: 'Lagos',
  Maiduguri: 'Borno',
  'Port Harcourt': 'Rivers',
  Jos: 'Plateau',
  Sokoto: 'Sokoto',
  Enugu: 'Enugu',
  Ibadan: 'Oyo',
  Minna: 'Niger',
  Katsina: 'Katsina',
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, '-')
const stateId = (name: string) => `mock:state-${slug(name)}`

const gazetteer: Place[] = [
  ...STATES.map(([name, lat, lon]): Place => {
    const display = name === 'Federal Capital Territory' ? name : `${name} State`
    return {
      id: stateId(name),
      name: display,
      kind: 'admin1',
      featureCode: 'ADM1',
      country: 'NG',
      lat,
      lon,
      population: 0,
      aliases: display === name ? ['FCT', 'Abuja FCT'] : [name],
    }
  }),
  ...Object.entries(TOWN_STATE).map(([town, state]): Place => {
    const p = townPoints[town] ?? { lat: 0, lon: 0 }
    return {
      id: `mock:town-${slug(town)}`,
      name: town,
      kind: 'place',
      featureCode: 'PPLA',
      country: 'NG',
      admin1Id: stateId(state),
      admin1Name: state === 'Federal Capital Territory' ? state : `${state} State`,
      lat: p.lat,
      lon: p.lon,
      population: 1_000_000,
      aliases: [],
    }
  }),
]

/** Where a fixture's free-text place lands: the town if the gazetteer has it, else the state. */
function placeFor(name: string): Place | undefined {
  return (
    gazetteer.find((p) => p.kind === 'place' && p.name === name) ??
    gazetteer.find((p) => p.kind === 'admin1' && p.aliases.includes(name))
  )
}

const distanceKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot((a.lat - b.lat) * 111, (a.lon - b.lon) * 111 * Math.cos((a.lat * Math.PI) / 180))

export function geoMocks(d: Deps): GeoApi {
  const store: GeoLocation[] = []
  let n = 0
  const add = (l: Omit<GeoLocation, 'id' | 'version' | 'addedAt'> & { addedAt?: string }) => {
    const row: GeoLocation = { ...l, id: `loc-${++n}`, version: 1, addedAt: l.addedAt ?? ago(5) }
    store.push(row)
    return row
  }

  // Every fixture case and story group already on the map, so the screens have something to show.
  caseSummaries.forEach((c, i) => {
    const p = c.place ? placeFor(c.place) : undefined
    if (!p) return
    add({
      subjectType: 'case',
      subjectId: c.id,
      caseId: c.id,
      subjectTitle: `${c.ref} · ${c.title}`,
      subjectAt: c.updatedAt,
      placeId: p.id,
      admin1Id: p.kind === 'admin1' ? p.id : p.admin1Id,
      label: p.name,
      lat: p.lat,
      lon: p.lon,
      precision: i % 3 === 2 ? 'estimated' : 'confirmed',
      origin: 'manual',
      addedBy: 'Funmi Adeyemi',
      confirmedBy: i % 3 === 2 ? undefined : 'Funmi Adeyemi',
    })
  })
  storyGroups.forEach((g) => {
    const p = g.place ? placeFor(g.place) : undefined
    const lead = g.stories[0]
    if (!p || !lead) return
    add({
      subjectType: 'story',
      subjectId: lead.id,
      subjectTitle: lead.headline,
      subjectAt: lead.publishedAt,
      placeId: p.id,
      admin1Id: p.kind === 'admin1' ? p.id : p.admin1Id,
      label: p.name,
      lat: p.lat + 0.08,
      lon: p.lon + 0.08,
      precision: 'estimated',
      origin: 'extracted',
      addedBy: 'Place extraction',
    })
  })

  const requireRead = (roles: Role[], action: string) => {
    if (!roles.includes(d.role())) {
      d.audit('refused', action, 'geo')
      d.refuse('capability_not_authorised', 'Your active role cannot read the map.')
    }
  }
  const requirePlace = (subject: LocationSubject, action: string, target: string) => {
    if (!PLACE.includes(d.role())) {
      d.audit('refused', action, target)
      d.refuse(
        'capability_not_authorised',
        `Your active role cannot place a ${subject} on the map.`,
      )
    }
  }
  const mapReadRoles = [...new Set([...FEED_READ, ...CASE_READ, ...SEARCH_RUN])]
  const live = () => store.filter((l) => !('removed' in l))

  const subjects = (q: Pick<MapQuery, 'layers'>, action: string) => {
    requireRead(mapReadRoles, action)
    const asked = q.layers?.length ? q.layers : LAYERS.map((l) => l.key)
    const types = asked.map((k) => LAYERS.find((l) => l.key === k)!.subjectType)
    if (types.some((t) => !readable(d.role(), t))) {
      d.audit('refused', action, asked.join(','))
      d.refuse('capability_not_authorised', 'Your active role cannot read one of those layers.')
    }
    return q.layers?.length ? types : types.filter((t) => readable(d.role(), t))
  }
  const inWindow = (l: GeoLocation, q: Omit<MapQuery, 'bbox'>) =>
    (!q.from || l.subjectAt >= q.from) &&
    (!q.to || l.subjectAt <= q.to) &&
    (!q.precision || l.precision === q.precision)

  const change = (id: string, version: number, action: string, fn: (l: GeoLocation) => void) =>
    d.delay(() => {
      const l = live().find((x) => x.id === id)
      if (!l) return d.refuse('not_found', 'No such location.', 404)
      requirePlace(l.subjectType, action, id)
      if (l.version !== version)
        return d.refuse('precondition_failed', 'This changed since you loaded it.', 412)
      fn(l)
      l.version++
      d.audit('allowed', action, id)
      return { ...l }
    })

  return {
    places: (q, p) =>
      d.delay(() => {
        requireRead(mapReadRoles, 'geo.gazetteer.read')
        const key = q.trim().toLowerCase()
        if (key.length < 2) return []
        return gazetteer
          .filter((g) => !p?.kind || g.kind === p.kind)
          .filter((g) => [g.name, ...g.aliases].some((n) => n.toLowerCase().includes(key)))
          .slice(0, 20)
      }),
    place: (id) =>
      d.delay(
        () => gazetteer.find((g) => g.id === id) ?? d.refuse('not_found', 'No such place.', 404),
      ),
    nearestPlace: (lat, lon) =>
      d.delay(() => {
        const towns = gazetteer.filter((g) => g.kind === 'place')
        const best = towns.sort(
          (a, b) => distanceKm(a, { lat, lon }) - distanceKm(b, { lat, lon }),
        )[0]
        return best && distanceKm(best, { lat, lon }) <= 30 ? best : null
      }),
    gazetteerDatasets: () =>
      d.delay(() => [
        {
          key: 'mock-gazetteer',
          source: 'Mock gateway: Nigerian states and the fixtures’ towns',
          licence: 'CC BY 4.0',
          attribution: 'Place names and coordinates © GeoNames (geonames.org), CC BY 4.0',
          url: 'https://www.geonames.org',
          placeCount: gazetteer.length,
          loadedAt: ago(60 * 24),
        },
      ]),
    locations: (subjectType, subjectId) =>
      d.delay(() => {
        if (!readable(d.role(), subjectType)) {
          d.audit('refused', 'geo.location.list', subjectId)
          return d.refuse(
            'capability_not_authorised',
            `Your active role cannot read a ${subjectType}'s locations.`,
          )
        }
        return live().filter((l) => l.subjectType === subjectType && l.subjectId === subjectId)
      }),
    attachLocation: (input) =>
      d.delay(() => {
        requirePlace(input.subjectType, 'geo.location.attach', input.subjectId)
        const place = input.placeId ? gazetteer.find((g) => g.id === input.placeId) : undefined
        if (input.placeId && !place) return d.refuse('validation_failed', 'No such place.', 400)
        if (place && live().some((l) => l.subjectId === input.subjectId && l.placeId === place.id))
          return d.refuse('conflict', `${place.name} is already on this ${input.subjectType}.`, 409)
        const lat = place?.lat ?? input.lat
        const lon = place?.lon ?? input.lon
        const label = (input.label?.trim() || place?.name) ?? ''
        if (lat === undefined || lon === undefined || !label)
          return d.refuse('validation_failed', 'Choose a place, or give a point and a name.', 400)
        const near = place
          ? undefined
          : gazetteer.find((g) => g.kind === 'place' && distanceKm(g, { lat, lon }) <= 30)
        const c = caseSummaries.find((x) => x.id === input.subjectId)
        const story = storyGroups.flatMap((g) => g.stories).find((s) => s.id === input.subjectId)
        const row = add({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          caseId: input.subjectType === 'case' ? input.subjectId : undefined,
          subjectTitle: c ? `${c.ref} · ${c.title}` : (story?.headline ?? input.subjectId),
          subjectAt: c?.updatedAt ?? story?.publishedAt ?? new Date().toISOString(),
          placeId: place?.id,
          admin1Id: place ? (place.kind === 'admin1' ? place.id : place.admin1Id) : near?.admin1Id,
          label,
          lat,
          lon,
          precision: input.precision,
          origin: 'manual',
          note: input.note?.trim() || undefined,
          addedBy: d.me().name,
          addedAt: new Date().toISOString(),
          confirmedBy: input.precision === 'confirmed' ? d.me().name : undefined,
          confirmedAt: input.precision === 'confirmed' ? new Date().toISOString() : undefined,
        })
        d.audit('allowed', 'geo.location.attach', row.id)
        return { ...row }
      }),
    confirmLocation: (id, version) =>
      change(id, version, 'geo.location.confirm', (l) => {
        if (l.precision === 'confirmed')
          d.refuse('conflict', 'This location is already confirmed.', 409)
        l.precision = 'confirmed'
        l.confirmedBy = d.me().name
        l.confirmedAt = new Date().toISOString()
      }),
    removeLocation: (id, version) =>
      change(id, version, 'geo.location.remove', (l) => {
        Object.assign(l, { removed: true })
      }),
    mapLayers: () =>
      d.delay((): MapLayer[] => {
        requireRead(mapReadRoles, 'geo.layers.read')
        return LAYERS.filter((l) => readable(d.role(), l.subjectType)).map((l) => {
          const rows = live().filter((x) => x.subjectType === l.subjectType)
          return {
            ...l,
            confirmed: rows.filter((x) => x.precision === 'confirmed').length,
            estimated: rows.filter((x) => x.precision === 'estimated').length,
          }
        })
      }),
    mapFeatures: (q) =>
      d.delay(() => {
        const types = subjects(q, 'geo.events.read')
        const [w, s, e, nth] = q.bbox ?? [-180, -90, 180, 90]
        const features = live()
          .filter((l) => types.includes(l.subjectType) && inWindow(l, q))
          .filter((l) => l.lon >= w && l.lon <= e && l.lat >= s && l.lat <= nth)
          .map((l): MapFeature => ({
            id: l.id,
            layer: l.subjectType === 'case' ? 'cases' : 'stories',
            subjectType: l.subjectType,
            subjectId: l.subjectId,
            caseId: l.caseId,
            title: l.subjectTitle,
            label: l.label,
            placeId: l.placeId,
            precision: l.precision,
            origin: l.origin,
            at: l.subjectAt,
            lat: l.lat,
            lon: l.lon,
          }))
        return { features, truncated: false }
      }),
    mapAreas: (q, level = 'state') =>
      d.delay(() => {
        const types = subjects(q, 'geo.areas.read')
        // The mock has no LGA polygons (ADR 0022 ships them in search), so nothing counts by LGA here.
        if (level === 'lga') return []
        const byState = new Map<string, MapArea>()
        for (const l of live().filter((x) => types.includes(x.subjectType) && inWindow(x, q))) {
          const s = gazetteer.find((g) => g.id === l.admin1Id)
          if (!s) continue
          const a = byState.get(s.id) ?? {
            placeId: s.id,
            name: s.name,
            country: s.country,
            lat: s.lat,
            lon: s.lon,
            cases: 0,
            stories: 0,
            estimated: 0,
          }
          if (l.subjectType === 'case') a.cases++
          else a.stories++
          if (l.precision === 'estimated') a.estimated++
          byState.set(s.id, a)
        }
        return [...byState.values()].sort((a, b) => b.cases + b.stories - (a.cases + a.stories))
      }),
    // No polygons in the mock: the map falls back to circles sized by count, as without an edition.
    mapBoundaries: () =>
      d.delay((): MapBoundaries => {
        requireRead(mapReadRoles, 'geo.boundaries.read')
        return { type: 'FeatureCollection', features: [] }
      }),
  }
}
