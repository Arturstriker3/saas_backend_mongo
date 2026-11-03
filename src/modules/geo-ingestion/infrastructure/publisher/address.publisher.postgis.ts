import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { AddressInput } from '../../domain/address.types';
import type {
  AddressFinalizeInput,
  AddressPublisher,
  AddressVersionInput,
} from '../../domain/address-publisher.interface';
import type { ChunkStats, PublishDatasetResult } from '../../domain/dataset-publisher.interface';

/** No index and no conflict check while loading, so a big chunk is cheaper. */
const CHUNK_SIZE = 10_000;

interface LoadIndex {
  temp: string;
  name: string;
  columns: string;
  method?: string;
}

const INDEXES: LoadIndex[] = [
  { temp: 'address_load_municipality', name: 'address_municipality', columns: 'municipality_code' },
  { temp: 'address_load_sector', name: 'address_sector', columns: 'sector_code' },
  { temp: 'address_load_cep', name: 'address_cep', columns: 'cep' },
  {
    temp: 'address_load_street',
    name: 'address_street',
    columns: 'municipality_code, street',
  },
  {
    temp: 'address_load_geom_gist',
    name: 'address_geom_gist',
    columns: 'geom',
    method: 'gist',
  },
];

/**
 * Publishes the CNEFE base by loading a mirror table and swapping it in.
 *
 * The mirror is a normal (logged) table: after the swap it becomes the published
 * table, and an unlogged table would be truncated by the first crash recovery.
 */
@Injectable()
export class AddressPublisherPostgis implements AddressPublisher {
  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async begin(input: AddressVersionInput): Promise<string> {
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

    await this.resetLoadTable();

    return versionId;
  }

  async writeChunk(versionId: string, rows: AddressInput[]): Promise<ChunkStats> {
    let inserted = 0;

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(
        rows.slice(index, index + CHUNK_SIZE).map((row) => ({
          id: row.id,
          uf_code: row.ufCode,
          municipality_code: row.municipalityCode,
          district_code: row.districtCode,
          subdistrict_code: row.subdistrictCode,
          sector_code: row.sectorCode,
          block: row.block,
          face: row.face,
          cep: row.cep,
          locality: row.locality,
          street_type: row.streetType,
          street_title: row.streetTitle,
          street: row.street,
          street_number: row.streetNumber,
          modifier: row.modifier,
          complement: row.complement,
          latitude: row.latitude,
          longitude: row.longitude,
          geocode_level: row.geocodeLevel,
          species_code: row.speciesCode,
          establishment_name: row.establishmentName,
        })),
      );
      const written = await sql<{ count: string }>`
        WITH written AS (
          INSERT INTO geo.address_load
            (id, uf_code, municipality_code, district_code, subdistrict_code, sector_code,
             block, face, cep, locality, street_type, street_title, street, street_number,
             modifier, complement, latitude, longitude, geom, geocode_level, species_code,
             establishment_name, dataset_version_id, updated_at)
          SELECT source.id,
                 source.uf_code,
                 source.municipality_code,
                 source.district_code,
                 source.subdistrict_code,
                 source.sector_code,
                 source.block,
                 source.face,
                 source.cep,
                 source.locality,
                 source.street_type,
                 source.street_title,
                 source.street,
                 source.street_number,
                 source.modifier,
                 source.complement,
                 source.latitude,
                 source.longitude,
                 CASE
                   WHEN source.latitude BETWEEN -90 AND 90
                     AND source.longitude BETWEEN -180 AND 180
                   THEN ST_SetSRID(ST_MakePoint(source.longitude, source.latitude), 4326)
                 END,
                 source.geocode_level,
                 source.species_code,
                 source.establishment_name,
                 ${versionId}::bigint,
                 now()
          FROM jsonb_to_recordset(${payload}::jsonb) AS source(
            id text,
            uf_code text,
            municipality_code text,
            district_code text,
            subdistrict_code text,
            sector_code text,
            block text,
            face text,
            cep text,
            locality text,
            street_type text,
            street_title text,
            street text,
            street_number text,
            modifier text,
            complement text,
            latitude double precision,
            longitude double precision,
            geocode_level smallint,
            species_code smallint,
            establishment_name text
          )
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM written
      `.execute(this.db);

      inserted += Number(written.rows[0]?.count ?? 0);
    }

    return { inserted, updated: 0 };
  }

  async finalize(input: AddressFinalizeInput): Promise<PublishDatasetResult> {
    const { datasetKey, versionId, checksum, minRows } = input;

    return this.db.transaction().execute(async (trx) => {
      await sql`SET LOCAL statement_timeout = 0`.execute(trx);

      const counted = await sql<{ count: string }>`
        SELECT count(*)::text AS count FROM geo.address_load
      `.execute(trx);
      const total = Number(counted.rows[0]?.count ?? 0);

      if (total < minRows) {
        throw new Error(
          `Address load has ${total} rows, below the floor of ${minRows}; publish refused`,
        );
      }

      const published = total;

      // The CNEFE code identifies the address, not the record: the same address
      // is published once per species (a household and a shop share the code).
      // The pair is the natural key; a duplicate here is a source defect.
      await sql`
        ALTER TABLE geo.address_load
          ADD CONSTRAINT address_load_pkey PRIMARY KEY (id, species_code)
      `.execute(trx);

      for (const index of INDEXES) {
        await sql`
          CREATE INDEX ${sql.id(index.temp)}
            ON geo.address_load
            USING ${sql.raw(index.method ?? 'btree')} (${sql.raw(index.columns)})
        `.execute(trx);
      }

      await sql`DROP TABLE geo.address`.execute(trx);
      await sql`ALTER TABLE geo.address_load RENAME TO address`.execute(trx);

      await sql`
        ALTER TABLE geo.address RENAME CONSTRAINT address_load_pkey TO address_pkey
      `.execute(trx);

      for (const index of INDEXES) {
        await sql`ALTER INDEX ${sql.id('geo', index.temp)} RENAME TO ${sql.id(index.name)}`.execute(
          trx,
        );
      }

      await sql`
        ALTER TABLE geo.address
          ADD CONSTRAINT address_dataset_version_id_fkey
          FOREIGN KEY (dataset_version_id) REFERENCES geo.dataset_version(id)
          ON DELETE SET NULL NOT VALID
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
            row_count = ${published}
        WHERE id = ${versionId}
      `.execute(trx);

      const previousVersionId = previous.rows[0]?.id ?? null;

      await sql`DELETE FROM geo.dataset_change WHERE dataset_version_id = ${versionId}`.execute(
        trx,
      );
      await sql`
        INSERT INTO geo.dataset_change
          (dataset_version_id, previous_version_id, entity_type, change_type, entity_count)
        VALUES (${versionId}, ${previousVersionId}, 'address', 'added', ${published})
      `.execute(trx);

      return { versionId, inserted: published, updated: 0 };
    });
  }

  async discard(datasetKey: string, versionId: string): Promise<void> {
    await this.resetLoadTable();
    await sql`
      DELETE FROM geo.dataset_version WHERE id = ${versionId}::bigint AND status = 'staging'
    `.execute(this.db);
  }

  private async resetLoadTable(): Promise<void> {
    await sql`
      CREATE TABLE IF NOT EXISTS geo.address_load (LIKE geo.address INCLUDING DEFAULTS)
    `.execute(this.db);
    await sql`TRUNCATE geo.address_load`.execute(this.db);
  }
}
