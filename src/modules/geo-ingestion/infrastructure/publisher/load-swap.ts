import { sql, type Kysely, type Transaction } from 'kysely';
import type { GeoDB } from '../../../../common/database/geo/geo-db.types';
import type { DatasetStagingInput } from '../../domain/dataset-publisher.interface';

export interface LoadIndex {
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

export interface LoadTarget {
  /** Published table the API reads. */
  table: string;
  /** Mirror that receives the version being built. */
  load: string;
  indexes: LoadIndex[];
  versionConstraint: string;
}

/**
 * Opens the dataset version as `staging`, invisible to readers until finalized.
 * @param db - Connection that runs the statement.
 * @param input - Dataset key, reference and provenance.
 * @returns The version id the rows must carry.
 */
export async function openStagingVersion(
  db: Kysely<GeoDB>,
  input: DatasetStagingInput,
): Promise<string> {
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
  `.execute(db);

  const versionId = created.rows[0]?.id;
  if (!versionId) throw new Error('Could not create the dataset version');

  return versionId;
}

/**
 * Recreates the mirrors and empties them. `CREATE ... IF NOT EXISTS` keeps this
 * self-healing: the previous swap renamed them away.
 *
 * The mirror is a normal (logged) table on purpose: after the swap it *becomes*
 * the published table, and an unlogged table is truncated by the first crash
 * recovery. Loading is still fast because it carries no index and no constraint.
 * @param db - Connection that runs the statements.
 * @param targets - Tables to reset.
 */
export async function resetLoadTables(db: Kysely<GeoDB>, targets: LoadTarget[]): Promise<void> {
  for (const target of targets) {
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql.table(target.load)}
        (LIKE ${sql.table(target.table)} INCLUDING DEFAULTS)
    `.execute(db);
    await sql`TRUNCATE ${sql.table(target.load)}`.execute(db);
  }
}

/**
 * Builds the indexes, replaces the live table and renames the indexes back.
 * @param trx - Transaction of the publish, so readers switch atomically.
 * @param targets - Tables to swap.
 * @param warn - Receives the duplicated-key warnings.
 */
export async function swapTables(
  trx: Transaction<GeoDB>,
  targets: LoadTarget[],
  warn: (message: string) => void,
): Promise<void> {
  for (const target of targets) {
    for (const index of target.indexes) {
      if (index.primaryKey) {
        await dropDuplicates(trx, target, index.primaryKey, warn);

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
}

/**
 * The source repeats a key now and then, and a single repetition would block the
 * primary key after the whole load. The table is analysed first so the two scans
 * are planned as a hash join.
 */
async function dropDuplicates(
  trx: Transaction<GeoDB>,
  target: LoadTarget,
  key: string,
  warn: (message: string) => void,
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
  if (removed > 0) warn(`${target.load}: dropped ${removed} row(s) duplicated on ${key}`);
}
