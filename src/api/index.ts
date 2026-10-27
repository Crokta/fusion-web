import type { FusionApi } from './contract'
import { httpApi } from './http'
import { mockApi } from './mock/adapter'

/**
 * `VITE_USE_MOCKS=true` swaps the gateway for the in-memory adapter. The choice is made once
 * at startup; screens only ever see the `FusionApi` interface.
 */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

export const api: FusionApi = USE_MOCKS ? mockApi : httpApi

export type { FusionApi } from './contract'
export * from './problem'
export * from './types'
