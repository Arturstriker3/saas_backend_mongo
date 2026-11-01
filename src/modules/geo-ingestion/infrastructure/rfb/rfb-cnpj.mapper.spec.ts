import { describe, expect, test } from 'bun:test';
import { splitCsvLine } from '../csv/csv.util';
import {
  ESTABLISHMENT_FIELD_COUNT,
  toCnaeInput,
  toEstablishmentInput,
  toIbgeMunicipalityCode,
} from './rfb-cnpj.mapper';

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

describe('toEstablishmentInput', () => {
  test('maps the RFB layout into the establishment row', () => {
    expect(toEstablishmentInput(establishmentFields())).toEqual({
      cnpj: '12345678000190',
      companyCode: '12345678',
      tradeName: 'PADARIA DO ZE',
      isHeadquarters: true,
      cnaeCode: '4721102',
      registrationStatus: 2,
      openedOn: '2010-05-15',
      cep: '49010000',
      uf: 'SE',
      municipalityCode: '2800308',
    });
  });

  test('maps a real, fully quoted line from the source', () => {
    expect(toEstablishmentInput(splitCsvLine(REAL_ESTABLISHMENT_LINE))).toEqual({
      cnpj: '34241547000109',
      companyCode: '34241547',
      tradeName: 'MERCANTIL MINIPRECO',
      isHeadquarters: true,
      cnaeCode: '4712100',
      registrationStatus: 8,
      openedOn: '1990-08-21',
      cep: '41830595',
      uf: 'BA',
      municipalityCode: '2938496',
    });
  });

  test('treats a branch flag different from 1 as not headquarters', () => {
    expect(toEstablishmentInput(establishmentFields({ 3: '2' }))?.isHeadquarters).toBe(false);
  });

  test('keeps unknown values as null instead of failing the run', () => {
    const row = toEstablishmentInput(
      establishmentFields({
        5: '',
        10: '00000000',
        11: '0000000',
        18: '00000000',
        19: 'EX',
        20: '',
      }),
    );

    expect(row).toMatchObject({
      cnaeCode: null,
      registrationStatus: null,
      openedOn: null,
      cep: null,
      uf: null,
      municipalityCode: null,
    });
  });

  test('rejects a line whose layout drifted', () => {
    expect(() => toEstablishmentInput(['12345678', '0001', '90'])).toThrow('layout changed');
  });

  test('rejects an invalid CNPJ', () => {
    expect(() => toEstablishmentInput(establishmentFields({ 2: 'XX' }))).toThrow('unexpected CNPJ');
  });

  test('skips a line without a CNPJ', () => {
    const fields = new Array<string>(ESTABLISHMENT_FIELD_COUNT).fill('');
    expect(toEstablishmentInput(fields)).toBeNull();
  });
});

describe('toIbgeMunicipalityCode', () => {
  test.each([
    ['SE', '0030', '2800308'],
    ['SP', '5030', '3550308'],
    ['RJ', '0455', '3304557'],
  ])('derives the IBGE code for %s %s', (uf, tomCode, expected) => {
    expect(toIbgeMunicipalityCode(uf, tomCode)).toBe(expected);
  });

  test('returns null for an establishment abroad', () => {
    expect(toIbgeMunicipalityCode('EX', '0000')).toBeNull();
  });

  test('returns null for an unknown UF', () => {
    expect(toIbgeMunicipalityCode('ZZ', '0030')).toBeNull();
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
