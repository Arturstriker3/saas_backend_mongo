/** CNAE subclass (7 digits) with its official description. */
export interface CnaeInput {
  code: string;
  description: string;
}

/**
 * One establishment (CNPJ) with the attributes the product queries.
 * The municipality is the 7-digit IBGE code derived from the CNPJ `uf` + TOM code.
 */
export interface EstablishmentInput {
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
