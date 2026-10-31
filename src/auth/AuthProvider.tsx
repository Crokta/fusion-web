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
import { ROLE_LABEL, type Role } from '@/api/types'
import { useToast } from '@/components/Toaster'
import {
  ALL_ROLES,
  BASE_SCOPE,
  SILENT_MARKER,
  checkSwitch,
  isRole,
  isSilentCallback,
  needsRenewal,
  scopeFor,
  switchGranted,
  tokenRoles,
} from './activeRole'

/**
 * Authentication and the active role.
 *
 * Fusion users hold several roles but act in one at a time (Section 4.1: the gateway attaches
 * user, active role and device to every request). The role is the access token's active_role,
 * which every service checks, so switching role means getting a new token (ADR 0008): a silent
 * prompt=none re-authorisation asking Keycloak for the scope `role:<role>`, which Keycloak
 * grants only to a holder of that role. Renewal refreshes with the same scope, so the role
 * outlives the 5-minute token. Every cached query is refetched afterwards, and the screens
 * below AuthGate remount so the live hub reconnects with the new role's groups.
 *
 * VITE_AUTH_DISABLED=true signs in a local dev user so the UI runs with no Keycloak; there the
 * switch is local only, as nothing checks a token.
 */

export const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true'
/** The last role chosen: asked for at the next sign-in, granted only if still held. */
const ROLE_KEY = 'fusion.activeRole'

export interface AuthUser {
  id: string
  name: string
  email: string
  roles: Role[]
  /** The token's active_role: the role every service checks. Absent in dev mode. */
  tokenRole?: Role
}

export type SwitchResult = 'switched' | 'refused' | 'failed' | 'unchanged'

interface AuthContextValue {
  status: 'loading' | 'authenticated' | 'error'
  user: AuthUser | null
  activeRole: Role
  /** Asks for a token in `role`; resolves once the screens show the outcome. */
  setActiveRole: (role: Role) => Promise<SwitchResult>
  /** The role being switched to, while the new token is on its way. */
  switching: Role | null
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
    // The hidden frame of a silent re-authorisation lands here; see the check below.
    silent_redirect_uri: `${window.location.origin}/?${SILENT_MARKER}`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code', // authorisation code + PKCE (oidc-client-ts always uses S256)
    scope: BASE_SCOPE,
    // Renewal is driven here (renew() below), not by the library: its own renewal falls back to
    // the configured scope, which carries no role, and its timer alone misses a token that
    // expired while the tab slept.
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  })
  return manager
}

/**
 * Inside the hidden frame: hand the authorisation response to the window that opened it and do
 * nothing else. AuthGate keeps the frame on its holding screen, so no screen renders or fetches.
 */
const IN_SILENT_FRAME =
  !AUTH_DISABLED && isSilentCallback(window.location.href, window.self !== window.top)
if (IN_SILENT_FRAME) void userManager().signinSilentCallback()

function readStoredRole(): Role | null {
  try {
    const stored = localStorage.getItem(ROLE_KEY)
    return isRole(stored) ? stored : null
  } catch {
    return null // storage unavailable
  }
}

function storeRole(role: Role) {
  try {
    localStorage.setItem(ROLE_KEY, role)
  } catch {
    /* storage unavailable: the next sign-in uses the default role */
  }
}

function toAuthUser(u: User): AuthUser {
  const p = u.profile as Record<string, unknown>
  // Roles and active role come from the access token, the one the services check.
  const { roles, activeRole } = tokenRoles(u.access_token)
  return {
    id: String(p.sub),
    name: String(p.name ?? p.preferred_username ?? 'Unknown user'),
    email: String(p.email ?? ''),
    roles,
    tokenRole: activeRole,
  }
}

/** The role scope this token was granted with, so a renewal asks for the same one. */
function roleOf(u: User | null): Role | null {
  return u ? (tokenRoles(u.access_token).activeRole ?? null) : null
}

/** Sends the browser to Keycloak, to come back to this page in `role` (or the default role). */
function redirectToSignIn(role: Role | null) {
  // Back to this same path: the router read it at start-up, so only the query (the code)
  // needs taking off afterwards.
  return userManager().signinRedirect({
    scope: scopeFor(role),
    redirect_uri: `${window.location.origin}${window.location.pathname}`,
  })
}

/**
 * Renews the token, once however many callers ask at the same moment. With a refresh token
 * this is a refresh grant, which keeps the token's scope and so its role (Keycloak never widens
 * a scope on refresh). Without one, a silent re-authorisation in the same role.
 */
let renewing: Promise<User | null> | undefined
function renew(): Promise<User | null> {
  renewing ??= (async () => {
    const um = userManager()
    const current = await um.getUser()
    try {
      return await um.signinSilent({ scope: scopeFor(roleOf(current)) })
    } catch {
      // The Keycloak session has ended (idle or maximum lifetime): sign in again, same role.
      await redirectToSignIn(roleOf(current) ?? readStoredRole())
      return null
    }
  })().finally(() => {
    renewing = undefined
  })
  return renewing
}

