import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr'
import { API_BASE } from '@/api/http'
import { mockBus, simulateSignal } from '@/api/mock/adapter'
import { session } from '@/api/session'
import type { LiveEventMap, LiveEventName } from '@/api/types'

export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'simulated'

export interface LiveClient {
  start(): Promise<void>
  stop(): Promise<void>
  on<E extends LiveEventName>(event: E, handler: (payload: LiveEventMap[E]) => void): () => void
  onStatus(handler: (status: LiveStatus) => void): () => void
  readonly status: LiveStatus
  /** Mock only: emits a synthetic story and the alert it trips. */
  simulate?: () => void
  /**
   * Real hub only: every pushed event by name, payload or not. The gateway pushes the event's
   * own small facts (ids, counts), never the full resource, so the provider refetches.
   */
  onAny?: (handler: (event: ServerEventName) => void) => () => void
}

/** What the gateway's hub sends for every event: the backbone event type and its payload. */
export interface ServerEnvelope {
  type: string
  data: Record<string, unknown>
}

export type ServerEventName = LiveEventName | 'case.changed' | 'approval.changed'

const SERVER_EVENTS: ServerEventName[] = [
  'story.published',
  'alert.raised',
  'notification.delivered',
  'job.progress',
  'wall.state',
  'case.changed',
  'approval.changed',
]

const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/**
 * Builds the typed event from a hub envelope when its payload carries enough to show
 * something; otherwise null, and the provider's refetch brings the full resource.
 */
export function fromServer<E extends LiveEventName>(
  event: E,
  env: ServerEnvelope,
): LiveEventMap[E] | null {
  const d = env.data ?? {}
  switch (event) {
    case 'job.progress':
      return {
        jobId: str(d.job_id) ?? '',
        label: [str(d.worker), str(d.stage)].filter(Boolean).join(' · '),
        percent: typeof d.percent === 'number' ? d.percent : 0,
        caseRef: str(d.case_id),
      } as LiveEventMap[E]
    case 'alert.raised':
      if (env.type !== 'AlertRaised') return null
      return {
        id: str(d.alert_id) ?? '',
        title: str(d.title) ?? 'Alert',
        detail: '',
        severity: (str(d.severity) ?? 'medium') as never,
        status: 'open',
        raisedAt: str(d.raised_at) ?? new Date().toISOString(),
        rule: str(d.rule_id) ?? '',
        escalationLevel: 0,
        caseRef: str(d.case_id),
      } as unknown as LiveEventMap[E]
    default:
      return null
  }
}

export const LIVE_EVENTS: LiveEventName[] = [
  'story.published',
  'alert.raised',
  'notification.delivered',
  'job.progress',
  'wall.state',
]

/**
 * SignalR client for the gateway hub at /hubs/live. The server pushes only what the user's
 * active role may see, so the client subscribes to every event name and filters nothing.
 */
export function createSignalRClient(): LiveClient {
  let status: LiveStatus = 'offline'
  const statusHandlers = new Set<(s: LiveStatus) => void>()
  const setStatus = (s: LiveStatus) => {
    status = s
    statusHandlers.forEach((h) => h(s))
  }

  const connection: HubConnection = new HubConnectionBuilder()
    .withUrl(`${API_BASE}/hubs/live`, {
      accessTokenFactory: async () => (await session.getToken()) ?? '',
    })
    // 0, 2, 5, 10, 30 s then every 30 s: a wall controller PC must come back on its own.
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: (ctx) =>
        [0, 2000, 5000, 10000, 30000][ctx.previousRetryCount] ?? 30000,
    })
    .configureLogging(LogLevel.Warning)
    .build()

  // React runs effects twice in development: start, stop (mid-negotiation), start again. The
  // second start must wait for that stop to finish, or it sees a connection still shutting
  // down, returns early, and the page never goes live.
  let stopping: Promise<void> | undefined

  connection.onreconnecting(() => setStatus('reconnecting'))
  connection.onreconnected(() => setStatus('live'))
  connection.onclose(() => setStatus('offline'))

  return {
    get status() {
      return status
    },
    async start() {
      if (stopping) await stopping
      if (connection.state !== HubConnectionState.Disconnected) return
      setStatus('connecting')
      try {
        await connection.start()
        setStatus('live')
      } catch {
        setStatus('offline')
      }
    },
    async stop() {
      stopping = connection.stop().finally(() => {
        stopping = undefined
      })
      await stopping
    },
    on(event, handler) {
      const h = (env: ServerEnvelope) => {
        const typed = fromServer(event, env)
        if (typed) handler(typed)
      }
      connection.on(event, h)
      return () => connection.off(event, h)
    },
    onAny(handler) {
      const offs = SERVER_EVENTS.map((name) => {
        const h = () => handler(name)
        connection.on(name, h)
        return () => connection.off(name, h)
      })
      return () => offs.forEach((off) => off())
    },
    onStatus(handler) {
      statusHandlers.add(handler)
      return () => statusHandlers.delete(handler)
    },
  }
}

/** Mock hub: forwards the mock adapter's bus and adds ambient job progress. */
export function createMockLiveClient(): LiveClient {
  let timer: ReturnType<typeof setInterval> | undefined
  let ambient: ReturnType<typeof setInterval> | undefined
  const jobs = [
    {
      jobId: 'job-media-88',
      label: 'Keyframe similarity · EV-2026-1848',
      caseRef: 'INV-0264',
      percent: 12,
    },
    {
      jobId: 'job-lang-41',
      label: 'Claim extraction · radio excerpt',
      caseRef: 'INV-0264',
      percent: 55,
    },
  ]
  return {
    status: 'simulated',
    async start() {
      timer = setInterval(() => {
        for (const j of jobs) {
          j.percent =
            j.percent >= 100 ? 4 : Math.min(100, j.percent + 3 + Math.round(Math.random() * 6))
          mockBus.emit('job.progress', { ...j })
        }
      }, 2500)
      // An unprompted signal now and then, so the floor never looks frozen in a demo.
      ambient = setInterval(() => simulateSignal(), 90_000)
    },
    async stop() {
      clearInterval(timer)
      clearInterval(ambient)
    },
    on: (event, handler) => {
      const off = mockBus.on(event, handler)
      return () => {
        off()
      }
    },
    onStatus: () => () => {},
    simulate: () => {
      simulateSignal()
    },
  }
}
