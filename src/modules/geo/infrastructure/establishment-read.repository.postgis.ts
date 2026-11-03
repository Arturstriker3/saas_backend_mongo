import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../common/database/geo/geo.connection';
import type {
  EstablishmentReadRepository,
  ListEstablishmentsFilter,
  SearchEstablishmentsFilter,
} from '../domain/establishment-read.repository.interface';
import {
  REGISTRATION_STATUS_LABELS,
  type CompanyProfile,
  type EstablishmentDetail,
  type EstablishmentPage,
  type EstablishmentSummary,
  type TaxRegimeView,
} from '../domain/establishment-view.types';

interface EstablishmentRow {
  cnpj: string;
  cnpjBasico: string;
  tradeName: string | null;
  legalName: string | null;
  isHeadquarters: boolean;
  registrationStatus: number | null;
  openedOn: string | null;
  cnaeCode: string | null;
  cnaeDescription: string | null;
  streetType: string | null;
  street: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  cep: string | null;
  municipalityCode: string | null;
  municipalityName: string | null;
  uf: string | null;
  datasetKey: string | null;
  reference: string | null;
  publishedAt: Date | null;
}

interface CompanyRow {
  cnpjBasico: string;
  legalName: string;
  legalNatureCode: string | null;
  sizeCode: string | null;
  capitalSocial: number | null;
  simplesOption: boolean | null;
  simplesSince: string | null;
  simplesUntil: string | null;
  meiOption: boolean | null;
  meiSince: string | null;
  meiUntil: string | null;
  establishmentCount: number;
  activeEstablishmentCount: number;
  datasetKey: string | null;
  reference: string | null;
  publishedAt: Date | null;
}

/**
 * The three joins every establishment read needs: the legal name lives on the
 * company root, the CNAE description on the taxonomy and the city name on the
 * official IBGE registry. All three are primary key lookups.
 */
const ESTABLISHMENT_JOINS = sql`
  LEFT JOIN geo.company AS company ON company.cnpj_basico = establishment.cnpj_basico
  LEFT JOIN geo.cnae AS cnae ON cnae.code = establishment.cnae_principal
  LEFT JOIN geo.locality AS locality
    ON locality.level = 'municipality'
   AND locality.ibge_code = establishment.municipality_code
`;

const ESTABLISHMENT_COLUMNS = sql`
  establishment.cnpj AS "cnpj",
  establishment.cnpj_basico AS "cnpjBasico",
  establishment.trade_name AS "tradeName",
  company.legal_name AS "legalName",
  establishment.is_headquarters AS "isHeadquarters",
  establishment.registration_status AS "registrationStatus",
  establishment.opened_on::text AS "openedOn",
  establishment.cnae_principal AS "cnaeCode",
  cnae.description AS "cnaeDescription",
  establishment.street_type AS "streetType",
  establishment.street AS "street",
  establishment.street_number AS "streetNumber",
  establishment.complement AS "complement",
  establishment.neighborhood AS "neighborhood",
  establishment.cep AS "cep",
  establishment.municipality_code AS "municipalityCode",
  locality.name AS "municipalityName",
  COALESCE(locality.uf_sigla, establishment.uf) AS "uf"
`;

@Injectable()
export class EstablishmentReadRepositoryPostgis implements EstablishmentReadRepository {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async findByCnpj(cnpj: string): Promise<EstablishmentDetail | null> {
    const { rows } = await sql<EstablishmentRow>`
      SELECT ${ESTABLISHMENT_COLUMNS},
             version.dataset_key AS "datasetKey",
             version.reference AS "reference",
             version.published_at AS "publishedAt"
      FROM geo.establishment AS establishment
      ${ESTABLISHMENT_JOINS}
      LEFT JOIN geo.dataset_version AS version
        ON version.id = establishment.dataset_version_id
      WHERE establishment.cnpj = ${cnpj}
      LIMIT 1
    `.execute(this.db);

    const row = rows[0];
    if (!row) return null;

    return {
      ...toSummary(row),
      dataset: toEvidence(row),
    };
  }

