import { Logger, Provider } from '@nestjs/common';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool, PoolConfig } from 'pg';
import { loadEnv } from '../../config/env';
import type { GeoDB } from './geo-db.types';

export const GEO_POOL = 'GEO_POOL';
export const GEO_KYSELY = 'GEO_KYSELY';

export type GeoDatabase = Kysely<GeoDB>;

const logger = new Logger('GeoDatabase');

function parseInteger(value: string, fallback: number, min: number): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) return fallback;
  return parsed;
}

export function buildGeoPoolConfig(connectionString: string): PoolConfig {
  const env = loadEnv();
  return {
    connectionString,
    max: parseInteger(env.GEO_DB_MAX_POOL_SIZE, 10, 1),
    min: parseInteger(env.GEO_DB_MIN_POOL_SIZE, 1, 0),
    connectionTimeoutMillis: parseInteger(env.GEO_DB_CONNECT_TIMEOUT_MS, 10000, 1),
    statement_timeout: parseInteger(env.GEO_DB_STATEMENT_TIMEOUT_MS, 30000, 1),
    application_name: 'marcato-geo',
  };
}

export function createGeoPool(connectionString?: string): Pool {
  const env = loadEnv();
  const pool = new Pool(buildGeoPoolConfig(connectionString ?? env.GEO_DB_URL));
  pool.on('error', (error) => logger.error(`Idle client error: ${error.message}`));
  return pool;
}

export function createGeoDatabase(pool: Pool): GeoDatabase {
  return new Kysely<GeoDB>({
    dialect: new PostgresDialect({ pool }),
    log: (event) => {
      if (event.level !== 'error') return;
      const message = event.error instanceof Error ? event.error.message : String(event.error);
      logger.error(`${event.query.sql} — ${message}`);
    },
  });
}

export const geoPoolProvider: Provider = {
  provide: GEO_POOL,
  useFactory: (): Pool => createGeoPool(),
};

export const geoKyselyProvider: Provider = {
  provide: GEO_KYSELY,
  useFactory: (pool: Pool): GeoDatabase => createGeoDatabase(pool),
  inject: [GEO_POOL],
};
