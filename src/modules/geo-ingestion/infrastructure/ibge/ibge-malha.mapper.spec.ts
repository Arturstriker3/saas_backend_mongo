import { describe, expect, test } from 'bun:test';
import { toSearchName } from '../../../../common/text/search-name';
import { toMultiPolygonGeoJson, type GeoJsonGeometry } from './ibge-malha.mapper';

describe('toMultiPolygonGeoJson', () => {
  test('wraps a Polygon into a MultiPolygon', () => {
    const geometry: GeoJsonGeometry = {
      type: 'Polygon',
      coordinates: [
        [
          [-10, -5],
          [-9, -5],
          [-9, -4],
          [-10, -5],
        ],
      ],
    };

    expect(JSON.parse(toMultiPolygonGeoJson(geometry, '2800100'))).toEqual({
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates],
    });
  });

  test('keeps a MultiPolygon unchanged', () => {
    const geometry: GeoJsonGeometry = { type: 'MultiPolygon', coordinates: [[[[0, 0]]]] };

    expect(JSON.parse(toMultiPolygonGeoJson(geometry, '28'))).toEqual(geometry);
  });

  test('rejects unsupported geometry types', () => {
    const geometry: GeoJsonGeometry = { type: 'Point', coordinates: [0, 0] };

    expect(() => toMultiPolygonGeoJson(geometry, '28')).toThrow('Unsupported geometry type');
  });
});

describe('toSearchName', () => {
  test('removes accents and lowercases', () => {
    expect(toSearchName('Amparo do São Francisco')).toBe('amparo do sao francisco');
  });

  test('trims surrounding spaces', () => {
    expect(toSearchName('  Aracaju ')).toBe('aracaju');
  });
});
