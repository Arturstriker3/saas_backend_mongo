import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Moves CEMPRE from the CNAE division to the CNAE class.
 *
 * The division (2 digits) answers "retail", which mixes a hypermarket with a
 * fruit stand. The class (4 digits) is the grain of the CNPJ registry itself, so
 * the two datasets can be read together: establishments per class (ours) against
 * employed people per class (CEMPRE).
 *
 * The division rows cannot survive: the fact table references the taxonomy by
 * code, and a 2-digit code does not exist in the class table. They are deleted
 * here and rebuilt at the new grain by the next publish, which takes minutes and
 * belongs to the same reference.
 */
export const migration019CnaeClass = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`SET LOCAL statement_timeout = 0`.execute(db);

    await sql`
      CREATE TABLE geo.cnae_class (
        code text PRIMARY KEY,
        name text NOT NULL,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`DELETE FROM geo.municipality_cnae_employment`.execute(db);
    await sql`
      ALTER TABLE geo.municipality_cnae_employment
        DROP CONSTRAINT municipality_cnae_employment_cnae_code_fkey
    `.execute(db);

    await sql`
      ALTER TABLE geo.municipality_cnae_employment
        ADD CONSTRAINT municipality_cnae_employment_cnae_class_fkey
        FOREIGN KEY (cnae_code) REFERENCES geo.cnae_class(code)
    `.execute(db);

    await sql`
      ALTER INDEX geo.municipality_cnae_employment_division_rank
        RENAME TO municipality_cnae_employment_rank
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      ALTER INDEX geo.municipality_cnae_employment_rank
        RENAME TO municipality_cnae_employment_division_rank
    `.execute(db);
    await sql`
      ALTER TABLE geo.municipality_cnae_employment
        DROP CONSTRAINT municipality_cnae_employment_cnae_class_fkey
    `.execute(db);
    await sql`DELETE FROM geo.municipality_cnae_employment`.execute(db);
    await sql`
      ALTER TABLE geo.municipality_cnae_employment
        ADD CONSTRAINT municipality_cnae_employment_cnae_code_fkey
        FOREIGN KEY (cnae_code) REFERENCES geo.cnae_division(code)
    `.execute(db);
    await sql`DROP TABLE geo.cnae_class`.execute(db);
  },
};
