import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../common/database/geo/geo.connection';
import type { StatisticsReadRepository } from '../domain/statistics-read.repository.interface';
import type {
  CnaeRankEntry,
  EmploymentTotals,
  MunicipalityEmployment,
  MunicipalityStatistics,
  UfStatistics,
} from '../domain/statistics-view.types';

interface RankRow {
  code: string;
  description: string | null;
  establishments: number;
  total: number;
  cnaeCount: number;
}

interface DivisionRow {
  code: string;
  name: string;
  companies: number;
  occupiedPersons: number;
  salariedPersons: number;
  salariesThousandBrl: number;
  totalCompanies: number;
  totalOccupied: number;
  totalSalaried: number;
  totalSalaries: number;
}

interface Ranking {
  activeEstablishments: number;
  cnaeCount: number;
  topCnaes: CnaeRankEntry[];
}

@Injectable()
export class StatisticsRepositoryPostgis implements StatisticsReadRepository {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async municipality(code: string, limit: number): Promise<MunicipalityStatistics | null> {
    const { rows } = await sql<{
      name: string | null;
      uf: string | null;
      population: number | null;
    }>`
      SELECT locality.name AS "name",
             locality.uf_sigla AS "uf",
             (SELECT indicator.value::float8
                FROM geo.region_indicator AS indicator
               WHERE indicator.region_code = locality.ibge_code
                 AND indicator.indicator_key = 'population'
               ORDER BY indicator.reference DESC
               LIMIT 1) AS "population"
      FROM geo.locality AS locality
      WHERE locality.level = 'municipality'
        AND locality.ibge_code = ${code}
      LIMIT 1
    `.execute(this.db);

    const municipality = rows[0];
    if (!municipality) return null;

    const ranking = await this.rank(
      'geo.mv_establishment_municipality_cnae',
      'municipality_code',
      code,
      limit,
    );

    return {
      municipality: {
        code,
        name: municipality.name,
        uf: municipality.uf,
        population: municipality.population,
      },
      ...ranking,
    };
  }

  async uf(uf: string, limit: number): Promise<UfStatistics | null> {
    const ufCode = await this.resolveUfCode(uf);
    if (!ufCode) return null;

    const { rows } = await sql<{ name: string | null; sigla: string | null }>`
      SELECT locality.name AS "name",
             locality.uf_sigla AS "sigla"
      FROM geo.locality AS locality
      WHERE locality.level = 'state'
        AND locality.ibge_code = ${ufCode}
      LIMIT 1
    `.execute(this.db);

    const state = rows[0];
    if (!state) return null;

    const ranking = await this.rank('geo.mv_establishment_uf_cnae', 'uf_code', ufCode, limit);

    return {
      uf: { code: ufCode, sigla: state.sigla, name: state.name },
      ...ranking,
    };
  }

