import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Adds the territorial dimension and seeds license and schedule metadata
 * for the wave 1 datasets.
 */
export const migration002Region = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

    await sql`
      CREATE TABLE geo.region (
        id bigserial PRIMARY KEY,
        level text NOT NULL,
        ibge_code text NOT NULL,
        parent_id bigint REFERENCES geo.region(id) ON DELETE RESTRICT,
        name text NOT NULL,
        search_name text NOT NULL,
        geom geometry(MultiPolygon, 4326) NOT NULL,
        area_km2 numeric,
        centroid geography(Point, 4326),
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT region_level_check
          CHECK (level IN ('state', 'municipality', 'district', 'neighborhood', 'sector'))
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX region_level_code_unique ON geo.region (level, ibge_code)
    `.execute(db);
    await sql`CREATE INDEX region_geom_gist ON geo.region USING gist (geom)`.execute(db);
    await sql`CREATE INDEX region_parent ON geo.region (parent_id)`.execute(db);
    await sql`
      CREATE INDEX region_search_name_trgm ON geo.region USING gin (search_name gin_trgm_ops)
    `.execute(db);
    await sql`CREATE INDEX region_level_name ON geo.region (level, name)`.execute(db);

    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('ibge_malha', 'open', true, true, 'Fonte: IBGE — Malhas Territoriais'),
        ('ibge_censo', 'open', true, true, 'Fonte: IBGE — Censo Demográfico 2022'),
        ('ibge_estimativas', 'open', true, true, 'Fonte: IBGE — Estimativas da População'),
        ('cnefe', 'open', true, true, 'Fonte: IBGE — CNEFE'),
        ('rfb_cnpj', 'open', true, true, 'Fonte: Receita Federal — Dados Abertos do CNPJ')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES
        ('ibge_malha', 365, 400),
        ('ibge_censo', 365, 400),
        ('ibge_estimativas', 365, 400),
        ('cnefe', 365, 400),
        ('rfb_cnpj', 30, 45)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.region`.execute(db);
  },
};
