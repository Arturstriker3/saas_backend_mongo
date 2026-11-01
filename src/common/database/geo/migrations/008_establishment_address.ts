import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Adds the address published with each establishment. The street itself is
 * needed to geocode a point later; the municipality and the CEP alone only
 * place the establishment approximately.
 */
export const migration008EstablishmentAddress = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      ALTER TABLE geo.establishment
        ADD COLUMN street_type text,
        ADD COLUMN street text,
        ADD COLUMN street_number text,
        ADD COLUMN complement text,
        ADD COLUMN neighborhood text
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      ALTER TABLE geo.establishment
        DROP COLUMN IF EXISTS street_type,
        DROP COLUMN IF EXISTS street,
        DROP COLUMN IF EXISTS street_number,
        DROP COLUMN IF EXISTS complement,
        DROP COLUMN IF EXISTS neighborhood
    `.execute(db);
  },
};
