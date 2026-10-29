import { describe, expect, it } from 'vitest'
import { parseSourceImport } from '@/features/sources/importFile'

describe('parseSourceImport', () => {
  it('reads the seed file shape and drops notes', () => {
    const r = parseSourceImport(
      JSON.stringify({
        sources: [
          {
            name: 'Daily Example',
            kind: 'feed',
            url: 'https://example.ng/feed/',
            reliability: 'b',
            note: 'x',
          },
          { name: 'Police on X', kind: 'social', url: 'https://x.com/PoliceNG' },
        ],
      }),
    )
    expect(r.sources).toEqual([
      { name: 'Daily Example', kind: 'feed', url: 'https://example.ng/feed/', reliability: 'B' },
      { name: 'Police on X', kind: 'social', url: 'https://x.com/PoliceNG', reliability: null },
    ])
    expect([r.problems, r.social]).toEqual([[], 1])
  })

  it('reports rows it cannot read and keeps the rest', () => {
    const r = parseSourceImport(
      JSON.stringify([
        { kind: 'feed', url: 'https://a.ng/feed' },
        { name: 'B', kind: 'podcast', url: 'https://b.ng' },
        { name: 'C', kind: 'site', url: 'ftp://c.ng' },
        { name: 'D', kind: 'site', url: 'https://d.ng', reliability: 'Z' },
        { name: 'E', kind: 'site', url: 'https://e.ng' },
      ]),
    )
    expect(r.sources.map((s) => s.name)).toEqual(['E'])
    expect(r.problems).toHaveLength(4)
  })

  it('refuses what is not a list', () => {
    expect(parseSourceImport('not json').problems).toEqual(['The file is not JSON.'])
    expect(parseSourceImport('{"a":1}').sources).toEqual([])
  })

  it('sends at most 200', () => {
    const many = Array.from({ length: 205 }, (_, i) => ({
      name: `S${i}`,
      kind: 'feed',
      url: `https://s${i}.ng/feed`,
    }))
    const r = parseSourceImport(JSON.stringify(many))
    expect(r.sources).toHaveLength(200)
    expect(r.problems[0]).toMatch(/At most 200/)
  })
})
