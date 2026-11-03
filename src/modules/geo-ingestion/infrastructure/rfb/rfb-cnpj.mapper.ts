import type {
  CnaeInput,
  CompanyInput,
  EstablishmentRecord,
  MunicipalityInput,
  SimplesInput,
} from '../../domain/establishment.types';

/** The RFB `Estabelecimentos` layout has 30 columns and no header. */
export const ESTABLISHMENT_FIELD_COUNT = 30;

/** The RFB `Empresas` layout has 7 columns and no header. */
export const COMPANY_FIELD_COUNT = 7;

/** The RFB `Municipios` layout has 2 columns: code and name. */
export const MUNICIPALITY_FIELD_COUNT = 2;

/** The RFB `Simples` layout has 7 columns and no header. */
export const SIMPLES_FIELD_COUNT = 7;

const CNAE_FIELD_COUNT = 2;
const DIGITS_ONLY = /^\d+$/;
const CNAE_CODE = /^\d{7}$/;
/**
 * Since 2026 the RFB issues alphanumeric CNPJs: the 12 root/order positions
 * accept `A-Z`, while the two check digits stay numeric.
 */
const CNPJ_CODE = /^[0-9A-Z]{12}\d{2}$/;
const COMPANY_CODE = /^[0-9A-Z]{8}$/;
const IBGE_UF_CODE: Record<string, string> = {
  RO: '11',
  AC: '12',
  AM: '13',
  RR: '14',
  PA: '15',
  AP: '16',
  TO: '17',
  MA: '21',
  PI: '22',
  CE: '23',
  RN: '24',
  PB: '25',
  PE: '26',
  AL: '27',
  SE: '28',
  BA: '29',
  MG: '31',
  ES: '32',
  RJ: '33',
  SP: '35',
  PR: '41',
  SC: '42',
  RS: '43',
  MS: '50',
  MT: '51',
  GO: '52',
  DF: '53',
};
/** Diacritics and anything that is not a letter, digit or space breaks the match. */
const DIACRITICS = /[\u0300-\u036f]/g;
const NOT_NAME = /[^\p{L}\p{N} ]/gu;

/**
 * Maps a `Cnaes.csv` line into the taxonomy row.
 * @param fields - Semicolon separated fields: code, description.
 * @returns The CNAE subclass, or null for a blank line.
 */
export function toCnaeInput(fields: string[]): CnaeInput | null {
  if (fields.length < CNAE_FIELD_COUNT) {
    throw new Error(
      `RFB CNAE layout changed; expected ${CNAE_FIELD_COUNT} fields, received ${fields.length}`,
    );
  }

  const code = fields[0].trim();
  if (code === '') return null;
  if (!CNAE_CODE.test(code)) {
    throw new Error(`RFB CNAE has an unexpected code: "${code}"`);
  }

  return { code, description: toText(fields[1]) ?? code };
}

/**
 * Maps a `Municipios.csv` line into the Receita Federal municipality.
 * @param fields - Semicolon separated fields: TOM code, name.
 * @returns The municipality, or null for a blank line.
 */
export function toMunicipalityInput(fields: string[]): MunicipalityInput | null {
  if (fields.length < MUNICIPALITY_FIELD_COUNT) {
    throw new Error(
      `RFB municipios layout changed; expected ${MUNICIPALITY_FIELD_COUNT} fields, ` +
        `received ${fields.length}`,
    );
  }

  const tomCode = toCode(fields[0], 4);
  const name = toText(fields[1]);
  if (tomCode === null || name === null) return null;

  return { tomCode, name };
}

/**
 * Maps an `Estabelecimentos{n}.csv` line into the establishment row.
 * @param fields - Semicolon separated fields of the RFB layout.
 * @returns The establishment, or null for a blank line.
 */
export function toEstablishmentRecord(fields: string[]): EstablishmentRecord | null {
  if (fields.length < ESTABLISHMENT_FIELD_COUNT) {
    throw new Error(
      `RFB estabelecimentos layout changed; expected ${ESTABLISHMENT_FIELD_COUNT} fields, ` +
        `received ${fields.length}`,
    );
  }

  const companyCode = fields[0].trim().toUpperCase();
  const cnpj = `${companyCode}${fields[1].trim().toUpperCase()}${fields[2].trim()}`;
  if (cnpj === '') return null;
  if (!CNPJ_CODE.test(cnpj)) {
    throw new Error(`RFB estabelecimentos has an unexpected CNPJ: "${cnpj}"`);
  }

  return {
    cnpj,
    companyCode,
    tradeName: toText(fields[4]),
    isHeadquarters: fields[3].trim() === '1',
    cnaeCode: toCnaeCode(fields[11]),
    registrationStatus: toRegistrationStatus(fields[5]),
    openedOn: toIsoDate(fields[10]),
    streetType: toText(fields[13]),
    street: toText(fields[14]),
    streetNumber: toText(fields[15]),
    complement: toText(fields[16]),
    neighborhood: toText(fields[17]),
    cep: toCep(fields[18]),
    uf: toUf(fields[19]),
    tomCode: toCode(fields[20], 4),
  };
}

