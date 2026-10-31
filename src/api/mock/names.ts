import type { FusionApi } from '../contract'
import type { ProblemCode } from '../problem'
import type {
  NameBucket,
  NameCluster,
  NameMention,
  NameReportData,
  NameSearch,
  Role,
} from '../types'
import { ago } from './fixtures'

/**
 * Name-of-interest searches for the mock gateway (E30, ADR 0013), with the same rules as search:
 * asking is search.names (analyst, supervisor); a public figure's results are search.names, a
 * private individual's search.pi (centre lead) and only while pi_search is on. The mock groups
 * mentions by place; the service groups them by shared context words and shared cases.
 */
interface Deps {
  delay: <T>(value: () => T) => Promise<T>
  refuse: (code: ProblemCode, title: string, status?: number) => never
  requireRole: (roles: Role[], action: string) => void
  audit: (outcome: 'allowed' | 'refused', action: string, target: string) => void
  role: () => Role
  me: () => { id: string; name: string }
  piOn: () => boolean
}

type NamesApi = Pick<
  FusionApi,
  | 'nameSearches'
  | 'nameSearch'
  | 'startNameSearch'
  | 'nameMentions'
  | 'nameClusters'
  | 'decideNameCluster'
  | 'nameReportData'
  | 'takeNameReportData'
>

interface Stored {
  search: NameSearch
  mentions: (NameMention & { place: string })[]
  clusters: NameCluster[]
  reports: NameReportData[]
}

const NAMES_ROLES: Role[] = ['analyst', 'supervisor']

/** What the mock index holds about names: a few stories each, in two places so they cluster. */
const corpus: { title: string; snippet: string; place: string; source: string; at: string }[] = [
  {
    title: 'FCT transport advisory issued after Kubwa crash',
    snippet:
      'Spokesperson <mark>Amina Bello</mark> said the Kubwa expressway would reopen by noon.',
    place: 'Abuja',
    source: 'punchng.com',
    at: ago(300),
  },
  {
    title: 'Abuja ministry briefs press on road closures',
    snippet:
      'Ministry spokesperson <mark>Amina Bello</mark> listed the Abuja roads closed for repairs.',
    place: 'Abuja',
    source: 'premiumtimesng.com',
    at: ago(1500),
  },
  {
    title: 'Kano trader wins regional business award',
    snippet: 'Textile trader <mark>Amina Bello</mark> of Kantin Kwari market received the award.',
    place: 'Kano',
    source: 'dailytrust.com',
    at: ago(4300),
  },
]

