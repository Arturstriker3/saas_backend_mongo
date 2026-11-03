import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type {
  ChunkStats,
  DatasetStagingInput,
  PublishDatasetResult,
} from '../../domain/dataset-publisher.interface';
import type {
  SimplesFinalizeInput,
  SimplesPublisher,
} from '../../domain/simples-publisher.interface';
import type { SimplesInput } from '../../domain/establishment.types';
import {
  openStagingVersion,
  resetLoadTables,
  swapTables,
  type LoadTarget,
} from './load-swap';

/** Rows per statement: no index and no conflict check while the mirror is loading. */
const CHUNK_SIZE = 10_000;

const TARGETS: LoadTarget[] = [
  {
    table: 'geo.company_simples',
    load: 'geo.company_simples_load',
    indexes: [
      {
        temp: 'company_simples_load_pkey',
        name: 'company_simples_pkey',
        primaryKey: 'cnpj_basico',
      },
      {
        temp: 'company_simples_load_version',
        name: 'company_simples_version',
        columns: 'dataset_version_id',
      },
    ],
    versionConstraint: 'company_simples_dataset_version_id_fkey',
  },
];

@Injectable()
export class SimplesPublisherPostgis implements SimplesPublisher {
  private readonly logger = new Logger('SimplesPublisher');

  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async begin(input: DatasetStagingInput): Promise<string> {
    const versionId = await openStagingVersion(this.db, input);

    await resetLoadTables(this.db, TARGETS);

    return versionId;
  }

  async writeChunk(versionId: string, rows: SimplesInput[]): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(
        rows.slice(index, index + CHUNK_SIZE).map((row) => ({
          cnpj_basico: row.companyCode,
          simples_option: row.simplesOption,
          simples_since: row.simplesSince,
          simples_until: row.simplesUntil,
          mei_option: row.meiOption,
          mei_since: row.meiSince,
          mei_until: row.meiUntil,
        })),
      );

      const written = await sql<{ count: string }>`
        WITH inserted AS (
          INSERT INTO geo.company_simples_load
            (cnpj_basico, simples_option, simples_since, simples_until, mei_option,
             mei_since, mei_until, dataset_version_id, updated_at)
          SELECT source.cnpj_basico,
                 source.simples_option,
                 source.simples_since::date,
                 source.simples_until::date,
                 source.mei_option,
                 source.mei_since::date,
                 source.mei_until::date,
                 ${versionId}::bigint,
                 now()
          FROM jsonb_to_recordset(${payload}::jsonb) AS source(
            cnpj_basico text,
            simples_option boolean,
            simples_since text,
            simples_until text,
            mei_option boolean,
            mei_since text,
            mei_until text
          )
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM inserted
      `.execute(this.db);

      stats.inserted += Number(written.rows[0]?.count ?? 0);
    }

    return stats;
  }

  async finalize(input: SimplesFinalizeInput): Promise<PublishDatasetResult> {
    const { datasetKey, versionId, checksum, stats, minRows } = input;

    return this.db.transaction().execute(async (trx) => {
      // Building the primary key of tens of millions of rows takes minutes; the
      // session-level timeout would cancel it.
      await sql`SET LOCAL statement_timeout = 0`.execute(trx);

      const counted = await sql<{ count: string }>`
        SELECT count(*)::text AS count FROM geo.company_simples_load
      `.execute(trx);
      const total = Number(counted.rows[0]?.count ?? 0);

      if (total < minRows) {
        throw new Error(
          `Simples load has ${total} rows, below the floor of ${minRows}; publish refused`,
        );
      }

      const previous = await sql<{ id: string }>`
        SELECT id
        FROM geo.dataset_version
        WHERE dataset_key = ${datasetKey} AND status = 'published' AND id <> ${versionId}
        LIMIT 1
      `.execute(trx);

      await swapTables(trx, TARGETS, (message) => this.logger.warn(message));

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
        WHERE id = ${versionId}
      `.execute(trx);

      await sql`DELETE FROM geo.dataset_change WHERE dataset_version_id = ${versionId}`.execute(
        trx,
      );

      await sql`
        INSERT INTO geo.dataset_change
          (dataset_version_id, previous_version_id, entity_type, change_type, entity_count)
        VALUES (${versionId}, ${previous.rows[0]?.id ?? null}, 'company_simples', 'added', ${total})
      `.execute(trx);

      return { versionId, inserted: total, updated: stats.updated };
    });
  }

  async discard(datasetKey: string, versionId: string): Promise<void> {
    await resetLoadTables(this.db, TARGETS);
    await sql`
      DELETE FROM geo.dataset_version WHERE id = ${versionId}::bigint AND status = 'staging'
    `.execute(this.db);
  }
}
