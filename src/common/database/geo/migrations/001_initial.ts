import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Creates the geo schema and the operational tables of the geo data plane.
 * Domain tables (region, sector, establishment) arrive with their own adapters.
 */
export const migration001Initial = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`CREATE EXTENSION IF NOT EXISTS postgis`.execute(db);
    await sql`CREATE SCHEMA IF NOT EXISTS geo`.execute(db);

    await sql`
      CREATE TABLE geo.dataset_license (
        dataset_key text PRIMARY KEY,
        license text NOT NULL,
        redistribution_allowed boolean NOT NULL DEFAULT false,
        attribution_required boolean NOT NULL DEFAULT true,
        attribution_text text
      )
    `.execute(db);

    await sql`
      CREATE TABLE geo.dataset_version (
        id bigserial PRIMARY KEY,
        dataset_key text NOT NULL,
        reference text NOT NULL,
        status text NOT NULL DEFAULT 'staging',
        extracted_at timestamptz NOT NULL,
        published_at timestamptz,
        methodology text NOT NULL,
        source_url text NOT NULL,
        checksum text NOT NULL,
        row_count bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT dataset_version_status_check
          CHECK (status IN ('staging', 'published', 'superseded', 'failed'))
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX dataset_version_key_reference_unique
        ON geo.dataset_version (dataset_key, reference)
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX dataset_version_single_published
        ON geo.dataset_version (dataset_key)
        WHERE status = 'published'
    `.execute(db);

    await sql`
      CREATE INDEX dataset_version_lookup
        ON geo.dataset_version (dataset_key, published_at DESC)
    `.execute(db);

    await sql`
      CREATE TABLE geo.dataset_change (
        id bigserial PRIMARY KEY,
        dataset_version_id bigint NOT NULL REFERENCES geo.dataset_version(id) ON DELETE CASCADE,
        previous_version_id bigint REFERENCES geo.dataset_version(id) ON DELETE SET NULL,
        entity_type text NOT NULL,
        change_type text NOT NULL,
        entity_count bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT dataset_change_type_check
          CHECK (change_type IN ('added', 'removed', 'changed'))
      )
    `.execute(db);

    await sql`
      CREATE INDEX dataset_change_version
        ON geo.dataset_change (dataset_version_id)
    `.execute(db);

    await sql`
      CREATE TABLE geo.ingestion_job (
        id uuid PRIMARY KEY DEFAULT uuidv7(),
        dataset_key text NOT NULL,
        reference text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        priority smallint NOT NULL DEFAULT 100,
        attempts smallint NOT NULL DEFAULT 0,
        max_attempts smallint NOT NULL DEFAULT 3,
        run_after timestamptz NOT NULL DEFAULT now(),
        locked_by text,
        locked_at timestamptz,
        started_at timestamptz,
        finished_at timestamptz,
        error text,
        correlation_id text NOT NULL DEFAULT uuidv7()::text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ingestion_job_status_check
          CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX ingestion_job_active_unique
        ON geo.ingestion_job (dataset_key, reference)
        WHERE status IN ('queued', 'running', 'succeeded')
    `.execute(db);

    await sql`
      CREATE INDEX ingestion_job_queue
        ON geo.ingestion_job (status, priority, run_after)
    `.execute(db);

    await sql`
      CREATE INDEX ingestion_job_reaper
        ON geo.ingestion_job (status, locked_at)
    `.execute(db);

    await sql`
      CREATE TABLE geo.ingestion_schedule (
        dataset_key text PRIMARY KEY,
        enabled boolean NOT NULL DEFAULT true,
        cadence_days integer NOT NULL,
        sla_days integer NOT NULL,
        last_reference text,
        last_checked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP SCHEMA IF EXISTS geo CASCADE`.execute(db);
  },
};
