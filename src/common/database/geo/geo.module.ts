import {
  Inject,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { loadEnv } from '../../config/env';
import {
  GEO_KYSELY,
  GEO_POOL,
  GeoDatabase,
  geoKyselyProvider,
  geoPoolProvider,
} from './geo.connection';
import { runGeoMigrations } from './geo.migrator';

@Injectable()
export class GeoMigrationService implements OnModuleInit {
  private readonly logger = new Logger('GeoMigrations');

  constructor(@Inject(GEO_KYSELY) private readonly db: GeoDatabase) {}

  async onModuleInit(): Promise<void> {
    if (loadEnv().GEO_RUN_MIGRATIONS_ON_START !== 'true') {
      this.logger.warn('Skipping migrations: GEO_RUN_MIGRATIONS_ON_START is disabled');
      return;
    }
    await runGeoMigrations(this.db);
  }
}

@Injectable()
export class GeoConnectionLifecycle implements OnApplicationShutdown {
  constructor(@Inject(GEO_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Module({
  providers: [geoPoolProvider, geoKyselyProvider, GeoMigrationService, GeoConnectionLifecycle],
  exports: [GEO_KYSELY, GEO_POOL],
})
export class GeoDatabaseModule {}
