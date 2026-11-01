declare module 'shapefile' {
  export interface ShapefileFeature {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown } | null;
  }

  export interface ShapefileReadResult {
    done: boolean;
    value?: ShapefileFeature;
  }

  export interface ShapefileSource {
    read(): Promise<ShapefileReadResult>;
    cancel(): void;
  }

  export interface ShapefileOptions {
    encoding?: string;
  }

  /**
   * Opens a shapefile and exposes an incremental reader over its features.
   * @param shp - Path to the .shp file.
   * @param dbf - Optional path to the .dbf file with attributes.
   * @param options - Reader options; the default encoding is windows-1252.
   */
  export function open(
    shp: string,
    dbf?: string,
    options?: ShapefileOptions,
  ): Promise<ShapefileSource>;
}
