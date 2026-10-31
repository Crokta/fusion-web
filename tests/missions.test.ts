import { describe, expect, it } from 'vitest'
import { lineKey, templateKey } from '@/features/missions/MissionsPage'

describe('mission keys (E29)', () => {
  it('makes a line key casework accepts, unique within the template', () => {
    expect(lineKey('Police statement sought', [])).toBe('police_statement_sought')
    expect(lineKey('Police statement sought', ['police_statement_sought'])).toBe(
      'police_statement_sought_2',
    )
    expect(lineKey('1. Crowd size?', [])).toMatch(/^[a-z][a-z0-9_]{1,59}$/)
    expect(lineKey('!!', [])).toBe('line')
  })

  it('makes a template key from the name', () => {
    expect(templateKey('Protest monitoring')).toBe('protest-monitoring')
    expect(templateKey('2026 Elections — polling')).toBe('elections-polling')
  })
})
