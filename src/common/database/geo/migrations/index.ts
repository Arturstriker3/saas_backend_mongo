import type { Migration } from 'kysely/migration';
import { migration001Initial } from './001_initial';
import { migration002Region } from './002_region';
import { migration003ShapefileDatasets } from './003_shapefile_datasets';
import { migration004ScheduleRunner } from './004_schedule_runner';
import { migration005CensoIndicators } from './005_censo_indicators';
import { migration006Establishments } from './006_establishments';
import { migration007Companies } from './007_companies';
import { migration008EstablishmentAddress } from './008_establishment_address';
import { migration009EstablishmentQueryIndexes } from './009_establishment_query_indexes';
import { migration010DataHealth } from './010_data_health';
import { migration011Foundation } from './011_foundation';
import { migration012HealthFoundation } from './012_health_foundation';
import { migration013Addresses } from './013_addresses';
import { migration014HealthAddresses } from './014_health_addresses';
import { migration015AddressKey } from './015_address_key';
import { migration016EstablishmentListing } from './016_establishment_listing';

export const geoMigrations: Record<string, Migration> = {
  '001_initial': migration001Initial,
  '002_region': migration002Region,
  '003_shapefile_datasets': migration003ShapefileDatasets,
  '004_schedule_runner': migration004ScheduleRunner,
  '005_censo_indicators': migration005CensoIndicators,
  '006_establishments': migration006Establishments,
  '007_companies': migration007Companies,
  '008_establishment_address': migration008EstablishmentAddress,
  '009_establishment_query_indexes': migration009EstablishmentQueryIndexes,
  '010_data_health': migration010DataHealth,
  '011_foundation': migration011Foundation,
  '012_health_foundation': migration012HealthFoundation,
  '013_addresses': migration013Addresses,
  '014_health_addresses': migration014HealthAddresses,
  '015_address_key': migration015AddressKey,
  '016_establishment_listing': migration016EstablishmentListing,
};
