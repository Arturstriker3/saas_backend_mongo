import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Stores the IBGE Cadastro Central de Empresas (CEMPRE) by municipality and
 * CNAE division: the formal side of the economy that the CNPJ registry cannot
 * tell — how many people each activity actually employs and how much it pays.
 *
 * The grain is the CNAE division (2 digits) because that is the finest level
 * SIDRA serves for every municipality: class level exists only for municipalities
 * with 50 000 inhabitants or more.
 */
export const migration018Cempre = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.cnae_division (
        code text PRIMARY KEY,
        name text NOT NULL,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE TABLE geo.municipality_cnae_employment (
        municipality_code text NOT NULL,
        cnae_code text NOT NULL REFERENCES geo.cnae_division(code),
        reference text NOT NULL,
        companies integer NOT NULL,
        occupied_persons integer NOT NULL,
        salaried_persons integer NOT NULL,
        salaries_thousand_brl numeric(18,2) NOT NULL,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (municipality_code, cnae_code, reference)
      )
    `.execute(db);

    // "Where is this activity concentrated": the division is the filter and the
    // jobs the ranking.
    await sql`
      CREATE INDEX municipality_cnae_employment_division_rank
        ON geo.municipality_cnae_employment (cnae_code, reference, occupied_persons DESC)
    `.execute(db);

    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('ibge_cempre', 'open', true, true, 'Fonte: IBGE — Cadastro Central de Empresas')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES ('ibge_cempre', 365, 400)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.municipality_cnae_employment`.execute(db);
    await sql`DROP TABLE IF EXISTS geo.cnae_division`.execute(db);
  },
};