  async findCompany(
    cnpjBasico: string,
    limit: number,
    offset: number,
  ): Promise<CompanyProfile | null> {
    const { rows: companies } = await sql<CompanyRow>`
      SELECT company.cnpj_basico AS "cnpjBasico",
             company.legal_name AS "legalName",
             company.legal_nature_code AS "legalNatureCode",
             company.size_code AS "sizeCode",
             company.capital_social::float8 AS "capitalSocial",
             simples.simples_option AS "simplesOption",
             simples.simples_since::text AS "simplesSince",
             simples.simples_until::text AS "simplesUntil",
             simples.mei_option AS "meiOption",
             simples.mei_since::text AS "meiSince",
             simples.mei_until::text AS "meiUntil",
             (SELECT count(*)
                FROM geo.establishment AS branch
               WHERE branch.cnpj_basico = company.cnpj_basico)::int AS "establishmentCount",
             (SELECT count(*)
                FROM geo.establishment AS branch
               WHERE branch.cnpj_basico = company.cnpj_basico
                 AND branch.registration_status = 2)::int AS "activeEstablishmentCount",
             version.dataset_key AS "datasetKey",
             version.reference AS "reference",
             version.published_at AS "publishedAt"
      FROM geo.company AS company
      LEFT JOIN geo.company_simples AS simples
        ON simples.cnpj_basico = company.cnpj_basico
      LEFT JOIN geo.dataset_version AS version
        ON version.id = company.dataset_version_id
      WHERE company.cnpj_basico = ${cnpjBasico}
      LIMIT 1
    `.execute(this.db);

    const company = companies[0];
    if (!company) return null;

    const { rows } = await sql<EstablishmentRow>`
      SELECT ${ESTABLISHMENT_COLUMNS}
      FROM geo.establishment AS establishment
      ${ESTABLISHMENT_JOINS}
      WHERE establishment.cnpj_basico = ${cnpjBasico}
      ORDER BY establishment.is_headquarters DESC, establishment.cnpj
      LIMIT ${limit} OFFSET ${offset}
    `.execute(this.db);

    return {
      cnpjBasico: company.cnpjBasico,
      legalName: company.legalName,
      legalNatureCode: company.legalNatureCode,
      sizeCode: company.sizeCode,
      capitalSocial: company.capitalSocial,
      simples: toRegime(company.simplesOption, company.simplesSince, company.simplesUntil),
      mei: toRegime(company.meiOption, company.meiSince, company.meiUntil),
      establishmentCount: company.establishmentCount,
      activeEstablishmentCount: company.activeEstablishmentCount,
      establishments: rows.map(toSummary),
      dataset: toEvidence(company),
    };
  }

  /**
   * Lists active establishments of a municipality ordered by CNAE and CNPJ.
   * The ordering matches `establishment_active_municipality_cnae`, so the scan
   * stops after `limit` rows instead of sorting the whole municipality.
   */
  async list(filter: ListEstablishmentsFilter): Promise<EstablishmentPage> {
    const conditions = [
      sql`establishment.municipality_code = ${filter.municipalityCode}`,
      sql`establishment.registration_status = 2`,
    ];

    if (filter.cnaeRange) {
      conditions.push(
        sql`establishment.cnae_principal BETWEEN ${filter.cnaeRange.from} AND ${filter.cnaeRange.to}`,
      );
    }

    if (filter.cursor) {
      conditions.push(
        sql`(establishment.cnae_principal, establishment.cnpj)
            > (${filter.cursor.cnae}, ${filter.cursor.cnpj})`,
      );
    }

    const { rows } = await sql<EstablishmentRow>`
      SELECT ${ESTABLISHMENT_COLUMNS}
      FROM geo.establishment AS establishment
      ${ESTABLISHMENT_JOINS}
      WHERE ${sql.join(conditions, sql` AND `)}
      ORDER BY establishment.cnae_principal, establishment.cnpj
      LIMIT ${filter.limit + 1}
    `.execute(this.db);

    const page = rows.slice(0, filter.limit);
    const last = page.at(-1);
    const hasMore = rows.length > filter.limit;

    return {
      items: page.map(toSummary),
      nextCursor: hasMore && last?.cnpj && last.cnaeCode ? `${last.cnaeCode}:${last.cnpj}` : null,
    };
  }

