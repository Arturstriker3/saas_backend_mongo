import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { GEO_KYSELY, type GeoDatabase } from '../../../../common/database/geo/geo.connection';
import type { GeoDB } from '../../../../common/database/geo/geo-db.types';
import type { ChunkStats, PublishDatasetResult } from '../../domain/dataset-publisher.interface';
import type {
  EstablishmentFinalizeInput,
  EstablishmentPublisher,
  EstablishmentVersionInput,
} from '../../domain/establishment-publisher.interface';
import type { CnaeInput, CompanyInput, EstablishmentInput } from '../../domain/establishment.types';

/**
 * Rows per statement. While loading there is no index and no conflict check, so
 * a large chunk beats many small ones.
 */
const CHUNK_SIZE = 10_000;

interface LoadIndex {
  /** Name used while the table is still `_load`; avoids clashing with the live one. */
  temp: string;
  /** Name the index carries after the swap, so queries keep hitting it. */
  name: string;
  primaryKey?: string;
  columns?: string;
  /** Index method; defaults to `btree`. */
  method?: string;
  /** Partial index predicate. */
  where?: string;
}

interface LoadTarget {
  /** Published table the API reads. */
  table: string;
  /** Mirror that receives the version being built. */
  load: string;
  indexes: LoadIndex[];
  versionConstraint: string;
}

const TARGETS: LoadTarget[] = [
  {
    table: 'geo.cnae',
    load: 'geo.cnae_load',
    indexes: [{ temp: 'cnae_load_pkey', name: 'cnae_pkey', primaryKey: 'code' }],
    versionConstraint: 'cnae_dataset_version_id_fkey',
  },
  {
    table: 'geo.company',
    load: 'geo.company_load',
    indexes: [
      { temp: 'company_load_pkey', name: 'company_pkey', primaryKey: 'cnpj_basico' },
      { temp: 'company_load_version', name: 'company_version', columns: 'dataset_version_id' },
      {
        temp: 'company_load_legal_name_trgm',
        name: 'company_legal_name_trgm',
        columns: 'legal_name gin_trgm_ops',
        method: 'gin',
      },
    ],
    versionConstraint: 'company_dataset_version_id_fkey',
  },
  {
    table: 'geo.establishment',
    load: 'geo.establishment_load',
    indexes: [
      { temp: 'establishment_load_pkey', name: 'establishment_pkey', primaryKey: 'cnpj' },
      { temp: 'establishment_load_company', name: 'establishment_company', columns: 'cnpj_basico' },
      {
        temp: 'establishment_load_municipality_cnae',
        name: 'establishment_municipality_cnae',
        columns: 'municipality_code, cnae_principal',
      },
      {
        temp: 'establishment_load_active_municipality_cnae',
        name: 'establishment_active_municipality_cnae',
        columns: 'municipality_code, cnae_principal, cnpj',
        where: 'registration_status = 2',
      },
      {
        temp: 'establishment_load_trade_name_trgm',
        name: 'establishment_trade_name_trgm',
        columns: 'trade_name gin_trgm_ops',
        method: 'gin',
        where: 'trade_name IS NOT NULL',
      },
      {
        temp: 'establishment_load_version',
        name: 'establishment_version',
        columns: 'dataset_version_id',
      },
    ],
    versionConstraint: 'establishment_dataset_version_id_fkey',
  },
];

/**
 * Aggregate views created by migration `017`. They are refreshed inside the swap
 * transaction, so the numbers and the establishments they describe switch in the
 * same commit. The municipality view comes first: the UF view is derived from it.
 */
const STATISTIC_VIEWS = ['geo.mv_establishment_municipality_cnae', 'geo.mv_establishment_uf_cnae'];

/**
 * Publishes the CNPJ registry by loading a mirror table and swapping it in.
 *
 * A monthly snapshot replaces the whole dataset, so merging row by row is pure
 * waste: the load runs without indexes or conflict checks, the indexes are built
 * once at the end, and `publish` swaps the tables inside one transaction. Readers
 * keep seeing the previous snapshot until the swap commits.
 */
@Injectable()
export class EstablishmentPublisherPostgis implements EstablishmentPublisher {
  private readonly logger = new Logger('EstablishmentPublisher');

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

