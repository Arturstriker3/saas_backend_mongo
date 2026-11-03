import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * The CNEFE code identifies the address, not the record: the same address is
 * published once per species (a household and a shop share the code). Migration
 * `013` created the table keyed by `id` alone; this fixes the key.
 */
export const migration015AddressKey = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`ALTER TABLE geo.address DROP CONSTRAINT IF EXISTS address_pkey`.execute(db);
    await sql`ALTER TABLE geo.address ALTER COLUMN species_code SET NOT NULL`.execute(db);
    await sql`
      ALTER TABLE geo.address
        ADD CONSTRAINT address_pkey PRIMARY KEY (id, species_code)
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`ALTER TABLE geo.address DROP CONSTRAINT IF EXISTS address_pkey`.execute(db);
    await sql`
      ALTER TABLE geo.address ADD CONSTRAINT address_pkey PRIMARY KEY (id)
    `.execute(db);
  },
};
