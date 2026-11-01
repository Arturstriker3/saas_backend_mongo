import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * The company behind a CNPJ: the root number (`cnpj_basico`) plus the official
 * name, size band and capital. Establishments point to it by `cnpj_basico`,
 * which is the only place the legal name exists — the trade name is optional.
 */
export const migration007Companies = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.company (
        cnpj_basico text PRIMARY KEY,
        legal_name text NOT NULL,
        legal_nature_code text,
        size_code text,
        capital_social numeric(18, 2),
        dataset_version_id bigint REFERENCES geo.dataset_version(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE INDEX company_version
        ON geo.company (dataset_version_id)
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.company`.execute(db);
  },
};
