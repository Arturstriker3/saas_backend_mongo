import type { RegionDatasetEvidence } from './region-view.types';

/** RFB registration status codes published in the CNPJ registry. */
export const REGISTRATION_STATUS_LABELS: Record<number, string> = {
  1: 'Nula',
  2: 'Ativa',
  3: 'Suspensa',
  4: 'Inapta',
  8: 'Baixada',
};

export interface CnaeView {
  code: string | null;
  description: string | null;
}

export interface EstablishmentAddressView {
  streetType: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  cep: string | null;
}

export interface EstablishmentLocationView {
  municipalityCode: string | null;
  municipalityName: string | null;
  uf: string | null;
}

export interface EstablishmentSummary {
  cnpj: string;
  cnpjBasico: string;
  tradeName: string | null;
  legalName: string | null;
  isHeadquarters: boolean;
  registrationStatus: number | null;
  registrationStatusLabel: string | null;
  openedOn: string | null;
  cnae: CnaeView;
  address: EstablishmentAddressView;
  location: EstablishmentLocationView;
}

export interface EstablishmentDetail extends EstablishmentSummary {
  dataset: RegionDatasetEvidence | null;
}

export interface EstablishmentPage {
  items: EstablishmentSummary[];
  /** Keyset to send as `cursor` to read the next page; null on the last page. */
  nextCursor: string | null;
}

export interface CompanyProfile {
  cnpjBasico: string;
  legalName: string;
  legalNatureCode: string | null;
  sizeCode: string | null;
  capitalSocial: number | null;
  establishmentCount: number;
  activeEstablishmentCount: number;
  establishments: EstablishmentSummary[];
  dataset: RegionDatasetEvidence | null;
}
