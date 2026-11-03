/** One CNEFE address, normalized for storage. */
export interface AddressInput {
  /** `COD_UNICO_ENDERECO`. */
  id: string;
  ufCode: string;
  municipalityCode: string;
  districtCode: string | null;
  subdistrictCode: string | null;
  sectorCode: string | null;
  block: string | null;
  face: string | null;
  cep: string | null;
  locality: string | null;
  streetType: string | null;
  streetTitle: string | null;
  street: string | null;
  streetNumber: string | null;
  modifier: string | null;
  /** The five complement pairs joined into one readable string. */
  complement: string | null;
  latitude: number | null;
  longitude: number | null;
  geocodeLevel: number | null;
  /** Part of the natural key: the same address is published once per species. */
  speciesCode: number;
  establishmentName: string | null;
}
