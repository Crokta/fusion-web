import type { ReactNode } from 'react'
import { useAuth } from './AuthProvider'

/** Holds the app until a user is known, so no request leaves without a token. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, error } = useAuth()
  if (status === 'authenticated') return children
  return (
    <div className="grid h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="relative grid size-12 place-items-center">
          <span className="absolute inset-0 animate-ping-slow rounded-full bg-cyan/30" />
          <span className="size-3 rounded-full bg-cyan shadow-[0_0_20px_var(--color-cyan)]" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink">
            {status === 'error' ? 'Sign-in failed' : 'Signing in to Mini Fusion Centre…'}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {status === 'error' ? error : 'Redirecting to the identity provider'}
          </p>
        </div>
      </div>
    </div>
  )
}
