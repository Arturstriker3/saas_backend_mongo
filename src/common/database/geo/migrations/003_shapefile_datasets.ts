import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Seeds license and schedule metadata for the shapefile datasets.
 */
export const migration003ShapefileDatasets = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('ibge_bairro', 'open', true, true, 'Fonte: IBGE — Malha de Bairros, Censo 2022'),
        ('ibge_setor', 'open', true, true, 'Fonte: IBGE — Malha de Setores Censitários, Censo 2022')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES
        ('ibge_bairro', 365, 400),
        ('ibge_setor', 365, 400)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      DELETE FROM geo.ingestion_schedule WHERE dataset_key IN ('ibge_bairro', 'ibge_setor')
    `.execute(db);
    await sql`
      DELETE FROM geo.dataset_license WHERE dataset_key IN ('ibge_bairro', 'ibge_setor')
    `.execute(db);
  },
};
