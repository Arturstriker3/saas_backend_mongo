/** CNAE subclass (7 digits) with its official description. */
export interface CnaeInput {
  code: string;
  description: string;
}

/** Municipality as the Receita Federal publishes it: a TOM code and a name. */
export interface MunicipalityInput {
  tomCode: string;
  name: string;
}

/**
 * One establishment (CNPJ) exactly as the source layouts it. The municipality
 * still has to be translated: the RFB `TOM` code is its own numbering, not the
 * IBGE code.
 */
export interface EstablishmentRecord {
  cnpj: string;
  companyCode: string;
  tradeName: string | null;
  isHeadquarters: boolean;
  cnaeCode: string | null;
  registrationStatus: number | null;
  /** `YYYY-MM-DD`; null when the source publishes zeros. */
  openedOn: string | null;
  streetType: string | null;
  street: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  cep: string | null;
  uf: string | null;
  /** Receita Federal municipality code; resolved into IBGE before publishing. */
  tomCode: string | null;
}

/** An establishment ready to be published, with the 7-digit IBGE municipality. */
export interface EstablishmentInput extends EstablishmentRecord {
  municipalityCode: string | null;
}

/**
 * The company behind one or more establishments, keyed by the CNPJ root.
 * Holds the official name, which the establishment row does not carry.
 */
export interface CompanyInput {
  companyCode: string;
  legalName: string;
  legalNatureCode: string | null;
  /** Size band published by the RFB: `00` not informed, `01` MEI, `03` EPP, `05` others. */
  sizeCode: string | null;
  capitalSocial: number | null;
}