/**
 * Maps an `Empresas{n}.csv` line into the company row.
 * @param fields - Semicolon separated fields of the RFB layout.
 * @returns The company, or null for a blank line or a record without a razão social.
 */
export function toCompanyInput(fields: string[]): CompanyInput | null {
  if (fields.length < COMPANY_FIELD_COUNT) {
    throw new Error(
      `RFB empresas layout changed; expected ${COMPANY_FIELD_COUNT} fields, ` +
        `received ${fields.length}`,
    );
  }

  const companyCode = fields[0].trim().toUpperCase();
  if (companyCode === '') return null;
  if (!COMPANY_CODE.test(companyCode)) {
    throw new Error(`RFB empresas has an unexpected company code: "${companyCode}"`);
  }

  // A record without the razão social is unusable (the name is the whole point of
  // this table) and, when the code repeats, would break the primary key.
  const legalName = toText(fields[1]);
  if (legalName === null) return null;

  return {
    companyCode,
    legalName,
    legalNatureCode: toCode(fields[2], 4),
    capitalSocial: toMoney(fields[4]),
    sizeCode: toCode(fields[5], 2),
  };
}

/**
 * Maps a `Simples.csv` line into the Simples and MEI option of the company.
 * @param fields - Semicolon separated fields of the RFB layout.
 * @returns The option, or null for a blank line.
 */
export function toSimplesInput(fields: string[]): SimplesInput | null {
  if (fields.length < SIMPLES_FIELD_COUNT) {
    throw new Error(
      `RFB simples layout changed; expected ${SIMPLES_FIELD_COUNT} fields, ` +
        `received ${fields.length}`,
    );
  }

  const companyCode = fields[0].trim().toUpperCase();
  if (companyCode === '') return null;
  if (!COMPANY_CODE.test(companyCode)) {
    throw new Error(`RFB simples has an unexpected company code: "${companyCode}"`);
  }

  return {
    companyCode,
    simplesOption: toFlag(fields[1]),
    simplesSince: toIsoDate(fields[2]),
    simplesUntil: toIsoDate(fields[3]),
    meiOption: toFlag(fields[4]),
    meiSince: toIsoDate(fields[5]),
    meiUntil: toIsoDate(fields[6]),
  };
}

/**
 * IBGE code of a state, used to narrow the municipality match.
 * @param uf - Two-letter state code.
 * @returns The 2-digit IBGE code, or null for an unknown UF (`EX` included).
 */
export function ufToIbgeCode(uf: string | null): string | null {
  if (uf === null) return null;
  return IBGE_UF_CODE[uf.toUpperCase()] ?? null;
}

/**
 * Normalizes a municipality name the same way `geo.region.search_name` is built:
 * lower case, no diacritics, single spaces.
 * @param name - Municipality name as published.
 * @returns The comparable form.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(NOT_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** `jsonb` rejects the `\u0000` escape, so NUL bytes from the source are dropped. */
const NUL = /\u0000/g;

function toText(raw: string | undefined): string | null {
  const value = (raw ?? '').replace(NUL, '').trim();
  return value === '' ? null : value;
}

/** `EX` marks an establishment abroad, which is not a Brazilian state. */
function toUf(raw: string | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value) || value === 'EX') return null;
  return value;
}

/** The RFB publishes `S` for an option the company took and `N` otherwise. */
function toFlag(raw: string | undefined): boolean {
  return (raw ?? '').trim().toUpperCase() === 'S';
}

function toCnaeCode(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '0000000' || !CNAE_CODE.test(value)) return null;
  return value;
}

/** A numeric code of fixed width, used by natureza jurídica, porte and TOM. */
function toCode(raw: string | undefined, width: number): string | null {
  const value = (raw ?? '').trim();
  if (value.length !== width || !DIGITS_ONLY.test(value)) return null;
  return value;
}

/** The RFB publishes money with a comma decimal separator, e.g. `2.000,00`. */
function toMoney(raw: string | undefined): number | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;

  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function toRegistrationStatus(raw: string | undefined): number | null {
  const value = (raw ?? '').trim();
  if (!DIGITS_ONLY.test(value)) return null;

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoDate(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!/^\d{8}$/.test(value) || value === '00000000') return null;

  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function toCep(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!/^\d{8}$/.test(value) || value === '00000000') return null;
  return value;
}
