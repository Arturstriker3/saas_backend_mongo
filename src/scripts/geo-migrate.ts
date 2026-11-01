import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createGeoDatabase, createGeoPool } from '../common/database/geo/geo.connection';
import { runGeoMigrations } from '../common/database/geo/geo.migrator';

async function main(): Promise<void> {
  const db = createGeoDatabase(createGeoPool());
  try {
    await runGeoMigrations(db);
    Logger.log('Geo migrations are up to date', 'GeoMigrate');
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'GeoMigrate');
  process.exit(1);
});
