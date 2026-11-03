import { CNEFE_HEADER, isExpectedHeader, toAddressRecord } from './cnefe.mapper';

const HEADER = CNEFE_HEADER.join(';');
const RESIDENTIAL =
  '1189440;11;1100015;110001505;11000150500;110001505000008P;1;5;76954000;TUCANO;AVENIDA;;BRASIL;2338;;;;;;;;;;;;-11.929664;-62.008948;1;1;;;;;101';
const COMMERCIAL =
  '180191467;11;1100015;110001505;11000150500;110001505000008P;1;5;76954000;TUCANO;AVENIDA;;BRASIL;2302;;;;;;;;;;;;-11.929603;-62.009245;1;6;CEREALISTA ESPIGA DE OURO;1;;;';

describe('cnefe mapper', () => {
  it('accepts the published header', () => {
    expect(isExpectedHeader(HEADER.split(';'))).toBe(true);
  });

  it('rejects a header with a different column order', () => {
    const shifted = [...HEADER.split(';')];
    shifted[9] = 'OUTRO';
    expect(isExpectedHeader(shifted)).toBe(false);
  });

  it('maps a residential address', () => {
    const record = toAddressRecord(RESIDENTIAL.split(';'));

    expect(record).toEqual({
      id: '1189440',
      ufCode: '11',
      municipalityCode: '1100015',
      districtCode: '110001505',
      subdistrictCode: '11000150500',
      sectorCode: '110001505000008P',
      block: '1',
      face: '5',
      cep: '76954000',
      locality: 'TUCANO',
      streetType: 'AVENIDA',
      streetTitle: null,
      street: 'BRASIL',
      streetNumber: '2338',
      modifier: null,
      complement: null,
      latitude: -11.929664,
      longitude: -62.008948,
      geocodeLevel: 1,
      speciesCode: 1,
      establishmentName: null,
    });
  });

  it('keeps the establishment name and drops rows without the key', () => {
    const commercial = toAddressRecord(COMMERCIAL.split(';'));
    expect(commercial?.establishmentName).toBe('CEREALISTA ESPIGA DE OURO');
    expect(commercial?.speciesCode).toBe(6);

    const noId = COMMERCIAL.split(';');
    noId[0] = '';
    expect(toAddressRecord(noId)).toBeNull();
  });

  it('joins the five complement pairs', () => {
    const fields = RESIDENTIAL.split(';');
    fields[15] = 'BLOCO';
    fields[16] = 'A';
    fields[17] = 'APTO';
    fields[18] = '101';

    expect(toAddressRecord(fields)?.complement).toBe('BLOCO A, APTO 101');
  });

  it('rejects a line with the wrong number of fields', () => {
    expect(toAddressRecord(RESIDENTIAL.split(';').slice(0, 10))).toBeNull();
  });
});
