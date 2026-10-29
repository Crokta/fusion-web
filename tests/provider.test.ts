import { describe, expect, it } from 'vitest'
import { intervalLabel, monthlyCeiling } from '@/features/provider/ProviderPage'

describe('the Bright Data screen', () => {
  it('puts a ceiling on what a source can spend in 30 days', () => {
    expect(monthlyCeiling(10, null, false)).toBe(7200) // hourly, the default
    expect(monthlyCeiling(10, 1440, false)).toBe(300) // daily
    expect(monthlyCeiling(10, 30, false)).toBe(7200) // never more often than intake's hourly round
    expect(monthlyCeiling(10, null, true)).toBe(0) // paused
  })

  it('says how often in plain words', () => {
    expect([null, 60, 120, 360, 1440, 2880].map(intervalLabel)).toEqual([
      'hourly',
      'hourly',
      'every 2 hours',
      'every 6 hours',
      'daily',
      'every 2 days',
    ])
  })
})