/** The access token to send, renewed first if it has expired or is about to. */
async function freshToken(): Promise<string | null> {
  const u = await userManager().getUser()
  if (!u) return null
  if (!needsRenewal(u.expires_at, Date.now() / 1000)) return u.access_token
  return (await renew())?.access_token ?? null
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
    const u = await um.getUser()
    // An expired token with a live refresh token (a reload after a coffee break) renews quietly.
    if (u?.expired && u.refresh_token) return renew()
    return u
  })()
  return bootstrap
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [user, setUser] = useState<AuthUser | null>(AUTH_DISABLED ? DEV_USER : null)
  const [status, setStatus] = useState<AuthContextValue['status']>(
    AUTH_DISABLED ? 'authenticated' : 'loading',
  )
  const [error, setError] = useState<string>()
  const [devRole, setDevRole] = useState<Role>(() => readStoredRole() ?? 'centre_lead')
  const [switching, setSwitching] = useState<Role | null>(null)

  useEffect(() => {
    if (AUTH_DISABLED || IN_SILENT_FRAME) return
    const um = userManager()
    let cancelled = false
    ;(async () => {
      try {
        let u = await bootstrapUser(um)
        if (cancelled) return
        if (!u || u.expired) {
          await redirectToSignIn(readStoredRole())
          return
        }
        // A remembered role the user no longer holds is not granted, and the token comes back
        // with no active_role at all: settle on the default role instead.
        if (!roleOf(u)) {
          try {
            u = await um.signinSilent({ forceIframeAuth: true, scope: scopeFor(null) })
          } catch {
            await redirectToSignIn(null)
            return
          }
        }
        if (cancelled || !u) return
        setUser(toAuthUser(u))
        setStatus('authenticated')
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Sign-in failed')
        setStatus('error')
      }
    })()
    // Every new token (renewal or switch) updates the screens, so they always show its role.
    const onLoaded = (u: User) => setUser(toAuthUser(u))
    const onExpiring = () => void renew()
    um.events.addUserLoaded(onLoaded)
    um.events.addAccessTokenExpiring(onExpiring)
    return () => {
      cancelled = true
      um.events.removeUserLoaded(onLoaded)
      um.events.removeAccessTokenExpiring(onExpiring)
    }
  }, [])

  const activeRole: Role = AUTH_DISABLED ? devRole : (user?.tokenRole ?? 'analyst')

  // Keep the API bridge pointed at the current token and role. This runs during render, not in
  // an effect, because child queries fire their first request before a parent effect would.
  configureSession({
    getToken: AUTH_DISABLED ? async () => null : freshToken,
    getActiveRole: () => activeRole,
    getUserId: () => user?.id ?? 'anonymous',
  })

  const setActiveRole = useCallback(
    async (role: Role): Promise<SwitchResult> => {
      if (AUTH_DISABLED) {
        storeRole(role)
        configureSession({ getActiveRole: () => role })
        setDevRole(role)
        void qc.invalidateQueries()
        toast({
          title: `Acting as ${ROLE_LABEL[role]}`,
          detail: 'Screens refreshed.',
          tone: 'success',
        })
        return 'switched'
      }
      const um = userManager()
      const before = await um.getUser()
      const check = checkSwitch(role, tokenRoles(before?.access_token))
      if (!check.ok) {
        if (check.reason === 'already_active') return 'unchanged'
        toast({ title: `You do not hold the ${ROLE_LABEL[role]} role`, tone: 'error' })
        return 'refused'
      }
      setSwitching(role)
      try {
        let next: User | null
        try {
          next = await um.signinSilent({ forceIframeAuth: true, scope: scopeFor(role) })
        } catch {
          // No silent answer (the identity provider wants the user, or its cookie is blocked in
          // a frame): the full-page round trip does the same and comes back to this page.
          storeRole(role)
          await redirectToSignIn(role)
          return 'switched'
        }
        if (!next || !switchGranted(role, next.access_token)) {
          // Refused by Keycloak (the role was taken away since this token was issued). Go back
          // to the previous role rather than leave a token with none.
          const previous = roleOf(before)
          await um.signinSilent({ forceIframeAuth: true, scope: scopeFor(previous) })
          toast({
            title: `Not switched to ${ROLE_LABEL[role]}`,
            detail: 'The identity provider says you do not hold that role.',
            tone: 'error',
          })
          return 'refused'
        }
        storeRole(role)
        // The new token is already in the bridge (freshToken reads the store); refetch it all.
        void qc.invalidateQueries()
        toast({
          title: `Acting as ${ROLE_LABEL[role]}`,
          detail: 'New sign-in token issued. Screens refreshed for the new role.',
          tone: 'success',
        })
        return 'switched'
      } catch (e) {
        toast({
          title: 'Role not switched',
          detail: e instanceof Error ? e.message : 'The identity provider did not answer.',
          tone: 'error',
        })
        return 'failed'
      } finally {
        setSwitching(null)
      }
    },
    [qc, toast],
  )

  const signOut = useCallback(() => {
    if (AUTH_DISABLED) return
    void userManager().signoutRedirect()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      activeRole,
      setActiveRole,
      switching,
      signOut,
      error,
      devMode: AUTH_DISABLED,
    }),
    [status, user, activeRole, setActiveRole, switching, signOut, error],
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
  // wall.view and wall.operate in permissions.yaml (publishToWall is wall.operate).
  viewWall: (r: Role) =>
    r === 'analyst' ||
    r === 'supervisor' ||
    r === 'reviewer' ||
    r === 'centre_lead' ||
    r === 'leadership',
  publishToWall: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  decideWallRequest: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  decideReview: (r: Role) => r === 'reviewer' || r === 'supervisor' || r === 'centre_lead',
  // source.* in permissions.yaml.
  readSources: (r: Role) =>
    r === 'analyst' || r === 'supervisor' || r === 'centre_lead' || r === 'admin',
  proposeSource: (r: Role) => r === 'analyst' || r === 'supervisor',
  approveSource: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  // product.* in permissions.yaml.
  readBriefs: (r: Role) =>
    r === 'analyst' ||
    r === 'supervisor' ||
    r === 'reviewer' ||
    r === 'centre_lead' ||
    r === 'leadership',
  draftBrief: (r: Role) => r === 'analyst' || r === 'supervisor',
  releaseBrief: (r: Role) => r === 'reviewer' || r === 'centre_lead',
  /** evidence.upload in permissions.yaml: uploading a file or capturing a link into a case. */
  addEvidence: (r: Role) => r === 'analyst' || r === 'supervisor' || r === 'evidence_officer',
  /** case.write in permissions.yaml: assessment and the checklist. */
  writeCase: (r: Role) => r === 'analyst' || r === 'supervisor',
  /** triage.work in permissions.yaml: reading the queue and promoting from it. */
  workTriage: (r: Role) => r === 'analyst' || r === 'supervisor',
  /** alert.read and alert.ack in permissions.yaml: the same three roles. */
  ackAlert: (r: Role) => r === 'analyst' || r === 'supervisor' || r === 'centre_lead',
  /** case.assign in permissions.yaml: keeping mission templates and choosing a case's mission (E29). */
  manageMissions: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  /** outcomes.read in permissions.yaml: the outcome dashboard (E38). */
  readOutcomes: (r: Role) => r === 'supervisor' || r === 'centre_lead' || r === 'leadership',
  /** case.close in permissions.yaml: closing a released case, after which lessons are recorded. */
  closeCase: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  /** case.write in permissions.yaml: recording and rewording lessons on closed cases (E38). */
  recordLesson: (r: Role) => r === 'analyst' || r === 'supervisor',
  /** case.assign in permissions.yaml: marking a lesson applied to a mission template (E38). */
  applyLesson: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  /** case.read in permissions.yaml: the mission templates themselves. */
  readMissions: (r: Role) =>
    r === 'analyst' ||
    r === 'supervisor' ||
    r === 'reviewer' ||
    r === 'centre_lead' ||
    r === 'evidence_officer',
  /** roster.manage in permissions.yaml. */
  manageRoster: (r: Role) => r === 'supervisor' || r === 'centre_lead',
  changePolicy: (r: Role) => r === 'admin' || r === 'centre_lead',
  viewAudit: (r: Role) => r === 'admin' || r === 'centre_lead' || r === 'supervisor',
  /** cctv.request in permissions.yaml: drafting and submitting CCTV requests (E31). */
  requestCctv: (r: Role) => r === 'analyst' || r === 'supervisor',
  /** search.names in permissions.yaml: asking for name searches, and a public figure's results (E30). */
  searchNames: (r: Role) => r === 'analyst' || r === 'supervisor',
  /** search.pi in permissions.yaml: a private individual's results, while pi_search is on (ADR 0013). */
  readPiResults: (r: Role) => r === 'centre_lead',
  /** feed.read, case.read or search.run: the gazetteer and the map (E32, ADR 0018); layers narrow further. */
  readMap: (r: Role) =>
    r === 'analyst' ||
    r === 'supervisor' ||
    r === 'reviewer' ||
    r === 'centre_lead' ||
    r === 'evidence_officer' ||
    r === 'leadership',
  /** case.read in permissions.yaml: the map's cases layer and a case's locations. */
  readCaseLocations: (r: Role) =>
    r === 'analyst' ||
    r === 'supervisor' ||
    r === 'reviewer' ||
    r === 'centre_lead' ||
    r === 'evidence_officer',
  /** feed.read in permissions.yaml: the map's stories layer and a story's locations. */
  readStoryLocations: (r: Role) =>
    r === 'analyst' ||
    r === 'supervisor' ||
    r === 'reviewer' ||
    r === 'centre_lead' ||
    r === 'leadership',
}
