import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { PublishDatasetResult } from '../../domain/dataset-publisher.interface';
import type {
  LocalityPublisher,
  PublishLocalityInput,
} from '../../domain/locality-publisher.interface';

@Injectable()
export class LocalityPublisherPostgis implements LocalityPublisher {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async publish(input: PublishLocalityInput): Promise<PublishDatasetResult> {
    const { datasetKey, reference, localities } = input;

    return this.db.transaction().execute(async (trx) => {
      const created = await sql<{ id: string }>`
        INSERT INTO geo.dataset_version
          (dataset_key, reference, status, extracted_at, methodology, source_url, checksum, row_count)
        VALUES
          (${datasetKey}, ${reference}, 'staging', ${input.extractedAt},
           ${input.methodology}, ${input.sourceUrl}, '', 0)
        ON CONFLICT (dataset_key, reference) DO UPDATE
          SET status = 'staging',
              extracted_at = EXCLUDED.extracted_at,
              published_at = NULL,
              methodology = EXCLUDED.methodology,
              source_url = EXCLUDED.source_url
        RETURNING id
      `.execute(trx);

      const versionId = created.rows[0]?.id;
      if (!versionId) throw new Error('Could not create the dataset version');

      const payload = JSON.stringify(
        localities.map((locality) => ({
          level: locality.level,
          ibge_code: locality.ibgeCode,
          name: locality.name,
          search_name: locality.searchName,
          uf_code: locality.ufCode,
          uf_sigla: locality.ufSigla,
        })),
      );

      const written = await sql<{ inserted: boolean }>`
        INSERT INTO geo.locality
          (level, ibge_code, name, search_name, uf_code, uf_sigla, dataset_version_id, updated_at)
        SELECT source.level,
               source.ibge_code,
               source.name,
               source.search_name,
               source.uf_code,
               source.uf_sigla,
               ${versionId}::bigint,
               now()
        FROM jsonb_to_recordset(${payload}::jsonb) AS source(
          level text,
          ibge_code text,
          name text,
          search_name text,
          uf_code text,
          uf_sigla text
        )
        ON CONFLICT (level, ibge_code) DO UPDATE
          SET name = EXCLUDED.name,
              search_name = EXCLUDED.search_name,
              uf_code = EXCLUDED.uf_code,
              uf_sigla = EXCLUDED.uf_sigla,
              dataset_version_id = EXCLUDED.dataset_version_id,
              updated_at = now()
        RETURNING (xmax = 0) AS inserted
      `.execute(trx);

      // A code that disappeared from the source was merged or extinguished by
      // the IBGE; it must not survive in the registry.
      await sql`
        DELETE FROM geo.locality WHERE dataset_version_id IS DISTINCT FROM ${versionId}::bigint
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

      const inserted = written.rows.filter((row) => row.inserted).length;
      const updated = written.rows.length - inserted;

      await sql`
        UPDATE geo.dataset_version
        SET status = 'published',
            published_at = now(),
            checksum = ${input.checksum},
            row_count = ${written.rows.length}
        WHERE id = ${versionId}
      `.execute(trx);

      const previousVersionId = previous.rows[0]?.id ?? null;

      await sql`DELETE FROM geo.dataset_change WHERE dataset_version_id = ${versionId}`.execute(trx);
      await sql`
        INSERT INTO geo.dataset_change
          (dataset_version_id, previous_version_id, entity_type, change_type, entity_count)
        VALUES
          (${versionId}, ${previousVersionId}, 'locality', 'added', ${inserted}),
          (${versionId}, ${previousVersionId}, 'locality', 'changed', ${updated})
      `.execute(trx);

      return { versionId, inserted, updated };
    });
  }
}
