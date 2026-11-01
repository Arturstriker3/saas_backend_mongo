import { describe, expect, test } from 'bun:test';
import { toSearchName } from '../../../../common/text/search-name';
import { toMultiPolygonGeoJson } from '../geojson/geometry';
import {
  BAIRRO_CONFIG,
  SETOR_CONFIG,
  toRegionInput,
  type ShapefileFeatureLike,
} from './shapefile-region.mapper';

const SQUARE = {
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

function mapFeature(config: typeof BAIRRO_CONFIG, feature: ShapefileFeatureLike) {
  return toRegionInput(config, feature, toMultiPolygonGeoJson, toSearchName);
}

describe('toRegionInput for neighborhoods', () => {
  test('maps code, name and municipality', () => {
    const region = mapFeature(BAIRRO_CONFIG, {
      properties: { CD_BAIRRO: '280030805000001', NM_BAIRRO: 'Centro', CD_MUN: '2800308' },
      geometry: SQUARE,
    });

    expect(region).toEqual({
      level: 'neighborhood',
      ibgeCode: '280030805000001',
      parentCode: '2800308',
      name: 'Centro',
      searchName: 'centro',
      geometry: JSON.stringify({ type: 'MultiPolygon', coordinates: [SQUARE.coordinates] }),
    });
  });

  test('returns null when the code is missing', () => {
    const region = mapFeature(BAIRRO_CONFIG, {
      properties: { NM_BAIRRO: 'Sem código' },
      geometry: SQUARE,
    });

    expect(region).toBeNull();
  });
});

describe('toRegionInput for census tracts', () => {
  test('derives the municipality from the code prefix', () => {
    const region = mapFeature(SETOR_CONFIG, {
      properties: { CD_SETOR: '280030805000001' },
      geometry: SQUARE,
    });

    expect(region?.parentCode).toBe('2800308');
    expect(region?.level).toBe('sector');
  });

  test('builds a readable name from the code when the source has none', () => {
    const region = mapFeature(SETOR_CONFIG, {
      properties: { CD_SETOR: '280030805000001' },
      geometry: SQUARE,
    });

    expect(region?.name).toBe('Setor 280030805000001');
  });

  test('returns null when the geometry is missing', () => {
    const region = mapFeature(SETOR_CONFIG, {
      properties: { CD_SETOR: '280030805000001' },
      geometry: null,
    });

    expect(region).toBeNull();
  });
});
