import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { ApiError } from '@/api'
import { AuthGate } from '@/auth/AuthGate'
import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/components/Toaster'
import { ShellProvider } from '@/features/shell/ShellContext'
import { LiveProvider } from '@/realtime/LiveProvider'
import { routeTree } from './routeTree.gen'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The floor sits with this open through a shift, so data refetches on focus; realtime
      // pushes keep it fresh in between.
      refetchOnWindowFocus: true,
      staleTime: 20_000,
      gcTime: 10 * 60_000,
      // A refusal is an answer, not a transient failure: never retry 4xx.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
})

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <AuthGate>
            <LiveProvider>
              <ShellProvider>
                <RouterProvider router={router} />
              </ShellProvider>
            </LiveProvider>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
