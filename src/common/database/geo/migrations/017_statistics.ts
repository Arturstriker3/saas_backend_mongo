import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Pre-aggregates the CNPJ snapshot so "which activities exist in this city" and
 * "where is this activity concentrated" answer in milliseconds instead of
 * grouping 28M active establishments on every request.
 *
 * The UF view is derived from the municipality one: the first two digits of an
 * IBGE municipality code are the UF code, so the national view costs a pass over
 * ~2M aggregated rows instead of another 73.8M row scan.
 *
 * Both are refreshed by the CNPJ publisher inside the swap transaction, so the
 * numbers switch together with the establishments they describe.
 */
export const migration017Statistics = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`SET LOCAL statement_timeout = 0`.execute(db);

    await sql`
      CREATE MATERIALIZED VIEW geo.mv_establishment_municipality_cnae AS
      SELECT establishment.municipality_code,
             establishment.cnae_principal,
             count(*)::int AS establishment_count
      FROM geo.establishment
      WHERE establishment.registration_status = 2
        AND establishment.municipality_code IS NOT NULL
        AND establishment.cnae_principal IS NOT NULL
      GROUP BY establishment.municipality_code, establishment.cnae_principal
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX mv_establishment_municipality_cnae_pkey
        ON geo.mv_establishment_municipality_cnae (municipality_code, cnae_principal)
    `.execute(db);

    await sql`
      CREATE INDEX mv_establishment_municipality_cnae_rank
        ON geo.mv_establishment_municipality_cnae (municipality_code, establishment_count DESC)
    `.execute(db);

    await sql`
      CREATE MATERIALIZED VIEW geo.mv_establishment_uf_cnae AS
      SELECT left(by_municipality.municipality_code, 2) AS uf_code,
             by_municipality.cnae_principal,
             sum(by_municipality.establishment_count)::int AS establishment_count
      FROM geo.mv_establishment_municipality_cnae AS by_municipality
      GROUP BY 1, 2
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX mv_establishment_uf_cnae_pkey
        ON geo.mv_establishment_uf_cnae (uf_code, cnae_principal)
    `.execute(db);

    await sql`
      CREATE INDEX mv_establishment_uf_cnae_rank
        ON geo.mv_establishment_uf_cnae (uf_code, establishment_count DESC)
    `.execute(db);

    await sql`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'geo_api') THEN
          GRANT SELECT ON geo.mv_establishment_municipality_cnae TO geo_api;
          GRANT SELECT ON geo.mv_establishment_uf_cnae TO geo_api;
        END IF;
      END
      $$
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP MATERIALIZED VIEW IF EXISTS geo.mv_establishment_uf_cnae`.execute(db);
    await sql`DROP MATERIALIZED VIEW IF EXISTS geo.mv_establishment_municipality_cnae`.execute(db);
  },
};
