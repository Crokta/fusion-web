import type { Role } from '@/api/types'

/**
 * The pure half of the active-role switch (ADR 0008). Keycloak puts active_role in the access
 * token from exactly one requested client scope: `role:<role>`, which it applies only to a user
 * who holds that role, or `role:default`, the user's default role. Switching is asking for a new
 * token with a different one of those scopes; nothing here decides a role, it only reads what
 * Keycloak granted.
 */

export const ALL_ROLES: Role[] = [
  'analyst',
  'supervisor',
  'reviewer',
  'centre_lead',
  'evidence_officer',
  'leadership',
  'admin',
]

export const BASE_SCOPE = 'openid profile email'
export const ROLE_SCOPE_PREFIX = 'role:'
export const DEFAULT_ROLE_SCOPE = 'role:default'

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ALL_ROLES as string[]).includes(value)

/** The scope to request: the base scope plus exactly one role scope. */
export function scopeFor(role?: Role | null): string {
  return `${BASE_SCOPE} ${role ? `${ROLE_SCOPE_PREFIX}${role}` : DEFAULT_ROLE_SCOPE}`
}

/** The claims of a JWT, without verifying it: the services verify, the screens only display. */
export function jwtClaims(token: string | null | undefined): Record<string, unknown> {
  const payload = token?.split('.')[1]
  if (!payload) return {}
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export interface TokenRoles {
  /** The Fusion realm roles the user holds, from the token's `roles` (or realm_access). */
  roles: Role[]
  /** The token's active_role, the role every service checks; only if the user holds it. */
  activeRole?: Role
}

/** What an access token says about roles, read the way Fusion.Auth reads it. */
export function tokenRoles(accessToken: string | null | undefined): TokenRoles {
  const claims = jwtClaims(accessToken)
  const listed = Array.isArray(claims.roles)
    ? claims.roles
    : ((claims.realm_access as { roles?: unknown } | undefined)?.roles ?? [])
  const roles = (Array.isArray(listed) ? listed : []).filter(isRole)
  // PermissionHandler refuses an active_role the user does not hold; the screens agree with it.
  const active = isRole(claims.active_role) && roles.includes(claims.active_role)
  return { roles, activeRole: active ? (claims.active_role as Role) : undefined }
}

export type SwitchCheck =
  { ok: true } | { ok: false; reason: 'not_held' | 'already_active' | 'unknown_role' }

/** Whether to ask Keycloak for `role` at all. Keycloak refuses anyway; this saves the trip. */
export function checkSwitch(role: string, current: TokenRoles): SwitchCheck {
  if (!isRole(role)) return { ok: false, reason: 'unknown_role' }
  if (!current.roles.includes(role)) return { ok: false, reason: 'not_held' }
  if (current.activeRole === role) return { ok: false, reason: 'already_active' }
  return { ok: true }
}

/** Whether Keycloak granted the role that was asked for, judged from the new token alone. */
export function switchGranted(requested: Role, accessToken: string | null | undefined): boolean {
  return tokenRoles(accessToken).activeRole === requested
}

/**
 * Whether a token should be renewed before it is sent. Timers in a background tab or a sleeping
 * laptop fire late, so a request can find the token already expired; renew it first rather
 * than send it and get a 401.
 */
export function needsRenewal(
  expiresAt: number | undefined,
  nowSeconds: number,
  skewSeconds = 30,
): boolean {
  return expiresAt === undefined || expiresAt - skewSeconds <= nowSeconds
}

/** The marker on the silent re-authorisation's redirect, so the hidden frame knows itself. */
export const SILENT_MARKER = 'silent-signin'

/** True inside the hidden frame Keycloak redirects to after a prompt=none re-authorisation. */
export function isSilentCallback(href: string, framed: boolean): boolean {
  if (!framed) return false
  const params = new URL(href).searchParams
  return params.has(SILENT_MARKER) && params.has('state')
}
