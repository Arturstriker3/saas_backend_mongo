import { describe, expect, test } from 'bun:test';
import { splitCsvLine } from '../csv/csv.util';
import {
  COMPANY_FIELD_COUNT,
  ESTABLISHMENT_FIELD_COUNT,
  normalizeName,
  toCnaeInput,
  toCompanyInput,
  toEstablishmentRecord,
  toMunicipalityInput,
  ufToIbgeCode,
} from './rfb-cnpj.mapper';

/** Real line from `Empresas9.zip` (2026-10), every field quoted. */
const REAL_COMPANY_LINE =
  '"36627969";"VINICIUS ESMERELI 23381366831";"2135";"50";"2000,00";"01";""';

/** Real line from `Estabelecimentos9.zip` (2026-10), every field quoted. */
const REAL_ESTABLISHMENT_LINE =
  '"34241547";"0001";"09";"1";"MERCANTIL MINIPRECO";"08";"19931123";"01";"";"";"19900821";' +
  '"4712100";"";"";"ALA  BENEVENTO";"245";"L 4 PARQUE J CESAR";"PITUBA";"41830595";"BA";' +
  '"3849";"";"";"";"";"";"";"";"";""';

function establishmentFields(overrides: Record<number, string> = {}): string[] {
  const fields = new Array<string>(ESTABLISHMENT_FIELD_COUNT).fill('');
  Object.assign(fields, {
    0: '12345678',
    1: '0001',
    2: '90',
    3: '1',
    4: 'PADARIA DO ZE',
    5: '02',
    6: '20200101',
    10: '20100515',
    11: '4721102',
    13: 'RUA',
    14: 'DA PRAIA',
    15: '100',
    17: 'CENTRO',
    18: '49010000',
    19: 'SE',
    20: '0030',
  });
  Object.assign(fields, overrides);
  return fields;
}

describe('toEstablishmentRecord', () => {
  test('maps the RFB layout into the establishment row', () => {
    expect(toEstablishmentRecord(establishmentFields())).toEqual({
      cnpj: '12345678000190',
      companyCode: '12345678',
      tradeName: 'PADARIA DO ZE',
      isHeadquarters: true,
      cnaeCode: '4721102',
      registrationStatus: 2,
      openedOn: '2010-05-15',
      streetType: 'RUA',
      street: 'DA PRAIA',
      streetNumber: '100',
      complement: null,
      neighborhood: 'CENTRO',
      cep: '49010000',
      uf: 'SE',
      tomCode: '0030',
    });
  });

  test('maps a real, fully quoted line from the source', () => {
    expect(toEstablishmentRecord(splitCsvLine(REAL_ESTABLISHMENT_LINE))).toEqual({
      cnpj: '34241547000109',
      companyCode: '34241547',
      tradeName: 'MERCANTIL MINIPRECO',
      isHeadquarters: true,
      cnaeCode: '4712100',
      registrationStatus: 8,
      openedOn: '1990-08-21',
      streetType: null,
      street: 'ALA  BENEVENTO',
      streetNumber: '245',
      complement: 'L 4 PARQUE J CESAR',
      neighborhood: 'PITUBA',
      cep: '41830595',
      uf: 'BA',
      tomCode: '3849',
    });
  });

  test('drops NUL bytes that would break the jsonb payload', () => {
    const row = toEstablishmentRecord(establishmentFields({ 4: 'PADARIA\u0000 DO ZE' }));

    expect(row?.tradeName).toBe('PADARIA DO ZE');
  });

  test('treats a branch flag different from 1 as not headquarters', () => {
    expect(toEstablishmentRecord(establishmentFields({ 3: '2' }))?.isHeadquarters).toBe(false);
  });

  test('keeps unknown values as null instead of failing the run', () => {
    const row = toEstablishmentRecord(
      establishmentFields({
        5: '',
        10: '00000000',
        11: '0000000',
        18: '00000000',
        19: 'EX',
        20: '000',
      }),
    );

    expect(row).toMatchObject({
      cnaeCode: null,
      registrationStatus: null,
      openedOn: null,
      cep: null,
      uf: null,
      tomCode: null,
    });
  });

  test('rejects a line whose layout drifted', () => {
    expect(() => toEstablishmentRecord(['12345678', '0001', '90'])).toThrow('layout changed');
  });

  test('accepts the alphanumeric CNPJ issued since 2026', () => {
    const row = toEstablishmentRecord(establishmentFields({ 0: '00000000', 1: 'e08g', 2: '12' }));

    expect(row?.cnpj).toBe('00000000E08G12');
    expect(row?.companyCode).toBe('00000000');
  });

  test('rejects an invalid CNPJ', () => {
    expect(() => toEstablishmentRecord(establishmentFields({ 2: 'XX' }))).toThrow(
      'unexpected CNPJ',
    );
  });

  test('skips a line without a CNPJ', () => {
    const fields = new Array<string>(ESTABLISHMENT_FIELD_COUNT).fill('');
    expect(toEstablishmentRecord(fields)).toBeNull();
  });
});

