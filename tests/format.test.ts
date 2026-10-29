import { describe, expect, it } from 'vitest'
import { chanceText } from '@/lib/format'

describe('a detector score in words', () => {
  it('never reads as certain at either end', () => {
    expect(chanceText(0.0006)).toBe('under 1% chance AI-generated')
    expect(chanceText(0)).toBe('under 1% chance AI-generated')
    expect(chanceText(0.995)).toBe('over 99% chance AI-generated')
    expect(chanceText(1)).toBe('over 99% chance AI-generated')
  })

  it('rounds the middle to whole percent', () => {
    expect(chanceText(0.925)).toBe('93% chance AI-generated')
    expect(chanceText(0.01)).toBe('1% chance AI-generated')
  })
})