export function nameMocks(d: Deps): NamesApi {
  const store = new Map<string, Stored>()

  // One finished public search, so the screen has something to show at first.
  const seed = run(
    {
      id: 'ns-0001',
      name: 'Amina Bello',
      kind: 'public',
      requestedBy: 'Funmilayo Adeleke',
      requestedAt: ago(240),
      status: 'created',
      resultCount: 0,
      etag: '"v0"',
    },
    ago(239),
  )
  store.set(seed.search.id, seed)

  function run(search: NameSearch, at: string): Stored {
    const words = search.name.toLowerCase()
    const found = corpus.filter((c) => `${c.title} ${c.snippet}`.toLowerCase().includes(words))
    const places = [...new Set(found.map((f) => f.place))]
    const clusters: NameCluster[] = places.map((place, i) => {
      const members = found.filter((f) => f.place === place)
      return {
        id: `${search.id}-c${i + 1}`,
        terms: [place.toLowerCase(), ...members[0]!.snippet.toLowerCase().split(' ').slice(0, 2)],
        mentionCount: members.length,
        firstSeen: members.map((m) => m.at).sort()[0]!,
        lastSeen: members
          .map((m) => m.at)
          .sort()
          .at(-1)!,
        status: 'suggested',
      }
    })
    const mentions = found.map((f, i) => ({
      id: `${search.id}-m${i + 1}`,
      documentType: 'story',
      documentId: `story-${i + 1}`,
      title: f.title,
      at: f.at,
      source: f.source,
      snippet: f.snippet,
      place: f.place,
      clusterId: clusters[places.indexOf(f.place)]!.id,
    }))
    return {
      search: {
        ...search,
        status: 'completed',
        resultCount: found.length,
        completedAt: at,
        etag: '"v1"',
      },
      mentions,
      clusters,
      reports: [],
    }
  }

  function readable(id: string, action: string): Stored {
    const s = store.get(id)
    if (!s) d.refuse('not_found', 'No such name search.', 404)
    const pi = s.search.kind === 'private_individual'
    const role = d.role()
    if (!pi && !NAMES_ROLES.includes(role)) {
      d.audit('refused', action, id)
      d.refuse('capability_not_authorised', 'Your active role cannot read name-search results.')
    }
    if (pi && role !== 'centre_lead') {
      d.audit('refused', action, id)
      d.refuse(
        'capability_not_authorised',
        "Only the centre lead role can read a private individual's results.",
      )
    }
    if (pi && !d.piOn()) {
      d.audit('refused', action, id)
      d.refuse(
        'capability_not_authorised',
        'Private-individual results are switched off: the pi_search policy is off.',
      )
    }
    return s
  }

  const count = (items: { key: string }[]): NameBucket[] => {
    const totals = new Map<string, number>()
    for (const i of items) totals.set(i.key, (totals.get(i.key) ?? 0) + 1)
    return [...totals].map(([key, n]) => ({ key, count: n })).sort((a, b) => b.count - a.count)
  }

  return {
    nameSearches: () =>
      d.delay(() => {
        d.requireRole(NAMES_ROLES, 'Name searches')
        d.audit('allowed', 'name_search.list', 'names')
        const items = [...store.values()]
          .map((s) => s.search)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        return { items, nextCursor: null }
      }),
    nameSearch: (id) =>
      d.delay(() => {
        // Without search.names, only a private individual's search under the PI rule.
        const s = NAMES_ROLES.includes(d.role()) ? store.get(id) : readable(id, 'name_search.read')
        if (!s) d.refuse('not_found', 'No such name search.', 404)
        d.audit('allowed', 'name_search.read', id)
        return s.search
      }),
    startNameSearch: (input) =>
      d.delay(() => {
        d.requireRole(NAMES_ROLES, 'Asking for a name search')
        if (input.kind === 'private_individual' && !d.piOn()) {
          d.audit('refused', 'name_search.create', 'names')
          d.refuse(
            'capability_not_authorised',
            'Private-individual searches are switched off: the pi_search policy is off.',
          )
        }
        const search: NameSearch = {
          id: `ns-${crypto.randomUUID().slice(0, 8)}`,
          name: input.name.trim(),
          kind: input.kind,
          caseId: input.caseId,
          reason: input.reason,
          requestedBy: d.me().name,
          requestedAt: new Date().toISOString(),
          status: input.kind === 'private_individual' ? 'awaiting_approval' : 'created',
          resultCount: 0,
          etag: '"v0"',
        }
        const stored =
          search.kind === 'public'
            ? run(search, new Date().toISOString())
            : { search, mentions: [], clusters: [], reports: [] }
        store.set(search.id, stored)
        d.audit('allowed', 'name_search.create', search.id)
        return stored.search
      }),
    nameMentions: (id, p) =>
      d.delay(() => {
        const s = readable(id, 'name_search.results.read')
        d.audit('allowed', 'name_search.results.read', id)
        const items = s.mentions
          .filter((m) => !p?.clusterId || m.clusterId === p.clusterId)
          .map(({ place: _, ...m }) => m)
        return { items, nextCursor: null }
      }),
    nameClusters: (id) =>
      d.delay(() => {
        const s = readable(id, 'name_search.clusters.read')
        d.audit('allowed', 'name_search.clusters.read', id)
        return s.clusters
      }),
    decideNameCluster: (id, clusterId, confirmed) =>
      d.delay(() => {
        const action = confirmed ? 'name_search.cluster.confirm' : 'name_search.cluster.reject'
        const s = readable(id, action)
        const c = s.clusters.find((x) => x.id === clusterId)
        if (!c) d.refuse('not_found', 'No such cluster in this search.', 404)
        c.status = confirmed ? 'confirmed' : 'rejected'
        c.decidedBy = d.me().name
        c.decidedAt = new Date().toISOString()
        d.audit('allowed', action, clusterId)
        return c
      }),
    nameReportData: (id) =>
      d.delay(() => {
        const s = readable(id, 'name_search.report_data.read')
        return s.reports[0] ?? null
      }),
    takeNameReportData: (id) =>
      d.delay(() => {
        const s = readable(id, 'name_search.report_data.create')
        if (s.search.status !== 'completed')
          d.refuse('conflict', 'Report data comes from a completed search.', 409)
        const confirmed = new Set(
          s.clusters.filter((c) => c.status === 'confirmed').map((c) => c.id),
        )
        const counted = confirmed.size
          ? s.mentions.filter((m) => m.clusterId && confirmed.has(m.clusterId))
          : s.mentions
        const included = confirmed.size
          ? s.clusters.filter((c) => confirmed.has(c.id))
          : s.clusters.filter((c) => c.status !== 'rejected')
        const days = counted.map((m) => m.at.slice(0, 10)).sort()
        const report: NameReportData = {
          id: `nr-${crypto.randomUUID().slice(0, 8)}`,
          nameSearchId: id,
          name: s.search.name,
          kind: s.search.kind,
          caseId: s.search.caseId,
          createdBy: d.me().name,
          createdAt: new Date().toISOString(),
          retentionClass: s.search.kind === 'private_individual' ? 'short' : 'standard',
          basis: confirmed.size ? 'confirmed_clusters' : 'all_results',
          mentionCount: counted.length,
          clusterCount: included.length,
          firstSeen: counted.map((m) => m.at).sort()[0],
          lastSeen: counted
            .map((m) => m.at)
            .sort()
            .at(-1),
          breakdowns: {
            type: count(counted.map((m) => ({ key: m.documentType }))),
            source: count(counted.map((m) => ({ key: m.source ?? 'unknown' }))),
            day: count(days.map((key) => ({ key }))).sort((a, b) => a.key.localeCompare(b.key)),
          },
          caseIds: [],
          clusters: included.map(({ id: cid, status, terms, mentionCount }) => ({
            id: cid,
            status,
            terms,
            mentionCount,
          })),
        }
        s.reports.unshift(report)
        d.audit('allowed', 'name_search.report_data.create', report.id)
        return report
      }),
  }
}
