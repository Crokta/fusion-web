import { describe, expect, it } from 'vitest'
import {
  checkSwitch,
  isSilentCallback,
  jwtClaims,
  needsRenewal,
  scopeFor,
  switchGranted,
  tokenRoles,
} from '@/auth/activeRole'

/** An unsigned JWT with these claims: the screens only read tokens, the services verify them. */
function jwt(claims: Record<string, unknown>): string {
  const b64url = (s: string) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(s)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  return `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify(claims))}.`
}

const lead = (activeRole?: string) =>
  jwt({
    sub: 'u-1',
    name: 'Zoë Ødegård', // non-ASCII survives the base64url decode
    roles: [
      'default-roles-fusion',
      'offline_access',
      'centre_lead',
      'supervisor',
      'reviewer',
      'analyst',
    ],
    ...(activeRole ? { active_role: activeRole } : {}),
  })

describe('active-role scopes (ADR 0008)', () => {
  it('asks for exactly one role scope, or the default role', () => {
    expect(scopeFor('reviewer')).toBe('openid profile email role:reviewer')
    expect(scopeFor(null)).toBe('openid profile email role:default')
    expect(
      scopeFor()
        .split(' ')
        .filter((s) => s.startsWith('role:')),
    ).toHaveLength(1)
  })
})

describe('reading the token', () => {
  it('decodes base64url claims, including non-ASCII text', () => {
    expect(jwtClaims(lead('analyst'))).toMatchObject({ sub: 'u-1', name: 'Zoë Ødegård' })
  })

  it('returns no claims for something that is not a JWT', () => {
    expect(jwtClaims(undefined)).toEqual({})
    expect(jwtClaims('opaque')).toEqual({})
    expect(jwtClaims('a.!!!.c')).toEqual({})
  })

  it('keeps Fusion roles only and reads active_role', () => {
    expect(tokenRoles(lead('supervisor'))).toEqual({
      roles: ['centre_lead', 'supervisor', 'reviewer', 'analyst'],
      activeRole: 'supervisor',
    })
  })

  it('falls back to realm_access when there is no roles claim', () => {
    const t = jwt({ realm_access: { roles: ['analyst'] }, active_role: 'analyst' })
    expect(tokenRoles(t)).toEqual({ roles: ['analyst'], activeRole: 'analyst' })
  })

  it('ignores an active_role the user does not hold, as PermissionHandler does', () => {
    const t = jwt({ roles: ['analyst'], active_role: 'admin' })
    expect(tokenRoles(t).activeRole).toBeUndefined()
  })

  it('has no active role when Keycloak granted no role scope', () => {
    expect(tokenRoles(lead()).activeRole).toBeUndefined()
  })
})

describe('switching', () => {
  const current = tokenRoles(lead('centre_lead'))

  it('allows a held role other than the current one', () => {
    expect(checkSwitch('analyst', current)).toEqual({ ok: true })
  })

  it('refuses, before asking Keycloak, a role the user does not hold', () => {
    expect(checkSwitch('admin', current)).toEqual({ ok: false, reason: 'not_held' })
    expect(checkSwitch('superuser', current)).toEqual({ ok: false, reason: 'unknown_role' })
  })

  it('does nothing for the role already active', () => {
    expect(checkSwitch('centre_lead', current)).toEqual({ ok: false, reason: 'already_active' })
  })

  it('judges the outcome from the new token only', () => {
    expect(switchGranted('analyst', lead('analyst'))).toBe(true)
    // Keycloak drops a role scope the user does not hold: the token comes back without it.
    expect(switchGranted('analyst', lead())).toBe(false)
    expect(switchGranted('analyst', lead('centre_lead'))).toBe(false)
  })
})

describe('renewal', () => {
  it('renews a token that has expired or is within the skew of expiring', () => {
    expect(needsRenewal(1000, 1001)).toBe(true)
    expect(needsRenewal(1000, 975)).toBe(true)
    expect(needsRenewal(1000, 900)).toBe(false)
    expect(needsRenewal(undefined, 0)).toBe(true)
  })
})

describe('the silent re-authorisation frame', () => {
  it('is recognised only inside a frame, on the marked redirect', () => {
    const href = 'http://localhost:5173/?silent-signin&code=abc&state=xyz'
    expect(isSilentCallback(href, true)).toBe(true)
    expect(isSilentCallback(href, false)).toBe(false)
    expect(isSilentCallback('http://localhost:5173/?code=abc&state=xyz', true)).toBe(false)
    expect(
      isSilentCallback('http://localhost:5173/?silent-signin&error=login_required&state=x', true),
    ).toBe(true)
  })
})