  /**
   * Searches by the company legal name, the official name every establishment
   * inherits from its root. Trade names stay out: the trigram scan returns tens
   * of thousands of rows for a common word and each one costs a heap fetch in a
   * 35M-row table, which turned a simple search into minutes.
   */
  async search(filter: SearchEstablishmentsFilter): Promise<EstablishmentSummary[]> {
    const { term, limit, municipalityCode } = filter;

    // The candidate list is built before the join, so it has to be restricted
    // as well: a company whose every branch is closed would otherwise take a
    // slot and leave the page with fewer rows than asked for.
    const candidateMunicipality = municipalityCode
      ? sql`AND branch.municipality_code = ${municipalityCode}`
      : sql``;

    const resultMunicipality = municipalityCode
      ? sql`AND establishment.municipality_code = ${municipalityCode}`
      : sql``;

    const { rows } = await sql<EstablishmentRow>`
      WITH candidate AS (
        SELECT company.cnpj_basico,
               similarity(company.legal_name, upper(${term})) AS score
        FROM geo.company AS company
        WHERE company.legal_name ILIKE '%' || ${term} || '%'
          AND EXISTS (
            SELECT 1
              FROM geo.establishment AS branch
             WHERE branch.cnpj_basico = company.cnpj_basico
               AND branch.registration_status = 2
             ${candidateMunicipality})
        ORDER BY score DESC
        LIMIT ${limit}
      )
      SELECT ${ESTABLISHMENT_COLUMNS}
      FROM candidate
      JOIN geo.establishment AS establishment
        ON establishment.cnpj_basico = candidate.cnpj_basico
      ${ESTABLISHMENT_JOINS}
      WHERE establishment.registration_status = 2
        ${resultMunicipality}
      ORDER BY candidate.score DESC, establishment.cnpj
      LIMIT ${limit}
    `.execute(this.db);

    return rows.map(toSummary);
  }
}

/**
 * Flattens a joined row into the API shape.
 * @param row - Row built from `ESTABLISHMENT_COLUMNS`.
 * @returns The establishment summary.
 */
function toSummary(row: EstablishmentRow): EstablishmentSummary {
  return {
    cnpj: row.cnpj,
    cnpjBasico: row.cnpjBasico,
    tradeName: row.tradeName,
    legalName: row.legalName,
    isHeadquarters: row.isHeadquarters,
    registrationStatus: row.registrationStatus,
    registrationStatusLabel:
      row.registrationStatus === null
        ? null
        : (REGISTRATION_STATUS_LABELS[row.registrationStatus] ?? null),
    openedOn: row.openedOn,
    cnae: { code: row.cnaeCode, description: row.cnaeDescription },
    address: {
      streetType: row.streetType,
      street: row.street,
      number: row.streetNumber,
      complement: row.complement,
      neighborhood: row.neighborhood,
      cep: row.cep,
    },
    location: {
      municipalityCode: row.municipalityCode,
      municipalityName: row.municipalityName,
      uf: row.uf,
    },
  };
}

function toEvidence(row: Pick<EstablishmentRow, 'datasetKey' | 'reference' | 'publishedAt'>) {
  return row.datasetKey === null
    ? null
    : { datasetKey: row.datasetKey, reference: row.reference, publishedAt: row.publishedAt };
}

/**
 * A company absent from the Simples snapshot never opted for the regime, so the
 * null option becomes a null regime instead of a false one.
 * @param option - Current option published by the RFB.
 * @param since - Date the option was taken.
 * @param until - Date the company left.
 * @returns The regime, or null when the company never opted.
 */
function toRegime(
  option: boolean | null,
  since: string | null,
  until: string | null,
): TaxRegimeView | null {
  if (option === null) return null;

  return { opted: option, since, until };
}
