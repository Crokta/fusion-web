import { describe, expect, it } from 'vitest'
import {
  toGeoLocation,
  toMapFeatures,
  toPlace,
  type GeoLocationDto,
  type MapFeatureCollectionDto,
} from '@/api/adapters'
import { basemapStyle } from '@/features/geo/basemap'
import { kindLabel, placeContext } from '@/features/geo/parts'

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
      expect(l.layout?.['text-font']).toEqual(['Noto Sans Regular'])
    }
  })
})
