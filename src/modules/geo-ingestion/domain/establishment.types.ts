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
  cep: string | null;
  uf: string | null;
  municipalityCode: string | null;
}
