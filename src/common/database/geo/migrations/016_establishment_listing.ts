import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Makes the active-establishment listing index ordered by CNPJ.
 *
 * `(municipality_code, cnae_principal)` alone cannot answer "the establishments
 * of this municipality and CNAE, page after page": the planner either sorts the
 * whole match or walks the primary key and filters — the second choice took 207
 * seconds on São Paulo. Appending `cnpj` turns the listing into an ordered index
 * scan, so the keyset pagination of `GET /geo/establishments` stops after `limit`
 * rows.
 */
export const migration016EstablishmentListing = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`SET LOCAL statement_timeout = 0`.execute(db);
    await sql`SET LOCAL maintenance_work_mem = '1GB'`.execute(db);

    await sql`DROP INDEX IF EXISTS geo.establishment_active_municipality_cnae`.execute(db);

    await sql`
      CREATE INDEX establishment_active_municipality_cnae
        ON geo.establishment (municipality_code, cnae_principal, cnpj)
        WHERE registration_status = 2
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP INDEX IF EXISTS geo.establishment_active_municipality_cnae`.execute(db);

    await sql`
      CREATE INDEX establishment_active_municipality_cnae
        ON geo.establishment (municipality_code, cnae_principal)
        WHERE registration_status = 2
    `.execute(db);
  },
};
