import { useQueryClient } from '@tanstack/react-query'
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts'
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { configureSession } from '@/api/session'
import type { Role } from '@/api/types'

/**
 * Authentication and the active role.
 *
 * Fusion users hold several roles but act in one at a time (Section 4.1: the gateway attaches
 * user, active role and device to every request). The role switcher changes that selection;
 * every cached query is refetched afterwards because the server filters by role.
 *
 * VITE_AUTH_DISABLED=true signs in a local dev user so the UI runs with no Keycloak.
 */

export const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true'
const ROLE_KEY = 'fusion.activeRole'
const ALL_ROLES: Role[] = [
  'analyst',
  'supervisor',
  'reviewer',
  'centre_lead',
  'evidence_officer',
  'leadership',
  'admin',
]

export interface AuthUser {
  id: string
  name: string
  email: string
  roles: Role[]
  /** The token's active_role: the role every service checks. Absent in dev mode. */
  tokenRole?: Role
}

interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'error'
  user: AuthUser | null
  activeRole: Role
  setActiveRole: (role: Role) => void
  signOut: () => void
  error?: string
  devMode: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

const DEV_USER: AuthUser = {
  id: 'u-dirk',
  name: 'Dirk Adebayo',
  email: 'dirk.adebayo@fusion.local',
  roles: ALL_ROLES,
}

let manager: UserManager | null = null
function userManager() {
  manager ??= new UserManager({
    authority: import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/fusion',
    client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'fusion-web',
    redirect_uri: `${window.location.origin}/`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code', // authorisation code + PKCE (oidc-client-ts always uses S256)
    scope: 'openid profile email',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  })
  return manager
}

function readStoredRole(roles: Role[]): Role {
  try {
    const stored = localStorage.getItem(ROLE_KEY) as Role | null
    if (stored && roles.includes(stored)) return stored
  } catch {
    /* storage unavailable: fall through */
  }
  return roles.includes('centre_lead') ? 'centre_lead' : (roles[0] ?? 'analyst')
}

function toAuthUser(u: User): AuthUser {
  const p = u.profile as Record<string, unknown>
  // The realm puts realm roles in a `roles` claim (fusion-realm.json); realm_access is the fallback.
  const claimed =
    (p.roles as string[] | undefined) ??
    (p.realm_access as { roles?: string[] } | undefined)?.roles ??
    []
  const realmRoles = claimed.filter((r): r is Role => (ALL_ROLES as string[]).includes(r))
  return {
    id: String(p.sub),
    name: String(p.name ?? p.preferred_username ?? 'Unknown user'),
    email: String(p.email ?? ''),
    roles: realmRoles.length ? realmRoles : ['analyst'],
    tokenRole: (ALL_ROLES as string[]).includes(String(p.active_role))
      ? (p.active_role as Role)
      : undefined,
  }
}

/**
 * Resolves the signed-in user once per page load. The authorization code in the URL can be
 * redeemed only once, and React runs effects twice in development (StrictMode), so every run
 * shares this one promise instead of redeeming the code again.
 */
let bootstrap: Promise<User | null> | undefined
function bootstrapUser(um: ReturnType<typeof userManager>): Promise<User | null> {
  bootstrap ??= (async () => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('code') && params.has('state')) {
      const u = await um.signinRedirectCallback()
      window.history.replaceState({}, '', window.location.pathname)
      return u
    }
    return um.getUser()
  })()
  return bootstrap
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(AUTH_DISABLED ? DEV_USER : null)
  const [oidcUser, setOidcUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>(
    AUTH_DISABLED ? 'authenticated' : 'loading',
  )
  const [error, setError] = useState<string>()
  const [activeRole, setRole] = useState<Role>(() => readStoredRole(user?.roles ?? ALL_ROLES))

  useEffect(() => {
    if (AUTH_DISABLED) return
    const um = userManager()
    let cancelled = false
    ;(async () => {
      try {
        const u = await bootstrapUser(um)
        if (cancelled) return
        if (!u || u.expired) {
          await um.signinRedirect({ state: window.location.pathname })
          return
        }
        if (cancelled) return
        const au = toAuthUser(u)
        setOidcUser(u)
        setUser(au)
        // Against Keycloak the token decides: every service checks its active_role, so the
        // screens must show and gate on that same role, not a stored preference.
        setRole(au.tokenRole ?? readStoredRole(au.roles))
        setStatus('authenticated')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Sign-in failed')
        setStatus('error')
      }
    })()
    const onLoaded = (u: User) => setOidcUser(u)
    um.events.addUserLoaded(onLoaded)
    return () => {
      cancelled = true
      um.events.removeUserLoaded(onLoaded)
    }
  }, [])

  // Keep the API bridge pointed at the current token and role. This runs during render, not in
  // an effect, because child queries fire their first request before a parent effect would.
  configureSession({
    getToken: async () => (AUTH_DISABLED ? null : (oidcUser?.access_token ?? null)),
    getActiveRole: () => activeRole,
    getUserId: () => user?.id ?? 'anonymous',
  })

  const setActiveRole = useCallback(
    (role: Role) => {
      try {
        localStorage.setItem(ROLE_KEY, role)
      } catch {
        /* ignore */
      }
      // Update the bridge synchronously so the refetch below already carries the new role.
      configureSession({ getActiveRole: () => role })
      setRole(role)
      void qc.invalidateQueries()
    },
    [qc],
  )

  const signOut = useCallback(() => {
    if (AUTH_DISABLED) return
    void userManager().signoutRedirect()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, activeRole, setActiveRole, signOut, error, devMode: AUTH_DISABLED }),
    [status, user, activeRole, setActiveRole, signOut, error],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Role helpers mirroring the gateway's permission policies. */
export const can = {
  publishToWall: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  decideWallRequest: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  decideReview: (r: Role) => r === 'reviewer' || r === 'supervisor' || r === 'centre_lead',
  // source.* in permissions.yaml.
  readSources: (r: Role) =>
    r === 'analyst' || r === 'supervisor' || r === 'centre_lead' || r === 'admin',
  proposeSource: (r: Role) => r === 'analyst' || r === 'supervisor',
  approveSource: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  /** triage.work in permissions.yaml: reading the queue and promoting from it. */
  workTriage: (r: Role) => r === 'analyst' || r === 'supervisor',
  changePolicy: (r: Role) => r === 'admin' || r === 'centre_lead',
  viewAudit: (r: Role) => r === 'admin' || r === 'centre_lead' || r === 'supervisor',
}
