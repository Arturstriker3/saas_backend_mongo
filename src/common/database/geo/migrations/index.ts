import type { Migration } from 'kysely/migration';
import { migration001Initial } from './001_initial';
import { migration002Region } from './002_region';
import { migration003ShapefileDatasets } from './003_shapefile_datasets';
import { migration004ScheduleRunner } from './004_schedule_runner';

export const geoMigrations: Record<string, Migration> = {
  '001_initial': migration001Initial,
  '002_region': migration002Region,
  '003_shapefile_datasets': migration003ShapefileDatasets,
  '004_schedule_runner': migration004ScheduleRunner,
};