  /**
   * Reads the formal employment of one municipality from CEMPRE, by CNAE
   * division, for the most recent year the municipality reports.
   * @param code - IBGE municipality code.
   * @param limit - How many divisions to rank.
   * @returns The totals and the ranking, or null for an unknown code.
   */
  async employment(code: string, limit: number): Promise<MunicipalityEmployment | null> {
    const { rows: header } = await sql<{
      name: string | null;
      uf: string | null;
      reference: string | null;
    }>`
      SELECT locality.name AS "name",
             locality.uf_sigla AS "uf",
             (SELECT max(employment.reference)
                FROM geo.municipality_cnae_employment AS employment
               WHERE employment.municipality_code = locality.ibge_code) AS "reference"
      FROM geo.locality AS locality
      WHERE locality.level = 'municipality'
        AND locality.ibge_code = ${code}
      LIMIT 1
    `.execute(this.db);

    const municipality = header[0];
    if (!municipality) return null;

    const reference = municipality.reference;
    if (!reference) {
      return {
        municipality: { code, name: municipality.name, uf: municipality.uf },
        reference: null,
        totals: emptyTotals(),
        divisions: [],
      };
    }

    const { rows } = await sql<DivisionRow>`
      SELECT employment.cnae_code AS "code",
             division.name AS "name",
             employment.companies AS "companies",
             employment.occupied_persons AS "occupiedPersons",
             employment.salaried_persons AS "salariedPersons",
             employment.salaries_thousand_brl::float8 AS "salariesThousandBrl",
             (sum(employment.companies) OVER ())::int AS "totalCompanies",
             (sum(employment.occupied_persons) OVER ())::int AS "totalOccupied",
             (sum(employment.salaried_persons) OVER ())::int AS "totalSalaried",
             (sum(employment.salaries_thousand_brl) OVER ())::float8 AS "totalSalaries"
      FROM geo.municipality_cnae_employment AS employment
      JOIN geo.cnae_division AS division ON division.code = employment.cnae_code
      WHERE employment.municipality_code = ${code}
        AND employment.reference = ${reference}
      ORDER BY employment.occupied_persons DESC, employment.cnae_code
      LIMIT ${limit}
    `.execute(this.db);

    const first = rows[0];
    const totalOccupied = first?.totalOccupied ?? 0;
    const totalSalaried = first?.totalSalaried ?? 0;
    const totalSalaries = first?.totalSalaries ?? 0;

    return {
      municipality: { code, name: municipality.name, uf: municipality.uf },
      reference,
      totals: {
        companies: first?.totalCompanies ?? 0,
        occupiedPersons: totalOccupied,
        salariedPersons: totalSalaried,
        salariesThousandBrl: totalSalaries,
        averageMonthlySalary:
          totalSalaried > 0 ? (totalSalaries * 1000) / (totalSalaried * 12) : null,
      },
      divisions: rows.map((row) => ({
        code: row.code,
        name: row.name,
        companies: row.companies,
        occupiedPersons: row.occupiedPersons,
        salariedPersons: row.salariedPersons,
        salariesThousandBrl: row.salariesThousandBrl,
        share: totalOccupied > 0 ? row.occupiedPersons / totalOccupied : 0,
      })),
    };
  }

  /**
   * Reads the top activities of one scope. The window sums run over every row of
   * the scope before `LIMIT`, so the total and the number of activities come
   * from the same round trip as the ranking.
   * @param view - Aggregate view to read.
   * @param codeColumn - Column that identifies the scope.
   * @param code - Scope value.
   * @param limit - How many activities to return.
   * @returns The totals and the ranking.
   */
  private async rank(
    view: string,
    codeColumn: string,
    code: string,
    limit: number,
  ): Promise<Ranking> {
    const { rows } = await sql<RankRow>`
      SELECT ranking.cnae_principal AS "code",
             cnae.description AS "description",
             ranking.establishment_count::int AS "establishments",
             (sum(ranking.establishment_count) OVER ())::int AS "total",
             (count(*) OVER ())::int AS "cnaeCount"
      FROM ${sql.table(view)} AS ranking
      LEFT JOIN geo.cnae AS cnae ON cnae.code = ranking.cnae_principal
      WHERE ${sql.ref(`ranking.${codeColumn}`)} = ${code}
      ORDER BY ranking.establishment_count DESC, ranking.cnae_principal
      LIMIT ${limit}
    `.execute(this.db);

    const total = rows[0]?.total ?? 0;

    return {
      activeEstablishments: total,
      cnaeCount: rows[0]?.cnaeCount ?? 0,
      topCnaes: rows.map((row) => ({
        code: row.code,
        description: row.description,
        establishments: row.establishments,
        share: total > 0 ? row.establishments / total : 0,
      })),
    };
  }

  /**
   * Accepts the IBGE code or the two-letter abbreviation of a state.
   * @param uf - `35`, `SP` or `sp`.
   * @returns The IBGE code, or null when the abbreviation is unknown.
   */
  private async resolveUfCode(uf: string): Promise<string | null> {
    if (/^\d{2}$/.test(uf)) return uf;

    const { rows } = await sql<{ code: string }>`
      SELECT locality.ibge_code AS "code"
      FROM geo.locality AS locality
      WHERE locality.level = 'state'
        AND locality.uf_sigla = upper(${uf})
      LIMIT 1
    `.execute(this.db);

    return rows[0]?.code ?? null;
  }
}

function emptyTotals(): EmploymentTotals {
  return {
    companies: 0,
    occupiedPersons: 0,
    salariedPersons: 0,
    salariesThousandBrl: 0,
    averageMonthlySalary: null,
  };
}
