import { describe, expect, it } from 'vitest'
import {
  toGeoLocation,
  toMapFeatures,
  toPlace,
  type GeoLocationDto,
  type MapFeatureCollectionDto,
} from '@/api/adapters'
import { basemapStyle } from '@/features/geo/basemap'
import {
  breakLabels,
  choroplethBreaks,
  opacityExpression,
  withCounts,
} from '@/features/geo/choropleth'
import { kindLabel, placeContext } from '@/features/geo/parts'
import type { MapBoundaries } from '@/api/types'

// Geo (E32, ADR 0018): search's gazetteer and map DTOs, and the basemap style.

const name = (id?: string | null) => (id === 'analyst1' ? 'Funmilayo Adeleke' : (id ?? '—'))

describe('geo adapters', () => {
  it('maps a gazetteer place, nulls to undefined', () => {
    const p = toPlace({
      id: 'geonames:2331447',
      name: 'Maiduguri',
      kind: 'place',
      featureCode: 'PPLA',
      country: 'NG',
      admin1Id: 'geonames:2346794',
      admin1Name: 'Borno State',
      admin2Id: null,
      admin2Name: null,
      lat: 11.84692,
      lon: 13.15712,
      population: 1_110_000,
      aliases: ['Yerwa'],
    })
    expect(p).toMatchObject({
      admin1Name: 'Borno State',
      admin2Name: undefined,
      aliases: ['Yerwa'],
    })
    expect(placeContext(p)).toBe('Borno State')
    expect(kindLabel('admin2', 'NG')).toBe('LGA')
    expect(kindLabel('admin1', 'NE')).toBe('Region')
  })

  it('names who placed and confirmed a location; extraction is not a person', () => {
    const dto: GeoLocationDto = {
      id: 'l1',
      subjectType: 'story',
      subjectId: 's1',
      caseId: null,
      subjectTitle: 'Attack near Gwoza',
      subjectAt: '2026-10-30T10:00:00Z',
      placeId: 'geonames:1',
      admin1Id: 'geonames:2346794',
      label: 'Gwoza',
      lat: 11.08,
      lon: 13.69,
      precision: 'confirmed',
      origin: 'manual',
      note: null,
      addedBy: 'analyst1',
      addedAt: '2026-10-30T11:00:00Z',
      confirmedBy: 'analyst1',
      confirmedAt: '2026-10-30T11:00:00Z',
      removed: false,
      version: 1,
    }
    expect(toGeoLocation(dto, name)).toMatchObject({
      addedBy: 'Funmilayo Adeleke',
      confirmedBy: 'Funmilayo Adeleke',
      caseId: undefined,
      note: undefined,
    })
    expect(toGeoLocation({ ...dto, origin: 'extracted', addedBy: 'language' }, name).addedBy).toBe(
      'Place extraction',
    )
  })

  it('flattens GeoJSON features: coordinates are longitude first', () => {
    const c: MapFeatureCollectionDto = {
      type: 'FeatureCollection',
      truncated: true,
      features: [
        {
          type: 'Feature',
          id: 'f1',
          geometry: { type: 'Point', coordinates: [13.15, 11.84] },
          properties: {
            layer: 'cases',
            subjectType: 'case',
            subjectId: 'c1',
            caseId: 'c1',
            title: 'CASE-2026-0101',
            label: 'Maiduguri',
            placeId: null,
            precision: 'estimated',
            origin: 'manual',
            at: '2026-10-30T10:00:00Z',
          },
        },
      ],
    }
    const { features, truncated } = toMapFeatures(c)
    expect(truncated).toBe(true)
    expect(features[0]).toMatchObject({
      lon: 13.15,
      lat: 11.84,
      layer: 'cases',
      placeId: undefined,
    })
  })
})

