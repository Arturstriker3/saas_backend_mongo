import { Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Migration, MigrationProvider } from 'kysely/migration';
import { Migrator } from 'kysely/migration';
import type { GeoDB } from './geo-db.types';
import { geoMigrations } from './migrations';

class StaticMigrationProvider implements MigrationProvider {
  constructor(private readonly migrations: Record<string, Migration>) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    return this.migrations;
  }
}

export async function runGeoMigrations(db: Kysely<GeoDB>): Promise<void> {
  const logger = new Logger('GeoMigrations');
  const migrator = new Migrator({
    db,
    provider: new StaticMigrationProvider(geoMigrations),
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === 'Error') {
      logger.error(`${result.migrationName}: ${result.status}`);
      continue;
    }
    logger.log(`${result.migrationName}: ${result.status}`);
  }

  if (error) {
    logger.error(`Geo migration failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
