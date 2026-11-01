import { Inject, Injectable } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { GeoDB, RegionLevel } from '../../../../common/database/geo/geo-db.types';
import type {
  ChunkStats,
  DatasetPublisher,
  DatasetVersionInput,
  FinalizeDatasetInput,
  PublishDatasetInput,
  PublishDatasetResult,
} from '../../domain/dataset-publisher.interface';
import type { RegionInput } from '../../domain/region.types';

const LEVEL_ORDER: RegionLevel[] = ['state', 'municipality', 'district', 'neighborhood', 'sector'];
const CHUNK_SIZE = 250;
const STREAM_CHUNK_SIZE = 5_000;

@Injectable()
export class DatasetPublisherPostgis implements DatasetPublisher {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async publish(input: PublishDatasetInput): Promise<PublishDatasetResult> {
    const versionId = await this.begin(input);
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    try {
      for (let index = 0; index < input.regions.length; index += STREAM_CHUNK_SIZE) {
        const chunk = await this.writeChunk(
          versionId,
          input.regions.slice(index, index + STREAM_CHUNK_SIZE),
          input.sourceSrid,
        );
        stats.inserted += chunk.inserted;
        stats.updated += chunk.updated;
      }

      return await this.finalize({
        datasetKey: input.datasetKey,
        versionId,
        checksum: input.checksum,
        stats,
      });
    } catch (error) {
      await this.discard(input.datasetKey, versionId);
      throw error;
    }
  }

  async begin(input: DatasetVersionInput): Promise<string> {
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

  async writeChunk(
    versionId: string,
    regions: RegionInput[],
    sourceSrid: number,
  ): Promise<ChunkStats> {
    return this.db
      .transaction()
      .execute((trx) => this.writeRegions(trx, versionId, regions, sourceSrid));
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

      await this.assertGeometriesAreValid(trx, versionId);

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

      await this.writeChanges(trx, versionId, previous.rows[0]?.id ?? null, stats);

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
          UPDATE geo.region
          SET dataset_version_id = ${previousId}::bigint
          WHERE dataset_version_id = ${versionId}::bigint
        `.execute(trx);
      } else {
        await sql`
          DELETE FROM geo.region WHERE dataset_version_id = ${versionId}::bigint
        `.execute(trx);
      }

      await sql`
        DELETE FROM geo.dataset_version WHERE id = ${versionId}::bigint AND status = 'staging'
      `.execute(trx);
    });
  }

  private async writeRegions(
    trx: Transaction<GeoDB>,
    versionId: string,
    regions: RegionInput[],
    sourceSrid: number,
  ): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (const level of LEVEL_ORDER) {
      const rows = regions.filter((region) => region.level === level);
      for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
        const chunk = await this.upsertChunk(
          trx,
          versionId,
          rows.slice(index, index + CHUNK_SIZE),
          sourceSrid,
        );
        stats.inserted += chunk.inserted;
        stats.updated += chunk.updated;
      }
    }

    return stats;
  }

  private async upsertChunk(
    trx: Transaction<GeoDB>,
    versionId: string,
    regions: RegionInput[],
    sourceSrid: number,
  ): Promise<ChunkStats> {
    const payload = JSON.stringify(
      regions.map((region) => ({
        level: region.level,
        ibge_code: region.ibgeCode,
        parent_code: region.parentCode,
        name: region.name,
        search_name: region.searchName,
        geom: region.geometry,
      })),
    );

    const { rows } = await sql<{ inserted: boolean }>`
      INSERT INTO geo.region
        (level, ibge_code, parent_id, name, search_name, geom, area_km2, centroid,
         dataset_version_id, updated_at)
      SELECT source.level,
             source.ibge_code,
             parent.id,
             source.name,
             source.search_name,
             fixed.geom,
             ST_Area(fixed.geom::geography) / 1000000,
             ST_PointOnSurface(fixed.geom)::geography,
             ${versionId}::bigint,
             now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS source(
        level text, ibge_code text, parent_code text, name text, search_name text, geom text
      )
      CROSS JOIN LATERAL (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(source.geom), ${sourceSrid}::int) AS raw
      ) AS parsed
      CROSS JOIN LATERAL (
        SELECT ST_Transform(
                 ST_Multi(
                   ST_CollectionExtract(
                     CASE WHEN ST_IsValid(parsed.raw) THEN parsed.raw
                          ELSE ST_MakeValid(parsed.raw) END,
                     3
                   )
                 ),
                 4326
               ) AS geom
      ) AS fixed
      LEFT JOIN geo.region AS parent
        ON parent.ibge_code = source.parent_code
       AND parent.level = CASE source.level
                            WHEN 'municipality' THEN 'state'
                            WHEN 'district' THEN 'municipality'
                            WHEN 'neighborhood' THEN 'municipality'
                            WHEN 'sector' THEN 'municipality'
                            ELSE NULL
                          END
      ON CONFLICT (level, ibge_code) DO UPDATE
        SET parent_id = EXCLUDED.parent_id,
            name = EXCLUDED.name,
            search_name = EXCLUDED.search_name,
            geom = EXCLUDED.geom,
            area_km2 = EXCLUDED.area_km2,
            centroid = EXCLUDED.centroid,
            dataset_version_id = EXCLUDED.dataset_version_id,
            updated_at = now()
      RETURNING (xmax = 0) AS inserted
    `.execute(trx);

    const inserted = rows.filter((row) => row.inserted).length;
    return { inserted, updated: rows.length - inserted };
  }

  private async assertGeometriesAreValid(
    trx: Transaction<GeoDB>,
    versionId: string,
  ): Promise<void> {
    const { rows } = await sql<{ count: string }>`
      SELECT count(*) AS count
      FROM geo.region
      WHERE dataset_version_id = ${versionId} AND NOT ST_IsValid(geom)
    `.execute(trx);

    const invalid = Number(rows[0]?.count ?? 0);
    if (invalid > 0) {
      throw new Error(`${invalid} region geometries are invalid; version not published`);
    }
  }

  private async writeChanges(
    trx: Transaction<GeoDB>,
    versionId: string,
    previousVersionId: string | null,
    stats: ChunkStats,
  ): Promise<void> {
    await sql`DELETE FROM geo.dataset_change WHERE dataset_version_id = ${versionId}`.execute(trx);

    await sql`
      INSERT INTO geo.dataset_change
        (dataset_version_id, previous_version_id, entity_type, change_type, entity_count)
      VALUES
        (${versionId}, ${previousVersionId}, 'region', 'added', ${stats.inserted}),
        (${versionId}, ${previousVersionId}, 'region', 'changed', ${stats.updated})
    `.execute(trx);
  }
}
