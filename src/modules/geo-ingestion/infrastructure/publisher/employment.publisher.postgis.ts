import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { GeoDB } from '../../../../common/database/geo/geo-db.types';
import type { ChunkStats, PublishDatasetResult } from '../../domain/dataset-publisher.interface';
import type {
  EmploymentFinalizeInput,
  EmploymentPublisher,
  EmploymentVersionInput,
} from '../../domain/employment-publisher.interface';
import type {
  CnaeCategoryInput,
  EmploymentRecord,
  EmploymentTotalRecord,
} from '../../domain/employment.types';
import { openStagingVersion } from './load-swap';

/** ~5 000 rows per statement keeps the jsonb payload small and the upsert cheap. */
const CHUNK_SIZE = 5_000;

/**
 * Publishes CEMPRE by upserting into the published table: the grain is small
 * (~700k rows a year) and each vintage must survive the next one, so there is
 * no mirror table and no swap.
 */
@Injectable()
export class EmploymentPublisherPostgis implements EmploymentPublisher {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async begin(input: EmploymentVersionInput): Promise<string> {
    return this.db.transaction().execute(async (trx) => {
      const versionId = await openStagingVersion(trx, input);
      await this.upsertClasses(trx, versionId, input.categories);

      return versionId;
    });
  }

  async writeChunk(versionId: string, rows: EmploymentRecord[]): Promise<ChunkStats> {
    let inserted = 0;

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(
        rows.slice(index, index + CHUNK_SIZE).map((row) => ({
          municipality_code: row.municipalityCode,
          cnae_code: row.cnaeCode,
          companies: row.companies,
          occupied_persons: row.occupiedPersons,
          salaried_persons: row.salariedPersons,
          salaries_thousand_brl: row.salariesThousandBrl,
        })),
      );

      const written = await sql<{ inserted: boolean }>`
        INSERT INTO geo.municipality_cnae_employment
          (municipality_code, cnae_code, reference, companies, occupied_persons,
           salaried_persons, salaries_thousand_brl, dataset_version_id, updated_at)
        SELECT source.municipality_code,
               source.cnae_code,
               version.reference,
               source.companies,
               source.occupied_persons,
               source.salaried_persons,
               source.salaries_thousand_brl,
               version.id,
               now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS source(
          municipality_code text,
          cnae_code text,
          companies integer,
          occupied_persons integer,
          salaried_persons integer,
          salaries_thousand_brl numeric
        )
        CROSS JOIN geo.dataset_version AS version
        WHERE version.id = ${versionId}::bigint
        ON CONFLICT (municipality_code, cnae_code, reference) DO UPDATE
          SET companies = EXCLUDED.companies,
              occupied_persons = EXCLUDED.occupied_persons,
              salaried_persons = EXCLUDED.salaried_persons,
              salaries_thousand_brl = EXCLUDED.salaries_thousand_brl,
              dataset_version_id = EXCLUDED.dataset_version_id,
              updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `.execute(this.db);

      inserted += written.rows.filter((row) => row.inserted).length;
    }

    return { inserted, updated: rows.length - inserted };
  }

  async writeTotals(versionId: string, rows: EmploymentTotalRecord[]): Promise<ChunkStats> {
    const payload = JSON.stringify(
      rows.map((row) => ({
        municipality_code: row.municipalityCode,
        companies: row.companies,
        occupied_persons: row.occupiedPersons,
        salaried_persons: row.salariedPersons,
        salaries_thousand_brl: row.salariesThousandBrl,
      })),
    );

    const written = await sql<{ inserted: boolean }>`
      INSERT INTO geo.municipality_employment
        (municipality_code, reference, companies, occupied_persons, salaried_persons,
         salaries_thousand_brl, dataset_version_id, updated_at)
      SELECT source.municipality_code,
             version.reference,
             source.companies,
             source.occupied_persons,
             source.salaried_persons,
             source.salaries_thousand_brl,
             version.id,
             now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS source(
        municipality_code text,
        companies integer,
        occupied_persons integer,
        salaried_persons integer,
        salaries_thousand_brl numeric
      )
      CROSS JOIN geo.dataset_version AS version
      WHERE version.id = ${versionId}::bigint
      ON CONFLICT (municipality_code, reference) DO UPDATE
        SET companies = EXCLUDED.companies,
            occupied_persons = EXCLUDED.occupied_persons,
            salaried_persons = EXCLUDED.salaried_persons,
            salaries_thousand_brl = EXCLUDED.salaries_thousand_brl,
            dataset_version_id = EXCLUDED.dataset_version_id,
            updated_at = now()
      RETURNING (xmax = 0) AS inserted
    `.execute(this.db);

    const inserted = written.rows.filter((row) => row.inserted).length;

    return { inserted, updated: rows.length - inserted };
  }

  async finalize(input: EmploymentFinalizeInput): Promise<PublishDatasetResult> {
    const { datasetKey, versionId, reference, checksum, minRows } = input;

    return this.db.transaction().execute(async (trx) => {
      const counted = await sql<{ count: string }>`
        SELECT count(*)::text AS count
        FROM geo.municipality_cnae_employment
        WHERE dataset_version_id = ${versionId}::bigint
      `.execute(trx);
      const total = Number(counted.rows[0]?.count ?? 0);

      if (total < minRows) {
        throw new Error(
          `CEMPRE load has ${total} rows, below the floor of ${minRows}; publish refused`,
        );
      }

      // A class that stopped reporting for a municipality is gone from the source.
      await sql`
        DELETE FROM geo.municipality_cnae_employment
        WHERE reference = ${reference}
          AND dataset_version_id IS DISTINCT FROM ${versionId}::bigint
      `.execute(trx);
      await sql`
        DELETE FROM geo.municipality_employment
        WHERE reference = ${reference}
          AND dataset_version_id IS DISTINCT FROM ${versionId}::bigint
      `.execute(trx);

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
            row_count = ${total}
        WHERE id = ${versionId}::bigint
      `.execute(trx);

      await sql`DELETE FROM geo.dataset_change WHERE dataset_version_id = ${versionId}`.execute(
        trx,
      );
      await sql`
        INSERT INTO geo.dataset_change
          (dataset_version_id, previous_version_id, entity_type, change_type, entity_count)
        VALUES (${versionId}, ${previous.rows[0]?.id ?? null}, 'municipality_cnae_employment',
                'added', ${total})
      `.execute(trx);

      return { versionId, inserted: total, updated: 0 };
    });
  }

  async discard(datasetKey: string, versionId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`
        DELETE FROM geo.municipality_cnae_employment
        WHERE dataset_version_id = ${versionId}::bigint
      `.execute(trx);
      await sql`
        DELETE FROM geo.municipality_employment
        WHERE dataset_version_id = ${versionId}::bigint
      `.execute(trx);
      await sql`
        DELETE FROM geo.dataset_version
        WHERE id = ${versionId}::bigint AND dataset_key = ${datasetKey} AND status = 'staging'
      `.execute(trx);
    });
  }

  /** The fact table references the class, so the taxonomy is written first. */
  private async upsertClasses(
    trx: Transaction<GeoDB>,
    versionId: string,
    categories: CnaeCategoryInput[],
  ): Promise<void> {
    const payload = JSON.stringify(
      categories.map((category) => ({ code: category.code, name: category.name })),
    );

    await sql`
      INSERT INTO geo.cnae_class (code, name, dataset_version_id, updated_at)
      SELECT source.code, source.name, ${versionId}::bigint, now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS source(code text, name text)
      ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            dataset_version_id = EXCLUDED.dataset_version_id,
            updated_at = now()
    `.execute(trx);
  }
}