describe('toMunicipalityInput', () => {
  test('maps the TOM code and the name', () => {
    expect(toMunicipalityInput(['7107', 'SAO PAULO'])).toEqual({
      tomCode: '7107',
      name: 'SAO PAULO',
    });
  });

  test('skips a line without a code', () => {
    expect(toMunicipalityInput(['', 'SAO PAULO'])).toBeNull();
  });

  test('rejects a line whose layout drifted', () => {
    expect(() => toMunicipalityInput(['7107'])).toThrow('layout changed');
  });
});

describe('ufToIbgeCode', () => {
  test('maps a state to its IBGE code', () => {
    expect(ufToIbgeCode('SE')).toBe('28');
    expect(ufToIbgeCode('sp')).toBe('35');
  });

  test('returns null for an unknown or missing UF', () => {
    expect(ufToIbgeCode('ZZ')).toBeNull();
    expect(ufToIbgeCode(null)).toBeNull();
  });
});

describe('normalizeName', () => {
  test('removes diacritics and case so both sources compare', () => {
    expect(normalizeName('São Paulo')).toBe('sao paulo');
    expect(normalizeName('SAO PAULO')).toBe('sao paulo');
    expect(normalizeName('Pindaré-Mirim')).toBe('pindare mirim');
    expect(normalizeName("Sant'Ana do Livramento")).toBe('sant ana do livramento');
  });
});

describe('toCompanyInput', () => {
  test('maps a real, fully quoted line from the source', () => {
    expect(toCompanyInput(splitCsvLine(REAL_COMPANY_LINE))).toEqual({
      companyCode: '36627969',
      legalName: 'VINICIUS ESMERELI 23381366831',
      legalNatureCode: '2135',
      capitalSocial: 2000,
      sizeCode: '01',
    });
  });

  test('reads the amount with thousand separators', () => {
    const fields = new Array<string>(COMPANY_FIELD_COUNT).fill('');
    Object.assign(fields, { 0: '12345678', 1: 'ACME LTDA', 4: '1.234.567,89', 5: '05' });

    expect(toCompanyInput(fields)?.capitalSocial).toBe(1234567.89);
  });

  test('skips a record without a razão social and keeps unknown codes null', () => {
    const fields = new Array<string>(COMPANY_FIELD_COUNT).fill('');
    Object.assign(fields, { 0: '12345678' });

    expect(toCompanyInput(fields)).toBeNull();
  });

  test('accepts an alphanumeric company code', () => {
    const fields = new Array<string>(COMPANY_FIELD_COUNT).fill('');
    Object.assign(fields, { 0: '12AB34CD', 1: 'ACME LTDA' });

    expect(toCompanyInput(fields)?.companyCode).toBe('12AB34CD');
  });

  test('rejects a line whose layout drifted', () => {
    expect(() => toCompanyInput(['12345678', 'ACME LTDA'])).toThrow('layout changed');
  });
});

describe('toCnaeInput', () => {
  test('maps code and description', () => {
    expect(toCnaeInput(['4721102', 'Padaria e confeitaria com predominância de revenda'])).toEqual({
      code: '4721102',
      description: 'Padaria e confeitaria com predominância de revenda',
    });
  });

  test('rejects a code that is not 7 digits', () => {
    expect(() => toCnaeInput(['472110', 'Padaria'])).toThrow('unexpected code');
  });
});
