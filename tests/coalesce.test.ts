import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescedInvalidator } from '@/realtime/coalesce'

describe('coalesced invalidation of live pushes', () => {
  let qc: QueryClient
  let spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    qc = new QueryClient()
    spy = vi.fn(() => Promise.resolve())
    qc.invalidateQueries = spy as unknown as QueryClient['invalidateQueries']
  })
  afterEach(() => vi.useRealTimers())

  it('refetches at once when quiet, then once more for a whole burst', () => {
    const refetch = createCoalescedInvalidator(qc, 1000)
    for (let i = 0; i < 300; i++) refetch.invalidate(['feed'])
    expect(spy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(spy).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(5000)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('never cancels a fetch already running', () => {
    createCoalescedInvalidator(qc).invalidate(['feed'])
    expect(spy).toHaveBeenCalledWith({ queryKey: ['feed'] }, { cancelRefetch: false })
  })

  it('keeps keys apart and stops on dispose', () => {
    const refetch = createCoalescedInvalidator(qc, 1000)
    refetch.invalidate(['feed'])
    refetch.invalidate(['cases'])
    refetch.invalidate(['feed'])
    expect(spy).toHaveBeenCalledTimes(2)
    refetch.dispose()
    vi.advanceTimersByTime(2000)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
