import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Simples Nacional and MEI as declared for each company.
 *
 * The option belongs to the company, not to the establishment, so the file
 * repeats the CNPJ root. A company that opted and later left keeps the exclusion
 * date: the source publishes the whole history instead of only the current
 * status, and the rows it omits are the ones that never opted.
 */
export const migration021CompanySimples = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.company_simples (
        cnpj_basico text PRIMARY KEY,
        simples_option boolean NOT NULL,
        simples_since date,
        simples_until date,
        mei_option boolean NOT NULL,
        mei_since date,
        mei_until date,
        dataset_version_id bigint REFERENCES geo.dataset_version(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE INDEX company_simples_version
        ON geo.company_simples (dataset_version_id)
    `.execute(db);

    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('rfb_simples', 'open', true, true, 'Fonte: Receita Federal do Brasil — Simples Nacional e MEI (CNPJ)')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES ('rfb_simples', 30, 45)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.company_simples`.execute(db);
    await sql`DELETE FROM geo.ingestion_schedule WHERE dataset_key = 'rfb_simples'`.execute(db);
    await sql`DELETE FROM geo.dataset_license WHERE dataset_key = 'rfb_simples'`.execute(db);
  },
};
