import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Socioeconomic attributes per census tract, joined to `geo.region` by the
 * sector code. Populated by the Censo 2022 aggregates (basic + income).
 */
export const migration005CensoIndicators = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.sector_indicator (
        sector_code text PRIMARY KEY,
        dataset_version_id bigint REFERENCES geo.dataset_version(id) ON DELETE SET NULL,
        population integer,
        households integer,
        occupied_households integer,
        average_household_size numeric(6, 3),
        responsible_persons integer,
        average_income numeric(12, 2),
        median_income numeric(12, 2),
        urban boolean,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('ibge_censo', 'open', true, true, 'Fonte: IBGE — Censo Demográfico 2022, agregados por setores censitários')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES ('ibge_censo', 365, 400)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.sector_indicator`.execute(db);
    await sql`DELETE FROM geo.ingestion_schedule WHERE dataset_key = 'ibge_censo'`.execute(db);
    await sql`DELETE FROM geo.dataset_license WHERE dataset_key = 'ibge_censo'`.execute(db);
  },
};
