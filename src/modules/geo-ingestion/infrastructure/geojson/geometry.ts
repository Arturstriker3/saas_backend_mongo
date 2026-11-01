export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

/**
 * Normalizes a geometry to a GeoJSON MultiPolygon string, since sources return
 * Polygon for single-part areas and MultiPolygon for the others.
 * @param geometry - Geometry as delivered by the source.
 * @param code - Area code, used in the error message.
 * @returns GeoJSON MultiPolygon serialized as a string.
 */
export function toMultiPolygonGeoJson(geometry: GeoJsonGeometry, code: string): string {
  if (geometry.type === 'MultiPolygon') {
    return JSON.stringify({ type: 'MultiPolygon', coordinates: geometry.coordinates });
  }

  if (geometry.type === 'Polygon') {
    return JSON.stringify({ type: 'MultiPolygon', coordinates: [geometry.coordinates] });
  }

  throw new Error(`Unsupported geometry type for area ${code}: ${geometry.type}`);
}
