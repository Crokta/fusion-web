import type { QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Hub pushes carry ids only, so each one invalidates what it touches. A burst (intake catching up
 * after a restart publishes hundreds of stories a minute) would otherwise refetch the feed on every
 * push and cancel the fetch already running, so the screen never loads. A key is refetched at once
 * when quiet, then at most once per window, with one trailing refetch for pushes inside it, and an
 * in-flight fetch is never cancelled.
 */
export function createCoalescedInvalidator(qc: QueryClient, windowMs = 1000) {
  const windows = new Map<
    string,
    { key: QueryKey; pending: boolean; timer: ReturnType<typeof setTimeout> }
  >()

  const run = (key: QueryKey) => qc.invalidateQueries({ queryKey: key }, { cancelRefetch: false })

  const open = (id: string, key: QueryKey) => {
    const timer = setTimeout(() => {
      const w = windows.get(id)
      windows.delete(id)
      if (w?.pending) {
        void run(key)
        open(id, key)
      }
    }, windowMs)
    windows.set(id, { key, pending: false, timer })
  }

  return {
    invalidate(key: QueryKey) {
      const id = JSON.stringify(key)
      const w = windows.get(id)
      if (w) {
        w.pending = true
        return
      }
      void run(key)
      open(id, key)
    },
    dispose() {
      windows.forEach((w) => clearTimeout(w.timer))
      windows.clear()
    },
  }
}
