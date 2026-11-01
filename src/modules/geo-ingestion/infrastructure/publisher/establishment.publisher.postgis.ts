import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { GeoDB } from '../../../../common/database/geo/geo-db.types';
import type { ChunkStats, PublishDatasetResult } from '../../domain/dataset-publisher.interface';
import type {
  EstablishmentFinalizeInput,
  EstablishmentPublisher,
  EstablishmentVersionInput,
} from '../../domain/establishment-publisher.interface';
import type { CnaeInput, EstablishmentInput } from '../../domain/establishment.types';

const CHUNK_SIZE = 5_000;

@Injectable()
export class EstablishmentPublisherPostgis implements EstablishmentPublisher {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async begin(input: EstablishmentVersionInput): Promise<string> {
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

  async writeCnaes(versionId: string, rows: CnaeInput[]): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(rows.slice(index, index + CHUNK_SIZE));
      const { rows: written } = await sql<{ inserted: boolean }>`
        INSERT INTO geo.cnae (code, description, dataset_version_id, updated_at)
        SELECT source.code, source.description, ${versionId}::bigint, now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS source(code text, description text)
        ON CONFLICT (code) DO UPDATE
          SET description = EXCLUDED.description,
              dataset_version_id = EXCLUDED.dataset_version_id,
              updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `.execute(this.db);

      const inserted = written.filter((row) => row.inserted).length;
      stats.inserted += inserted;
      stats.updated += written.length - inserted;
    }

    return stats;
  }

  async writeEstablishments(versionId: string, rows: EstablishmentInput[]): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(
        rows.slice(index, index + CHUNK_SIZE).map((row) => ({
          cnpj: row.cnpj,
          cnpj_basico: row.companyCode,
          trade_name: row.tradeName,
          is_headquarters: row.isHeadquarters,
          cnae_principal: row.cnaeCode,
          registration_status: row.registrationStatus,
          opened_on: row.openedOn,
          cep: row.cep,
          uf: row.uf,
          municipality_code: row.municipalityCode,
        })),
      );

      const { rows: written } = await sql<{ inserted: boolean }>`
        INSERT INTO geo.establishment
          (cnpj, cnpj_basico, trade_name, is_headquarters, cnae_principal,
           registration_status, opened_on, cep, uf, municipality_code,
           dataset_version_id, updated_at)
        SELECT source.cnpj,
               source.cnpj_basico,
               source.trade_name,
               source.is_headquarters,
               source.cnae_principal,
               source.registration_status,
               source.opened_on::date,
               source.cep,
               source.uf,
               source.municipality_code,
               ${versionId}::bigint,
               now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS source(
          cnpj text,
          cnpj_basico text,
          trade_name text,
          is_headquarters boolean,
          cnae_principal text,
          registration_status smallint,
          opened_on text,
          cep text,
          uf text,
          municipality_code text
        )
        ON CONFLICT (cnpj) DO UPDATE
          SET cnpj_basico = EXCLUDED.cnpj_basico,
              trade_name = EXCLUDED.trade_name,
              is_headquarters = EXCLUDED.is_headquarters,
              cnae_principal = EXCLUDED.cnae_principal,
              registration_status = EXCLUDED.registration_status,
              opened_on = EXCLUDED.opened_on,
              cep = EXCLUDED.cep,
              uf = EXCLUDED.uf,
              municipality_code = EXCLUDED.municipality_code,
              dataset_version_id = EXCLUDED.dataset_version_id,
              updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `.execute(this.db);

      const inserted = written.filter((row) => row.inserted).length;
      stats.inserted += inserted;
      stats.updated += written.length - inserted;
    }

    return stats;
  }

  async finalize(input: EstablishmentFinalizeInput): Promise<PublishDatasetResult> {
    const { datasetKey, versionId, checksum, stats, cnaeStats } = input;

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
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'establishment', 'added',
           ${stats.inserted}),
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'establishment', 'changed',
           ${stats.updated}),
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'cnae', 'added',
           ${cnaeStats.inserted}),
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'cnae', 'changed',
           ${cnaeStats.updated})
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
      await this.revertOrDelete(trx, 'geo.cnae', previousId, versionId);
      await this.revertOrDelete(trx, 'geo.establishment', previousId, versionId);

      await sql`
        DELETE FROM geo.dataset_version WHERE id = ${versionId}::bigint AND status = 'staging'
      `.execute(trx);
    });
  }

  /**
   * Gives the rows of a failed version back to the previous publication.
   * `geo.cnae` and `geo.establishment` share the reverting rule, so the table
   * name is chosen from a closed list instead of interpolating user input.
   */
  private async revertOrDelete(
    trx: Transaction<GeoDB>,
    table: 'geo.cnae' | 'geo.establishment',
    previousVersionId: string | null,
    versionId: string,
  ): Promise<void> {
    if (previousVersionId) {
      await sql`
        UPDATE ${sql.table(table)}
        SET dataset_version_id = ${previousVersionId}::bigint
        WHERE dataset_version_id = ${versionId}::bigint
      `.execute(trx);
      return;
    }

    await sql`
      DELETE FROM ${sql.table(table)} WHERE dataset_version_id = ${versionId}::bigint
    `.execute(trx);
  }
}
