import type { Migration } from 'kysely/migration';
import { migration001Initial } from './001_initial';
import { migration002Region } from './002_region';
import { migration003ShapefileDatasets } from './003_shapefile_datasets';
import { migration004ScheduleRunner } from './004_schedule_runner';
import { migration005CensoIndicators } from './005_censo_indicators';
import { migration006Establishments } from './006_establishments';
import { migration007Companies } from './007_companies';
import { migration008EstablishmentAddress } from './008_establishment_address';

export const geoMigrations: Record<string, Migration> = {
  '001_initial': migration001Initial,
  '002_region': migration002Region,
  '003_shapefile_datasets': migration003ShapefileDatasets,
  '004_schedule_runner': migration004ScheduleRunner,
  '005_censo_indicators': migration005CensoIndicators,
  '006_establishments': migration006Establishments,
  '007_companies': migration007Companies,
  '008_establishment_address': migration008EstablishmentAddress,
};
