import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { USE_MOCKS } from '@/api'
import { qk } from '@/api/queries'
import type { Alert, JobProgress, LiveEventMap, LiveEventName, Page, StoryGroup } from '@/api/types'
import {
  createMockLiveClient,
  createSignalRClient,
  type LiveClient,
  type LiveStatus,
} from './client'

interface LiveContextValue {
  client: LiveClient
  status: LiveStatus
  jobs: JobProgress[]
}

const LiveContext = createContext<LiveContextValue | null>(null)

/**
 * Owns the single hub connection and folds pushed events into the query cache, so every
 * screen that shows feed, alerts or wall state updates without knowing about SignalR.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [client] = useState<LiveClient>(() =>
    USE_MOCKS ? createMockLiveClient() : createSignalRClient(),
  )
  const [status, setStatus] = useState<LiveStatus>(client.status)
  const [jobs, setJobs] = useState<JobProgress[]>([])

  useEffect(() => {
    const offs = [
      client.onStatus(setStatus),
      client.on('story.published', (story: StoryGroup) => {
        qc.setQueriesData<Page<StoryGroup>>({ queryKey: ['feed'] }, (old) =>
          old && !old.items.some((s) => s.id === story.id)
            ? { ...old, items: [story, ...old.items] }
            : old,
        )
        qc.invalidateQueries({ queryKey: qk.watchFloor })
      }),
      client.on('alert.raised', (alert: Alert) => {
        qc.setQueriesData<Page<Alert>>({ queryKey: ['alerts'] }, (old) =>
          old && !old.items.some((a) => a.id === alert.id)
            ? { ...old, items: [alert, ...old.items] }
            : old,
        )
      }),
      client.on('wall.state', (state) => {
        qc.setQueryData(qk.wall, state)
        qc.invalidateQueries({ queryKey: qk.wallPublications })
      }),
      client.on('job.progress', (job) =>
        setJobs((prev) => [job, ...prev.filter((j) => j.jobId !== job.jobId)].slice(0, 6)),
      ),
    ]
    // Against the real gateway, pushes carry ids only: refetch what each one touches.
    if (client.onAny) {
      offs.push(
        client.onAny((event) => {
          switch (event) {
            case 'story.published':
              qc.invalidateQueries({ queryKey: ['feed'] })
              qc.invalidateQueries({ queryKey: qk.watchFloor })
              break
            case 'alert.raised':
              qc.invalidateQueries({ queryKey: ['alerts'] })
              qc.invalidateQueries({ queryKey: qk.watchFloor })
              break
            case 'wall.state':
              qc.invalidateQueries({ queryKey: qk.wall })
              qc.invalidateQueries({ queryKey: qk.wallPublications })
              break
            case 'case.changed':
              qc.invalidateQueries({ queryKey: ['cases'] })
              qc.invalidateQueries({ queryKey: ['reviews'] })
              break
            case 'approval.changed':
              qc.invalidateQueries({ queryKey: ['approvals'] })
              break
          }
        }),
      )
    }
    void client.start()
    return () => {
      offs.forEach((off) => off())
      void client.stop()
    }
  }, [client, qc])

  const value = useMemo(() => ({ client, status, jobs }), [client, status, jobs])
  return <LiveContext value={value}>{children}</LiveContext>
}

export function useLive() {
  const ctx = use(LiveContext)
  if (!ctx) throw new Error('useLive must be used inside <LiveProvider>')
  return ctx
}

/** Subscribe a component to one event, e.g. to flash a toast when an alert arrives. */
export function useLiveEvent<E extends LiveEventName>(
  event: E,
  handler: (payload: LiveEventMap[E]) => void,
) {
  const { client } = useLive()
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })
  useEffect(() => client.on(event, (p) => ref.current(p)), [client, event])
}
