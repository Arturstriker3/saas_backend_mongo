import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Adds the two pieces the foundation was missing: the official IBGE code
 * registry (`geo.locality`) and municipal indicators keyed by region
 * (`geo.region_indicator`).
 *
 * `geo.locality` is deliberately separate from `geo.region`: the registry is the
 * source of truth for codes and names and is published by its own dataset, while
 * `geo.region` only holds what the malha can serve. The gap between the two is a
 * view, so a municipality the IBGE lists but the malha cannot serve shows up by
 * itself instead of being discovered by hand.
 */
export const migration011Foundation = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.locality (
        level text NOT NULL,
        ibge_code text NOT NULL,
        name text NOT NULL,
        search_name text NOT NULL,
        uf_code text,
        uf_sigla text,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT locality_level_check CHECK (level IN ('state', 'municipality')),
        PRIMARY KEY (level, ibge_code)
      )
    `.execute(db);

    await sql`CREATE INDEX locality_uf ON geo.locality (level, uf_code)`.execute(db);
    await sql`
      CREATE INDEX locality_search_name_trgm
        ON geo.locality USING gin (search_name gin_trgm_ops)
    `.execute(db);

    await sql`
      CREATE OR REPLACE VIEW geo.locality_gap AS
      SELECT 'missing_in_region'::text AS gap,
             locality.level,
             locality.ibge_code,
             locality.name,
             locality.uf_sigla
        FROM geo.locality
       WHERE NOT EXISTS (
         SELECT 1
           FROM geo.region
          WHERE region.level = locality.level
            AND region.ibge_code = locality.ibge_code
       )
      UNION ALL
      SELECT 'missing_in_source'::text AS gap,
             region.level,
             region.ibge_code,
             region.name,
             NULL::text AS uf_sigla
        FROM geo.region
       WHERE region.level IN ('state', 'municipality')
         AND NOT EXISTS (
           SELECT 1
             FROM geo.locality
            WHERE locality.level = region.level
              AND locality.ibge_code = region.ibge_code
         )
    `.execute(db);

    await sql`
      CREATE TABLE geo.region_indicator (
        region_code text NOT NULL,
        indicator_key text NOT NULL,
        reference text NOT NULL,
        value numeric NOT NULL,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (region_code, indicator_key, reference)
      )
    `.execute(db);

    await sql`
      CREATE INDEX region_indicator_lookup
        ON geo.region_indicator (indicator_key, reference)
    `.execute(db);

    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('ibge_localidades', 'open', true, true, 'Fonte: IBGE — API de Localidades')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    // Codes and names change on an irregular cadence; a monthly check is cheap
    // (two requests) and catches a new municipality before the next malha.
    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES ('ibge_localidades', 30, 60)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP VIEW IF EXISTS geo.locality_gap`.execute(db);
    await sql`DROP TABLE IF EXISTS geo.region_indicator`.execute(db);
    await sql`DROP TABLE IF EXISTS geo.locality`.execute(db);
  },
};