describe('basemap style', () => {
  it('falls back to an outline when the tile server has no extract', () => {
    const s = basemapStyle({ basemap: false, fonts: [] }, 'dark')
    expect(Object.keys(s.sources)).toEqual(['outline'])
    expect(s.glyphs).toBeUndefined()
  })

  it('uses only the centre’s tile server, and drops icon layers and unserved fonts', () => {
    const s = basemapStyle({ basemap: true, fonts: ['Noto Sans Regular'] }, 'light')
    const urls = [s.glyphs, ...Object.values(s.sources).map((v) => ('url' in v ? v.url : ''))]
    for (const u of urls) expect(u).toMatch(/^http:\/\/localhost:3010\//)
    expect(s.sprite).toBeUndefined()
    const symbols = s.layers.filter((l) => l.type === 'symbol')
    expect(symbols.length).toBeGreaterThan(0)
    for (const l of symbols) {
      expect(l.layout?.['icon-image']).toBeUndefined()
      // Only Regular is served, so Medium and Italic fall back to it.
      expect(JSON.stringify(l.layout?.['text-font'])).not.toMatch(/Noto Sans (Medium|Italic)/)
    }
  })

  it('keeps town and city names, without their townspot icon', () => {
    const s = basemapStyle({ basemap: true, fonts: ['Noto Sans Regular'] }, 'dark')
    const towns = s.layers.find((l) => l.id === 'places_locality')
    expect(towns?.type).toBe('symbol')
    if (towns?.type === 'symbol') expect(towns.layout?.['icon-image']).toBeUndefined()
    expect(s.layers.map((l) => l.id)).not.toContain('pois')
  })

  it('gives every layer a unique id, or MapLibre rejects the whole style', () => {
    for (const basemap of [true, false]) {
      const ids = basemapStyle({ basemap, fonts: ['Noto Sans Regular'] }, 'dark').layers.map(
        (l) => l.id,
      )
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids[0]).toBe('background')
    }
  })

  it('keeps the style’s own fonts where the tile server serves them', () => {
    const fonts = ['Noto Sans Italic', 'Noto Sans Medium', 'Noto Sans Regular']
    const s = basemapStyle({ basemap: true, fonts }, 'dark')
    const used = JSON.stringify(
      s.layers.filter((l) => l.type === 'symbol').map((l) => l.layout?.['text-font']),
    )
    expect(used).toMatch(/Noto Sans Medium/)
    expect(used).toMatch(/Noto Sans Italic/)
  })
})

describe('choropleth (ADR 0022)', () => {
  const boundaries: MapBoundaries = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'NG008011',
        properties: {
          code: 'NG008011',
          name: 'Gwoza',
          level: 2,
          parentCode: 'NG008',
          parentName: 'Borno',
        },
        geometry: { type: 'MultiPolygon', coordinates: [] },
      },
      {
        type: 'Feature',
        id: 'NG008021',
        properties: {
          code: 'NG008021',
          name: 'Maiduguri',
          level: 2,
          parentCode: 'NG008',
          parentName: 'Borno',
        },
        geometry: { type: 'MultiPolygon', coordinates: [] },
      },
    ],
  }

  it('joins counts to polygons on the P-code, and an area with nothing placed counts 0', () => {
    const joined = withCounts(boundaries, [
      {
        placeId: 'NG008011',
        code: 'NG008011',
        name: 'Gwoza',
        country: 'NG',
        lat: 11,
        lon: 13,
        cases: 2,
        stories: 1,
        estimated: 0,
        level: 'lga',
        parent: 'Borno',
      },
    ])
    expect(joined.features.map((f) => [f.properties.code, f.properties.total])).toEqual([
      ['NG008011', 3],
      ['NG008021', 0],
    ])
    expect(joined.features[0]!.properties.parentName).toBe('Borno')
  })

  it('gives small counts a class each and splits larger ranges into five', () => {
    expect(choroplethBreaks(0)).toEqual([])
    expect(choroplethBreaks(3)).toEqual([1, 2, 3])
    expect(breakLabels(choroplethBreaks(3), 3)).toEqual(['1', '2', '3'])
    const breaks = choroplethBreaks(41)
    expect(breaks).toHaveLength(5)
    expect(breaks[0]).toBe(1)
    expect(breakLabels(breaks, 41).at(-1)).toMatch(/\+$/)
  })

  it('leaves an empty area transparent and steps one hue darker per class', () => {
    expect(opacityExpression([1, 2])).toEqual(['step', ['get', 'total'], 0, 1, 0.16, 2, 0.8])
    expect(opacityExpression([])).toEqual(['literal', 0])
  })
})
