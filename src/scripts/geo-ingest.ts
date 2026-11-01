import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createGeoDatabase, createGeoPool } from '../common/database/geo/geo.connection';
import { IngestionJobRepositoryPostgis } from '../modules/geo-ingestion/infrastructure/ingestion-job.repository.postgis';

function readArgument(name: string): string | undefined {
  const inline = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const datasetKey = readArgument('dataset');
  const reference = readArgument('reference');

  if (!datasetKey || !reference) {
    throw new Error('Usage: bun run geo:ingest -- --dataset=<key> --reference=<reference>');
  }

  const db = createGeoDatabase(createGeoPool());
  try {
    const jobs = new IngestionJobRepositoryPostgis(db);
    const jobId = await jobs.enqueue(datasetKey, reference);
    Logger.log(`Job ${jobId} queued for ${datasetKey} ${reference}`, 'GeoIngest');
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.message : String(error), 'GeoIngest');
  process.exit(1);
});
