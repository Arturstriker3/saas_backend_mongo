import type { AddressInput } from '../../domain/address.types';

/**
 * Column order of `Arquivos_CNEFE/CSV/UF/{uf}.csv`. The adapter refuses a file
 * whose header differs, because a shifted column would silently mis-geocode.
 */
export const CNEFE_HEADER = [
  'COD_UNICO_ENDERECO',
  'COD_UF',
  'COD_MUNICIPIO',
  'COD_DISTRITO',
  'COD_SUBDISTRITO',
  'COD_SETOR',
  'NUM_QUADRA',
  'NUM_FACE',
  'CEP',
  'DSC_LOCALIDADE',
  'NOM_TIPO_SEGLOGR',
  'NOM_TITULO_SEGLOGR',
  'NOM_SEGLOGR',
  'NUM_ENDERECO',
  'DSC_MODIFICADOR',
  'NOM_COMP_ELEM1',
  'VAL_COMP_ELEM1',
  'NOM_COMP_ELEM2',
  'VAL_COMP_ELEM2',
  'NOM_COMP_ELEM3',
  'VAL_COMP_ELEM3',
  'NOM_COMP_ELEM4',
  'VAL_COMP_ELEM4',
  'NOM_COMP_ELEM5',
  'VAL_COMP_ELEM5',
  'LATITUDE',
  'LONGITUDE',
  'NV_GEO_COORD',
  'COD_ESPECIE',
  'DSC_ESTABELECIMENTO',
  'COD_INDICADOR_ESTAB_ENDERECO',
  'COD_INDICADOR_CONST_ENDERECO',
  'COD_INDICADOR_FINALIDADE_CONST',
  'COD_TIPO_ESPECI',
] as const;

/** @param fields - Header fields of the CSV. */
export function isExpectedHeader(fields: string[]): boolean {
  if (fields.length !== CNEFE_HEADER.length) return false;

  return fields.every((field, index) => field.trim() === CNEFE_HEADER[index]);
}

/**
 * Maps one CSV record to storage.
 * @param fields - Fields of a data line, already split on `;`.
 * @returns The address, or null when the key fields are missing.
 */
export function toAddressRecord(fields: string[]): AddressInput | null {
  if (fields.length !== CNEFE_HEADER.length) return null;

  const id = toText(fields[0]);
  const ufCode = toText(fields[1]);
  const municipalityCode = toText(fields[2]);
  if (!id || !ufCode || !municipalityCode) return null;

  return {
    id,
    ufCode,
    municipalityCode,
    districtCode: toText(fields[3]),
    subdistrictCode: toText(fields[4]),
    sectorCode: toText(fields[5]),
    block: toText(fields[6]),
    face: toText(fields[7]),
    cep: toText(fields[8]),
    locality: toText(fields[9]),
    streetType: toText(fields[10]),
    streetTitle: toText(fields[11]),
    street: toText(fields[12]),
    streetNumber: toText(fields[13]),
    modifier: toText(fields[14]),
    complement: joinComplement(fields),
    latitude: toNumber(fields[25]),
    longitude: toNumber(fields[26]),
    geocodeLevel: toInteger(fields[27]),
    // Part of the primary key; the source always fills it, and 0 means unknown.
    speciesCode: toInteger(fields[28]) ?? 0,
    establishmentName: toText(fields[29]),
  };
}

/** The source publishes the complement as five type/value pairs. */
function joinComplement(fields: string[]): string | null {
  const parts: string[] = [];

  for (let index = 0; index < 5; index += 1) {
    const type = toText(fields[15 + index * 2]);
    const value = toText(fields[16 + index * 2]);
    const part = [type, value].filter(Boolean).join(' ');

    if (part) parts.push(part);
  }

  return parts.length > 0 ? parts.join(', ') : null;
}

function toText(value: string | undefined): string | null {
  if (value === undefined) return null;

  const cleaned = value.replace(/\u0000/g, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function toNumber(value: string | undefined): number | null {
  const text = toText(value);
  if (text === null) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: string | undefined): number | null {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}
