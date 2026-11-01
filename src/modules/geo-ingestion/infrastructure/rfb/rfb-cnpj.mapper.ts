import type { CnaeInput, CompanyInput, EstablishmentInput } from '../../domain/establishment.types';

/** The RFB `Estabelecimentos` layout has 30 columns and no header. */
export const ESTABLISHMENT_FIELD_COUNT = 30;

/** The RFB `Empresas` layout has 7 columns and no header. */
export const COMPANY_FIELD_COUNT = 7;

const CNAE_FIELD_COUNT = 2;
const DIGITS_ONLY = /^\d+$/;
const CNAE_CODE = /^\d{7}$/;
const CNPJ_CODE = /^\d{14}$/;
const COMPANY_CODE = /^\d{8}$/;
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
 * Maps an `Estabelecimentos{n}.csv` line into the establishment row.
 * @param fields - Semicolon separated fields of the RFB layout.
 * @returns The establishment, or null for a blank line.
 */
export function toEstablishmentInput(fields: string[]): EstablishmentInput | null {
  if (fields.length < ESTABLISHMENT_FIELD_COUNT) {
    throw new Error(
      `RFB estabelecimentos layout changed; expected ${ESTABLISHMENT_FIELD_COUNT} fields, ` +
        `received ${fields.length}`,
    );
  }

  const companyCode = fields[0].trim();
  const cnpj = `${companyCode}${fields[1].trim()}${fields[2].trim()}`;
  if (cnpj === '') return null;
  if (!CNPJ_CODE.test(cnpj)) {
    throw new Error(`RFB estabelecimentos has an unexpected CNPJ: "${cnpj}"`);
  }

  const uf = toUf(fields[19]);

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
    uf,
    municipalityCode: uf ? toIbgeMunicipalityCode(uf, fields[20].trim()) : null,
  };
}

/**
 * Maps an `Empresas{n}.csv` line into the company row.
 * @param fields - Semicolon separated fields of the RFB layout.
 * @returns The company, or null for a blank line.
 */
export function toCompanyInput(fields: string[]): CompanyInput | null {
  if (fields.length < COMPANY_FIELD_COUNT) {
    throw new Error(
      `RFB empresas layout changed; expected ${COMPANY_FIELD_COUNT} fields, ` +
        `received ${fields.length}`,
    );
  }

  const companyCode = fields[0].trim();
  if (companyCode === '') return null;
  if (!COMPANY_CODE.test(companyCode)) {
    throw new Error(`RFB empresas has an unexpected company code: "${companyCode}"`);
  }

  return {
    companyCode,
    legalName: toText(fields[1]) ?? companyCode,
    legalNatureCode: toCode(fields[2], 4),
    capitalSocial: toMoney(fields[4]),
    sizeCode: toCode(fields[5], 2),
  };
}

/**
 * Builds the 7-digit IBGE municipality code from the CNPJ `uf` and TOM code.
 * Establishments abroad (`EX`) or with an unknown UF have no municipality.
 * @param uf - Two-letter state code.
 * @param tomCode - 4-digit TOM code published by the RFB.
 * @returns The IBGE code with its check digit, or null when it cannot be resolved.
 */
export function toIbgeMunicipalityCode(uf: string, tomCode: string): string | null {
  const ufCode = IBGE_UF_CODE[uf];
  if (!ufCode || !/^\d{4}$/.test(tomCode)) return null;

  const base = `${ufCode}${tomCode}`;
  return `${base}${municipalityCheckDigit(base)}`;
}

/**
 * IBGE check digit: alternate weights 1 and 2, sum the digits of each product
 * and take the ten's complement.
 */
function municipalityCheckDigit(base: string): number {
  let sum = 0;

  for (let index = 0; index < base.length; index += 1) {
    const product = Number(base[index]) * (index % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 10) + (product % 10);
  }

  return (10 - (sum % 10)) % 10;
}

function toText(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  return value === '' ? null : value;
}

/** `EX` marks an establishment abroad, which is not a Brazilian state. */
function toUf(raw: string | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value) || value === 'EX') return null;
  return value;
}

function toCnaeCode(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '' || value === '0000000' || !DIGITS_ONLY.test(value)) return null;
  return value;
}

/** A numeric code of fixed width, used by natureza jurídica and porte. */
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
