import { Inject, Injectable, Logger } from '@nestjs/common';
import type { RegionLevel } from '../../../../common/database/geo/geo-db.types';
import { toSearchName } from '../../../../common/text/search-name';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import { DATASET_PUBLISHER, type DatasetPublisher } from '../../domain/dataset-publisher.interface';
import type { RegionInput } from '../../domain/region.types';
import { regionFingerprint, checksumOf } from '../geojson/fingerprint';
import { toMultiPolygonGeoJson } from '../geojson/geometry';
import {
  IbgeMalhaClient,
  type IbgeAreaShape,
  type IbgeMunicipality,
} from '../ibge/ibge-malha.client';
import type { GeoJsonGeometry } from '../geojson/geometry';

const EXPECTED_STATES = 27;
const MIN_MUNICIPALITIES = 5_500;
const MAX_MUNICIPALITIES = 5_800;
const MAX_MISSING_SHAPES = 10;
const SOURCE_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas';
const METHODOLOGY =
  'IBGE Malhas Territoriais via API v3 (qualidade=intermediaria), hierarquia da API de Localidades';

@Injectable()
export class IbgeMalhaAdapter implements DatasetAdapter {
  readonly datasetKey = 'ibge_malha';
  /** The API always serves the latest release, so the reference labels the vintage. */
  readonly defaultReference = '2022';
  private readonly logger = new Logger('IbgeMalhaAdapter');

  constructor(
    private readonly client: IbgeMalhaClient,
    @Inject(DATASET_PUBLISHER) private readonly publisher: DatasetPublisher,
  ) {}

  async ingest(reference: string): Promise<void> {
    const [states, municipalities] = await Promise.all([
      this.client.fetchStates(),
      this.client.fetchMunicipalities(),
    ]);
    this.assertTotals(states.length, municipalities.length);

    const municipalitiesByUf = groupByUf(municipalities);
    const regions: RegionInput[] = [];
    const fingerprints: string[] = [];
    const missingShapes: string[] = [];
    const orphanShapes: string[] = [];

    for (const [index, state] of states.entries()) {
      const stateCode = String(state.id);
      const [stateShape, municipalityShapes] = await Promise.all([
        this.client.fetchStateShape(state.id),
        this.client.fetchMunicipalityShapes(state.id),
      ]);

      const built = buildMunicipalities(
        stateCode,
        municipalityShapes,
        municipalitiesByUf.get(state.id) ?? [],
        fingerprints,
      );

      regions.push(
        buildRegion('state', stateCode, null, state.nome, stateShape.geometry, fingerprints),
      );
      regions.push(...built.regions);
      missingShapes.push(...built.missingShapes);
      orphanShapes.push(...built.orphanShapes);

      if ((index + 1) % 5 === 0 || index === states.length - 1) {
        this.logger.log(`Fetched ${index + 1}/${states.length} states`);
      }
    }

    this.reportGaps(missingShapes, orphanShapes);
    this.assertMunicipalitiesMatch(regions);

    const result = await this.publisher.publish({
      datasetKey: this.datasetKey,
      reference,
      methodology: METHODOLOGY,
      sourceUrl: SOURCE_URL,
      checksum: checksumOf(fingerprints),
      extractedAt: new Date(),
      sourceSrid: 4326,
      regions,
    });

    this.logger.log(
      `Published ${this.datasetKey} ${reference}: ${result.inserted} added, ${result.updated} updated`,
    );
  }

  private assertTotals(stateCount: number, municipalityCount: number): void {
    if (stateCount !== EXPECTED_STATES) {
      throw new Error(`Expected ${EXPECTED_STATES} states, received ${stateCount}`);
    }

    if (municipalityCount < MIN_MUNICIPALITIES || municipalityCount > MAX_MUNICIPALITIES) {
      throw new Error(
        `Municipality count ${municipalityCount} is outside ${MIN_MUNICIPALITIES}-${MAX_MUNICIPALITIES}`,
      );
    }
  }

  private assertMunicipalitiesMatch(regions: RegionInput[]): void {
    const municipalities = regions.filter((region) => region.level === 'municipality').length;
    if (municipalities === 0) throw new Error('No municipality was produced');
  }

  /**
   * Logs source gaps and refuses to publish when they grow beyond the tolerance.
   * A municipality created after the malha vintage legitimately has no shape.
   */
  private reportGaps(missingShapes: string[], orphanShapes: string[]): void {
    if (missingShapes.length > 0) {
      this.logger.warn(
        `${missingShapes.length} municipality(ies) without shape: ${missingShapes.join(', ')}`,
      );
    }

    if (orphanShapes.length > 0) {
      this.logger.warn(`${orphanShapes.length} shape(s) without name: ${orphanShapes.join(', ')}`);
    }

    if (missingShapes.length > MAX_MISSING_SHAPES) {
      throw new Error(
        `${missingShapes.length} municipalities without shape exceeds the tolerance of ${MAX_MISSING_SHAPES}`,
      );
    }
  }
}

interface MunicipalityBuild {
  regions: RegionInput[];
  missingShapes: string[];
  orphanShapes: string[];
}

function groupByUf(municipalities: IbgeMunicipality[]): Map<number, IbgeMunicipality[]> {
  const grouped = new Map<number, IbgeMunicipality[]>();

  for (const municipality of municipalities) {
    const current = grouped.get(municipality.ufId) ?? [];
    current.push(municipality);
    grouped.set(municipality.ufId, current);
  }

  return grouped;
}

function buildMunicipalities(
  stateCode: string,
  shapes: IbgeAreaShape[],
  municipalities: IbgeMunicipality[],
  fingerprints: string[],
): MunicipalityBuild {
  const namesByCode = new Map(municipalities.map((item) => [String(item.id), item.nome]));
  const shapeCodes = new Set(shapes.map((shape) => shape.code));

  const regions: RegionInput[] = [];
  for (const shape of shapes) {
    const name = namesByCode.get(shape.code);
    if (!name) continue;
    regions.push(
      buildRegion('municipality', shape.code, stateCode, name, shape.geometry, fingerprints),
    );
  }

  return {
    regions,
    missingShapes: municipalities
      .map((item) => String(item.id))
      .filter((code) => !shapeCodes.has(code))
      .map((code) => `${stateCode}:${code}`),
    orphanShapes: shapes
      .filter((shape) => !namesByCode.has(shape.code))
      .map((shape) => `${stateCode}:${shape.code}`),
  };
}

function buildRegion(
  level: RegionLevel,
  ibgeCode: string,
  parentCode: string | null,
  name: string,
  geometry: GeoJsonGeometry,
  fingerprints: string[],
): RegionInput {
  const geoJson = toMultiPolygonGeoJson(geometry, ibgeCode);
  fingerprints.push(regionFingerprint(level, ibgeCode, geoJson));

  return {
    level,
    ibgeCode,
    parentCode,
    name,
    searchName: toSearchName(name),
    geometry: geoJson,
  };
}
