import type { RegionLevel } from '../../../../common/database/geo/geo-db.types';
import type { RegionInput } from '../../domain/region.types';

const CENSO_2022_BASE =
  'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022';

const BAIRROS_DIR = `${CENSO_2022_BASE}/bairros/shp/BR`;
const SETORES_UF_DIR = `${CENSO_2022_BASE}/setores/shp/UF`;

const UF_CODES = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

export interface ShapefileRegionConfig {
  datasetKey: string;
  /** Reference of the census vintage the archive belongs to. */
  defaultReference: string;
  /**
   * One zip per entry. Census tracts are consumed per state because the national
   * archive is packed with Deflate64, which the zip reader does not support.
   */
  urls: string[];
  sourceUrl: string;
  level: RegionLevel;
  codeField: string;
  nameField: string | null;
  namePrefix: string;
  parentField: string | null;
  parentCodeLength: number | null;
  sourceSrid: number;
  expectedMin: number;
  expectedMax: number;
  methodology: string;
}

export const BAIRRO_CONFIG: ShapefileRegionConfig = {
  datasetKey: 'ibge_bairro',
  defaultReference: '2022',
  urls: [`${BAIRROS_DIR}/BR_bairros_CD2022.zip`],
  sourceUrl: BAIRROS_DIR,
  level: 'neighborhood',
  codeField: 'CD_BAIRRO',
  nameField: 'NM_BAIRRO',
  namePrefix: '',
  parentField: 'CD_MUN',
  parentCodeLength: null,
  sourceSrid: 4674,
  expectedMin: 17_000,
  expectedMax: 19_000,
  methodology:
    'IBGE Malha de Bairros do Censo 2022 (shapefile, SIRGAS 2000); hierarquia municipal por CD_MUN',
};

export const SETOR_CONFIG: ShapefileRegionConfig = {
  datasetKey: 'ibge_setor',
  defaultReference: '2022',
  urls: UF_CODES.map((uf) => `${SETORES_UF_DIR}/${uf}_setores_CD2022.zip`),
  sourceUrl: SETORES_UF_DIR,
  level: 'sector',
  codeField: 'CD_SETOR',
  nameField: null,
  namePrefix: 'Setor ',
  parentField: null,
  parentCodeLength: 7,
  sourceSrid: 4674,
  expectedMin: 440_000,
  expectedMax: 500_000,
  methodology:
    'IBGE Malha de Setores Censitários do Censo 2022 por UF (shapefile, SIRGAS 2000); município derivado dos 7 primeiros dígitos do código do setor',
};

export interface ShapefileFeatureLike {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

/**
 * Converts a shapefile feature into a region row.
 * @param config - Dataset mapping.
 * @param feature - Feature read from the shapefile.
 * @param toGeometry - Normalizer that turns the geometry into GeoJSON MultiPolygon.
 * @param toSearchName - Normalizer for the search column.
 * @returns The region input, or null when the feature has no code or geometry.
 */
export function toRegionInput(
  config: ShapefileRegionConfig,
  feature: ShapefileFeatureLike,
  toGeometry: (geometry: { type: string; coordinates: unknown }, code: string) => string,
  toSearchName: (name: string) => string,
): RegionInput | null {
  const code = readText(feature.properties[config.codeField]);
  if (!code || !feature.geometry) return null;

  const name =
    (config.nameField ? readText(feature.properties[config.nameField]) : null) ??
    `${config.namePrefix}${code}`;

  return {
    level: config.level,
    ibgeCode: code,
    parentCode: resolveParentCode(config, feature, code),
    name,
    searchName: toSearchName(name),
    geometry: toGeometry(feature.geometry, code),
  };
}

function resolveParentCode(
  config: ShapefileRegionConfig,
  feature: ShapefileFeatureLike,
  code: string,
): string | null {
  if (config.parentField) return readText(feature.properties[config.parentField]);
  if (config.parentCodeLength) return code.slice(0, config.parentCodeLength);
  return null;
}

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
