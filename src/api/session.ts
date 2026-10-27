import type { Role } from './types'

/**
 * The bridge between auth and the API layer. Auth registers how to get a token and the
 * active role; the API client and realtime hub read them. Keeping this as a tiny mutable
 * holder avoids an import cycle between `auth/` and `api/`.
 */
interface SessionBridge {
  getToken: () => Promise<string | null>
  getActiveRole: () => Role
  getUserId: () => string
}

export const session: SessionBridge = {
  getToken: async () => null,
  getActiveRole: () => 'analyst',
  getUserId: () => 'anonymous',
}

export function configureSession(bridge: Partial<SessionBridge>) {
  Object.assign(session, bridge)
}
