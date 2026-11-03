import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * The CNEFE code identifies the address, not the record: the same address is
 * published once per species (a household and a shop share the code). Migration
 * `013` created the table keyed by `id` alone; this fixes the key.
 *
 * The rebuild is skipped when the key is already `(id, species_code)`, so a
 * database repaired by hand — where the publish created the composite key
 * directly — does not pay for a 111M row index build.
 */
export const migration015AddressKey = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`SET LOCAL statement_timeout = 0`.execute(db);

    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint AS constraint_
          JOIN pg_class AS relation ON relation.oid = constraint_.conrelid
          JOIN pg_namespace AS schema_ ON schema_.oid = relation.relnamespace
          WHERE schema_.nspname = 'geo'
            AND relation.relname = 'address'
            AND constraint_.conname = 'address_pkey'
            AND ARRAY(
              SELECT attribute.attname::text
              FROM unnest(constraint_.conkey) WITH ORDINALITY AS entry(attnum, ord)
              JOIN pg_attribute AS attribute
                ON attribute.attrelid = relation.oid
               AND attribute.attnum = entry.attnum
              ORDER BY entry.ord
            ) = ARRAY['id', 'species_code']
        ) THEN
          ALTER TABLE geo.address DROP CONSTRAINT IF EXISTS address_pkey;
          ALTER TABLE geo.address ALTER COLUMN species_code SET NOT NULL;
          ALTER TABLE geo.address ADD CONSTRAINT address_pkey PRIMARY KEY (id, species_code);
        END IF;
      END
      $$
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`SET LOCAL statement_timeout = 0`.execute(db);
    await sql`ALTER TABLE geo.address DROP CONSTRAINT IF EXISTS address_pkey`.execute(db);
    await sql`
      ALTER TABLE geo.address ADD CONSTRAINT address_pkey PRIMARY KEY (id)
    `.execute(db);
  },
};