    await this.resetLoadTables();

    return versionId;
  }

  async writeCnaes(versionId: string, rows: CnaeInput[]): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(rows.slice(index, index + CHUNK_SIZE));
      const written = await sql<{ count: string }>`
        WITH inserted AS (
          INSERT INTO geo.cnae_load (code, description, dataset_version_id, updated_at)
          SELECT source.code, source.description, ${versionId}::bigint, now()
          FROM jsonb_to_recordset(${payload}::jsonb) AS source(code text, description text)
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM inserted
      `.execute(this.db);

      stats.inserted += Number(written.rows[0]?.count ?? 0);
    }

    return stats;
  }

  async writeCompanies(versionId: string, rows: CompanyInput[]): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };

    for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
      const payload = JSON.stringify(
        rows.slice(index, index + CHUNK_SIZE).map((row) => ({
          cnpj_basico: row.companyCode,
          legal_name: row.legalName,
          legal_nature_code: row.legalNatureCode,
          size_code: row.sizeCode,
          capital_social: row.capitalSocial,
        })),
      );

      const written = await sql<{ count: string }>`
        WITH inserted AS (
          INSERT INTO geo.company_load
            (cnpj_basico, legal_name, legal_nature_code, size_code, capital_social,
             dataset_version_id, updated_at)
          SELECT source.cnpj_basico,
                 source.legal_name,
                 source.legal_nature_code,
                 source.size_code,
                 source.capital_social,
                 ${versionId}::bigint,
                 now()
          FROM jsonb_to_recordset(${payload}::jsonb) AS source(
            cnpj_basico text,
            legal_name text,
            legal_nature_code text,
            size_code text,
            capital_social numeric
          )
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM inserted
      `.execute(this.db);

      stats.inserted += Number(written.rows[0]?.count ?? 0);
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
          street_type: row.streetType,
          street: row.street,
          street_number: row.streetNumber,
          complement: row.complement,
          neighborhood: row.neighborhood,
          cep: row.cep,
          uf: row.uf,
          municipality_code: row.municipalityCode,
        })),
      );

      const written = await sql<{ count: string }>`
        WITH inserted AS (
          INSERT INTO geo.establishment_load
            (cnpj, cnpj_basico, trade_name, is_headquarters, cnae_principal,
             registration_status, opened_on, street_type, street, street_number,
             complement, neighborhood, cep, uf, municipality_code,
             dataset_version_id, updated_at)
          SELECT source.cnpj,
                 source.cnpj_basico,
                 source.trade_name,
                 source.is_headquarters,
                 source.cnae_principal,
                 source.registration_status,
                 source.opened_on::date,
                 source.street_type,
                 source.street,
                 source.street_number,
                 source.complement,
                 source.neighborhood,
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
            street_type text,
            street text,
            street_number text,
            complement text,
            neighborhood text,
            cep text,
            uf text,
            municipality_code text
          )
          RETURNING 1
        )
        SELECT count(*)::text AS count FROM inserted
      `.execute(this.db);

      stats.inserted += Number(written.rows[0]?.count ?? 0);
    }

    return stats;
  }

  async finalize(input: EstablishmentFinalizeInput): Promise<PublishDatasetResult> {
    const { datasetKey, versionId, checksum, stats, cnaeStats, companyStats } = input;

    return this.db.transaction().execute(async (trx) => {
      // Building the indexes of tens of millions of rows takes minutes; the
      // session-level timeout would cancel them.
      await sql`SET LOCAL statement_timeout = 0`.execute(trx);

      const previous = await sql<{ id: string }>`
        SELECT id
        FROM geo.dataset_version
        WHERE dataset_key = ${datasetKey} AND status = 'published' AND id <> ${versionId}
        LIMIT 1
      `.execute(trx);

      for (const target of TARGETS) {
        await this.swap(trx, target);
      }

      for (const view of STATISTIC_VIEWS) {
        await sql`REFRESH MATERIALIZED VIEW ${sql.table(view)}`.execute(trx);
      }

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
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'company', 'added',
           ${companyStats.inserted}),
          (${versionId}, ${previous.rows[0]?.id ?? null}, 'cnae', 'added', ${cnaeStats.inserted})
      `.execute(trx);

      return { versionId, inserted: stats.inserted, updated: stats.updated };
    });
  }

  async discard(datasetKey: string, versionId: string): Promise<void> {
    await this.resetLoadTables();
    await sql`
      DELETE FROM geo.dataset_version WHERE id = ${versionId}::bigint AND status = 'staging'
    `.execute(this.db);
  }

  /**
   * Recreates the mirrors and empties them. `CREATE ... IF NOT EXISTS` keeps this
   * self-healing: the previous swap renamed them away.
   *
   * The mirror is a normal (logged) table on purpose: after the swap it *becomes*
   * the published table, and an unlogged table is truncated by the first crash
   * recovery. Loading is still fast because it carries no index and no constraint.
   */
  private async resetLoadTables(): Promise<void> {
    for (const target of TARGETS) {
      await sql`
        CREATE TABLE IF NOT EXISTS ${sql.table(target.load)}
          (LIKE ${sql.table(target.table)} INCLUDING DEFAULTS)
      `.execute(this.db);
      await sql`TRUNCATE ${sql.table(target.load)}`.execute(this.db);
    }
  }

  /** Builds the indexes, replaces the live table and renames the indexes back. */
  private async swap(trx: Transaction<GeoDB>, target: LoadTarget): Promise<void> {
    for (const index of target.indexes) {
      if (index.primaryKey) {
        await this.dropDuplicates(trx, target, index.primaryKey);

        await sql`
          ALTER TABLE ${sql.table(target.load)}
            ADD CONSTRAINT ${sql.id(index.temp)} PRIMARY KEY (${sql.raw(index.primaryKey)})
        `.execute(trx);
        continue;
      }

      await sql`
        CREATE INDEX ${sql.id(index.temp)}
          ON ${sql.table(target.load)}
          USING ${sql.raw(index.method ?? 'btree')} (${sql.raw(index.columns ?? '')})
          ${index.where ? sql`WHERE ${sql.raw(index.where)}` : sql``}
      `.execute(trx);
    }

    await sql`DROP TABLE ${sql.table(target.table)}`.execute(trx);
    await sql`
      ALTER TABLE ${sql.table(target.load)}
        RENAME TO ${sql.id(target.table.split('.')[1] ?? target.table)}
    `.execute(trx);

    for (const index of target.indexes) {
      if (index.primaryKey) {
        await sql`
          ALTER TABLE ${sql.table(target.table)}
            RENAME CONSTRAINT ${sql.id(index.temp)} TO ${sql.id(index.name)}
        `.execute(trx);
        continue;
      }

      await sql`
        ALTER INDEX ${sql.id('geo', index.temp)} RENAME TO ${sql.id(index.name)}
      `.execute(trx);
    }

    // `LIKE` does not carry foreign keys, so the reference is recreated without
    // validating the rows in the publish transaction.
    await sql`
      ALTER TABLE ${sql.table(target.table)}
        ADD CONSTRAINT ${sql.id(target.versionConstraint)}
        FOREIGN KEY (dataset_version_id) REFERENCES geo.dataset_version(id)
        ON DELETE SET NULL NOT VALID
    `.execute(trx);
  }

  /**
   * The registry repeats a key now and then, and a single repetition would block
   * the primary key after the whole load. The table is analysed first so the two
   * scans are planned as a hash join.
   */
  private async dropDuplicates(
    trx: Transaction<GeoDB>,
    target: LoadTarget,
    key: string,
  ): Promise<void> {
    await sql`ANALYZE ${sql.table(target.load)}`.execute(trx);

    const { rows } = await sql<{ count: string }>`
      WITH removed AS (
        DELETE FROM ${sql.table(target.load)} AS duplicate
        USING ${sql.table(target.load)} AS keeper
        WHERE duplicate.ctid > keeper.ctid
          AND duplicate.${sql.raw(key)} = keeper.${sql.raw(key)}
        RETURNING 1
      )
      SELECT count(*)::text AS count FROM removed
    `.execute(trx);

    const removed = Number(rows[0]?.count ?? 0);
    if (removed > 0) {
      this.logger.warn(`${target.load}: dropped ${removed} row(s) duplicated on ${key}`);
    }
  }
}
