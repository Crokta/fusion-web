import type { FusionApi } from '../contract'
import type { ProblemCode } from '../problem'
import type {
  Brief,
  ReviewHistoryEntry,
  Role,
  WallContentKey,
  WallLayoutPublication,
  WallRendererToken,
  WallState,
  WallZone,
  WallZoneContent,
} from '../types'

/**
 * The wall renderer and review history for the mock gateway (E34, ADR 0019), with reporting's
 * rules: tokens are wall.operate; a display reads the published layout's zones with a live token,
 * a signed-in caller with wall.view; Visitor Mode mutes what is not released-safe; a zone shows
 * only released briefs, as released.
 */
interface Deps {
  delay: <T>(value: () => T) => Promise<T>
  refuse: (code: ProblemCode, title: string, status?: number) => never
  requireRole: (roles: Role[], action: string) => void
  audit: (outcome: 'allowed' | 'refused', action: string, target: string) => void
  me: () => { id: string; name: string }
  briefs: () => Brief[]
  wall: () => WallState
  layoutPublications: () => WallLayoutPublication[]
  /** Decisions made in this session, per case, newest first. */
  history: (caseId: string) => ReviewHistoryEntry[]
}

type DisplayApi = Pick<
  FusionApi,
  | 'reviewHistory'
  | 'wallRendererTokens'
  | 'issueWallRendererToken'
  | 'revokeWallRendererToken'
  | 'wallZones'
  | 'wallZoneContent'
>

const OPERATE: Role[] = ['supervisor', 'centre_lead']
const VIEW: Role[] = ['analyst', 'supervisor', 'reviewer', 'centre_lead', 'leadership']
const REVIEW: Role[] = ['reviewer', 'supervisor', 'centre_lead']
const RELEASED_SAFE: WallContentKey[] = ['news', 'map-ng', 'map-region', 'events', 'system']

/** Reporting's zones: every group, and every screen outside one, in the order of their first cell. */
export function zonesOf(
  p: Pick<WallLayoutPublication, 'screens' | 'groups'>,
): Omit<WallZone, 'muted'>[] {
  const grouped = new Set(p.groups.flatMap((g) => g.cells))
  const zones = [
    ...p.groups.map((g) => ({
      id: `grp-${[...g.cells].sort((a, b) => a - b).join('-')}`,
      cells: [...g.cells].sort((a, b) => a - b),
      content: g.content,
      contextRef: g.cells.map((c) => p.screens[c]?.contextRef).find(Boolean),
    })),
    ...p.screens
      .filter((s) => !grouped.has(s.index))
      .map((s) => ({
        id: `screen-${s.index}`,
        cells: [s.index],
        content: s.content,
        contextRef: s.contextRef,
      })),
  ]
  return zones.sort((a, b) => Math.min(...a.cells) - Math.min(...b.cells))
}

export function displayMocks({
  delay,
  refuse,
  requireRole,
  audit,
  me,
  briefs,
  wall,
  layoutPublications,
  history,
}: Deps): DisplayApi {
  const tokens: (WallRendererToken & { secret: string })[] = []

  const strip = ({ secret: _secret, ...t }: WallRendererToken & { secret: string }) => t

  const access = (token?: string) => {
    if (!token) return requireRole(VIEW, 'Reading the wall')
    const t = tokens.find((x) => x.secret === token)
    if (!t || t.revokedAt)
      return refuse(
        'renderer_token_invalid',
        t
          ? "This display's token has been revoked. Ask a wall operator for a new one."
          : "This display's token is not recognised. Ask a wall operator for a new one.",
        401,
      )
    t.lastSeenAt = new Date().toISOString()
  }

  const published = () => layoutPublications().find((p) => p.delivered)
  const visitorMode = () => (published()?.visitorMode ?? false) || wall().visitorMode
  const zones = (): WallZone[] => {
    const p = published()
    if (!p) return []
    const muted = visitorMode()
    return zonesOf(p).map((z) => ({ ...z, muted: muted && !RELEASED_SAFE.includes(z.content) }))
  }

  return {
    reviewHistory: (caseId) =>
      delay(() => {
        requireRole(REVIEW, 'Reading review history')
        return history(caseId)
      }),

    wallRendererTokens: () =>
      delay(() => {
        requireRole(OPERATE, 'Managing wall display tokens')
        return tokens.map(strip)
      }),
    issueWallRendererToken: (label) =>
      delay(() => {
        requireRole(OPERATE, 'Issuing a wall display token')
        if (!label.trim()) refuse('validation_failed', 'Say which display the token is for.', 400)
        const id = crypto.randomUUID()
        const secret = `wrt_${crypto.randomUUID().replaceAll('-', '')}`
        const t = {
          id,
          ref: `WT-${id.replaceAll('-', '').slice(-6).toUpperCase()}`,
          label: label.trim(),
          issuedBy: me().name,
          issuedAt: new Date().toISOString(),
          secret,
        }
        tokens.unshift(t)
        audit('allowed', 'wall.renderer_token.issue', t.ref)
        return { token: strip(t), secret }
      }),
    revokeWallRendererToken: (id) =>
      delay(() => {
        requireRole(OPERATE, 'Revoking a wall display token')
        const t = tokens.find((x) => x.id === id)
        if (!t) return refuse('not_found', 'No such renderer token.', 404)
        if (t.revokedAt) return refuse('token_revoked', 'This token has already been revoked.', 409)
        t.revokedAt = new Date().toISOString()
        t.revokedBy = me().name
        audit('allowed', 'wall.renderer_token.revoke', t.ref)
        return strip(t)
      }),

    wallZones: (token) =>
      delay(() => {
        access(token)
        const p = published()
        return {
          published: p
            ? {
                id: p.id,
                ref: p.ref,
                revision: p.revision,
                preset: p.preset,
                publishedBy: p.publishedBy,
                publishedAt: p.publishedAt,
              }
            : undefined,
          visitorMode: visitorMode(),
          rows: 4,
          cols: 4,
          zones: zones(),
          at: new Date().toISOString(),
        }
      }),
    wallZoneContent: (zoneId, token) =>
      delay((): WallZoneContent => {
        access(token)
        const zone = zones().find((z) => z.id === zoneId)
        if (!zone)
          return refuse('not_found', `The wall's published layout has no zone ${zoneId}.`, 404)
        const at = new Date().toISOString()
        if (zone.muted) return { zone, source: 'muted', items: [], counts: [], at }
        if (zone.content === 'cases') {
          // The version recipients hold, never a correction being drafted.
          const released = briefs()
            .map((b) => ({ b, v: [...b.versions].reverse().find((v) => v.releasedAt) }))
            .filter((x) => x.v)
            .slice(0, 8)
          return {
            zone,
            source: 'reporting',
            items: released.map(({ b, v }) => ({
              kind: 'brief',
              ref: `v${v!.number}`,
              title: b.status === 'released' ? b.title : `Brief, version ${v!.number}`,
              detail: v!.correctsVersion ? `Correction of v${v!.correctsVersion}` : undefined,
              at: v!.releasedAt,
            })),
            counts: [{ key: 'released', label: 'Briefs released', count: released.length }],
            at,
          }
        }
        return { zone, source: 'not_connected', items: [], counts: [], at }
      }),
  }
}
