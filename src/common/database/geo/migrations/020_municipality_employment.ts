import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Adds the municipality as a whole, next to the CNAE class table.
 *
 * IBGE applies statistical secrecy to the class × municipality cells: 65% of
 * them come with the number of companies but without the employment. Summing the
 * classes therefore loses 16% of the country's jobs and a quarter of a small
 * town's. The same aggregate read without the classification is never withheld,
 * so one row per municipality carries the total the endpoint reports.
 */
export const migration020MunicipalityEmployment = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.municipality_employment (
        municipality_code text NOT NULL,
        reference text NOT NULL,
        companies integer NOT NULL,
        occupied_persons integer NOT NULL,
        salaried_persons integer NOT NULL,
        salaries_thousand_brl numeric(18,2) NOT NULL,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (municipality_code, reference)
      )
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE geo.municipality_employment`.execute(db);
  },
};
