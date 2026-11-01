import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type {
  ChunkStats,
  FinalizeDatasetInput,
  PublishDatasetResult,
} from '../../domain/dataset-publisher.interface';
import type {
  IndicatorVersionInput,
  SectorIndicatorPublisher,
} from '../../domain/sector-indicator-publisher.interface';
import type { SectorBasicsInput, SectorIncomeInput } from '../../domain/sector-indicator.types';

const CHUNK_SIZE = 5_000;

@Injectable()
export class SectorIndicatorPublisherPostgis implements SectorIndicatorPublisher {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async begin(input: IndicatorVersionInput): Promise<string> {
    const created = await sql<{ id: string }>`
      INSERT INTO geo.dataset_version
        (dataset_key, reference, status, extracted_at, methodology, source_url, checksum, row_count)
      VALUES
        (${input.datasetKey}, ${input.reference}, 'staging', ${input.extractedAt},
         ${input.methodology}, ${input.sourceUrl}, '', 0)
      ON CONFLICT (dataset_key, reference) DO UPDATE
        SET status = 'staging',
            extracted_at = EXCLUDED.extracted_at,
            published_at = NULL,
            methodology = EXCLUDED.methodology,
            source_url = EXCLUDED.source_url
      RETURNING id
    `.execute(this.db);

    const versionId = created.rows[0]?.id;
    if (!versionId) throw new Error('Could not create the dataset version');

    return versionId;
  }

  async writeBasics(versionId: string, rows: SectorBasicsInput[]): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const chunk = rows.slice(index, index + CHUNK_SIZE);
      const payload = JSON.stringify(
        chunk.map((row) => ({
          sector_code: row.sectorCode,
          population: row.population,
          households: row.households,
          occupied_households: row.occupiedHouseholds,
          average_household_size: row.averageHouseholdSize,
          urban: row.urban,
        })),
      );
      const { rows: written } = await sql<{ inserted: boolean }>`
        INSERT INTO geo.sector_indicator
          (sector_code, dataset_version_id, population, households, occupied_households,
           average_household_size, urban, responsible_persons, average_income, median_income,
           updated_at)
        SELECT source.sector_code,
               ${versionId}::bigint,
               source.population,
               source.households,
               source.occupied_households,
               source.average_household_size,
               source.urban,
               NULL,
               NULL,
               NULL,
               now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS source(
          sector_code text,
          population int,
          households int,
          occupied_households int,
          average_household_size numeric,
          urban boolean
        )
        ON CONFLICT (sector_code) DO UPDATE
          SET dataset_version_id = EXCLUDED.dataset_version_id,
              population = EXCLUDED.population,
              households = EXCLUDED.households,
              occupied_households = EXCLUDED.occupied_households,
              average_household_size = EXCLUDED.average_household_size,
              urban = EXCLUDED.urban,
              responsible_persons = NULL,
              average_income = NULL,
              median_income = NULL,
              updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `.execute(this.db);

      const inserted = written.filter((row) => row.inserted).length;
      stats.inserted += inserted;
      stats.updated += written.length - inserted;
    }

    return stats;
  }

  async writeIncome(versionId: string, rows: SectorIncomeInput[]): Promise<number> {
    let matched = 0;

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(
        rows.slice(index, index + CHUNK_SIZE).map((row) => ({
          sector_code: row.sectorCode,
          responsible_persons: row.responsiblePersons,
          average_income: row.averageIncome,
          median_income: row.medianIncome,
        })),
      );
      const { rows: updated } = await sql<{ sector_code: string }>`
        UPDATE geo.sector_indicator AS target
        SET responsible_persons = source.responsible_persons,
            average_income = source.average_income,
            median_income = source.median_income,
            dataset_version_id = ${versionId}::bigint,
            updated_at = now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS source(
          sector_code text,
          responsible_persons int,
          average_income numeric,
          median_income numeric
        )
        WHERE target.sector_code = source.sector_code
        RETURNING target.sector_code
      `.execute(this.db);

      matched += updated.length;
    }

    return matched;
  }

  async finalize(input: FinalizeDatasetInput): Promise<PublishDatasetResult> {
    const { datasetKey, versionId, checksum, stats } = input;

    return this.db.transaction().execute(async (trx) => {
      const previous = await sql<{ id: string }>`
        SELECT id
        FROM geo.dataset_version
        WHERE dataset_key = ${datasetKey} AND status = 'published' AND id <> ${versionId}
        LIMIT 1
      `.execute(trx);

      await sql`
        UPDATE geo.dataset_version
        SET status = 'superseded'
        WHERE dataset_key = ${datasetKey} AND status = 'published' AND id <> ${versionId}
      `.execute(trx);

      await sql`
        UPDATE geo.dataset_version
        SET status = 'published',
            published_at = now(),
            checksum = ${checksum},
            row_count = ${stats.inserted + stats.updated}
        WHERE id = ${versionId}
      `.execute(trx);

      await sql`DELETE FROM geo.dataset_change WHERE dataset_version_id = ${versionId}`.execute(
        trx,
      );

      await sql`
        INSERT INTO geo.dataset_change
          (dataset_version_id, previous_version_id, entity_type, change_type, entity_count)
        VALUES
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'sector_indicator', 'added',
           ${stats.inserted}),
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'sector_indicator', 'changed',
           ${stats.updated})
      `.execute(trx);

      return { versionId, inserted: stats.inserted, updated: stats.updated };
    });
  }

  async discard(datasetKey: string, versionId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const previous = await sql<{ id: string }>`
        SELECT id
        FROM geo.dataset_version
        WHERE dataset_key = ${datasetKey} AND status = 'published' AND id <> ${versionId}
        LIMIT 1
      `.execute(trx);

      const previousId = previous.rows[0]?.id;

      if (previousId) {
        await sql`
          UPDATE geo.sector_indicator
          SET dataset_version_id = ${previousId}::bigint
          WHERE dataset_version_id = ${versionId}::bigint
        `.execute(trx);
      } else {
        await sql`
          DELETE FROM geo.sector_indicator WHERE dataset_version_id = ${versionId}::bigint
        `.execute(trx);
      }

      await sql`
        DELETE FROM geo.dataset_version WHERE id = ${versionId}::bigint AND status = 'staging'
      `.execute(trx);
    });
  }
}
