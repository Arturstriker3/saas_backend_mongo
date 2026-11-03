import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Extends `geo.data_health` with the CNEFE address base: how many rows were
 * published and how many of them carry a point.
 */
export const migration014HealthAddresses = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE OR REPLACE VIEW geo.data_health AS
      WITH facts AS MATERIALIZED (
        SELECT
          (SELECT count(*) FROM pg_extension WHERE extname IN ('postgis', 'pg_trgm'))
            AS extension_count,
          (SELECT count(*)
             FROM pg_class AS c
             JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'geo'
              AND c.relkind = 'r'
              AND c.relname LIKE '%\\_load') AS load_table_count,
          (SELECT count(*)
             FROM pg_class AS c
             JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'geo'
              AND c.relkind = 'r'
              AND c.relpersistence = 'u') AS unlogged_table_count,
          (SELECT count(*)
             FROM pg_indexes
            WHERE schemaname = 'geo'
              AND indexname IN (
                'establishment_active_municipality_cnae',
                'establishment_municipality_cnae',
                'company_legal_name_trgm',
                'establishment_trade_name_trgm',
                'region_search_name_trgm'
              )) AS query_index_count,
          (SELECT count(*) FROM geo.region WHERE level = 'state') AS state_count,
          (SELECT count(*) FROM geo.region WHERE level = 'municipality') AS municipality_count,
          (SELECT count(*)
             FROM geo.region AS municipality
             LEFT JOIN geo.region AS state ON state.id = municipality.parent_id
            WHERE municipality.level = 'municipality'
              AND (state.id IS NULL OR state.level <> 'state')) AS orphan_region_count,
          (SELECT count(*)
             FROM geo.region
            WHERE level IN ('state', 'municipality', 'neighborhood')
              AND geom IS NOT NULL
              AND NOT ST_IsValid(geom)) AS invalid_geometry_count,
          (SELECT count(*)
             FROM geo.locality
            WHERE level = 'municipality') AS locality_municipality_count,
          (SELECT count(*)
             FROM geo.locality_gap
            WHERE gap = 'missing_in_region') AS locality_gap_count,
          (SELECT string_agg(ibge_code || '/' || COALESCE(uf_sigla, ''), ', ' ORDER BY ibge_code)
             FROM geo.locality_gap
            WHERE gap = 'missing_in_region') AS locality_gap_detail,
          (SELECT count(*)
             FROM geo.region_indicator
            WHERE indicator_key = 'population'
              AND reference = (SELECT max(reference)
                                 FROM geo.region_indicator
                                WHERE indicator_key = 'population')) AS population_estimate_count,
          (SELECT c.reltuples::bigint
             FROM pg_class AS c
             JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'geo' AND c.relname = 'establishment') AS establishment_rows,
          (SELECT c.reltuples::bigint
             FROM pg_class AS c
             JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'geo' AND c.relname = 'company') AS company_rows,
          (SELECT c.reltuples::bigint
             FROM pg_class AS c
             JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'geo' AND c.relname = 'cnae') AS cnae_rows,
          (SELECT c.reltuples::bigint
             FROM pg_class AS c
             JOIN pg_namespace AS n ON n.oid = c.relnamespace
            WHERE n.nspname = 'geo' AND c.relname = 'address') AS address_rows,
          (SELECT stats.null_frac
             FROM pg_stats AS stats
            WHERE stats.schemaname = 'geo'
              AND stats.tablename = 'address'
              AND stats.attname = 'geom') AS address_unlocated_fraction,
          (SELECT stats.null_frac
             FROM pg_stats AS stats
            WHERE stats.schemaname = 'geo'
              AND stats.tablename = 'establishment'
              AND stats.attname = 'municipality_code') AS unresolved_fraction,
          (SELECT count(*)
             FROM geo.dataset_version AS version
             LEFT JOIN geo.ingestion_schedule AS schedule
               ON schedule.dataset_key = version.dataset_key
            WHERE version.status = 'published'
              AND schedule.sla_days IS NOT NULL
              AND version.published_at + (schedule.sla_days * interval '1 day') < now())
            AS stale_dataset_count,
          (SELECT count(*)
             FROM geo.ingestion_job
            WHERE status = 'failed'
              AND created_at > now() - interval '7 days') AS failed_job_count,
          (SELECT count(*)
             FROM geo.ingestion_schedule AS schedule
            WHERE schedule.enabled
              AND schedule.last_checked_at IS NOT NULL
              AND NOT EXISTS (
                SELECT 1
                  FROM geo.dataset_version AS version
                 WHERE version.dataset_key = schedule.dataset_key
                   AND version.status = 'published'
              )) AS unpublished_dataset_count
      )
      SELECT checks.check_key,
             checks.severity,
             checks.value,
             checks.expected,
             checks.detail,
             now() AS checked_at
        FROM facts
        CROSS JOIN LATERAL (
          VALUES
            ('extensions',
             CASE WHEN facts.extension_count >= 2 THEN 'ok' ELSE 'broken' END,
             facts.extension_count::numeric,
             'postgis + pg_trgm',
             'Extension installed in the database'),

            ('query_indexes',
             CASE WHEN facts.query_index_count >= 5 THEN 'ok' ELSE 'broken' END,
             facts.query_index_count::numeric,
             '5',
             'Indexes the product queries depend on'),

            ('load_tables',
             CASE WHEN facts.load_table_count = 0 THEN 'ok' ELSE 'broken' END,
             facts.load_table_count::numeric,
             '0',
             'Mirror tables a killed publish left behind'),

            ('unlogged_tables',
             CASE WHEN facts.unlogged_table_count = 0 THEN 'ok' ELSE 'broken' END,
             facts.unlogged_table_count::numeric,
             '0',
             'Unlogged tables are truncated by the first crash recovery'),

            ('region_states',
             CASE WHEN facts.state_count = 27 THEN 'ok' ELSE 'broken' END,
             facts.state_count::numeric,
             '27',
             'States published from the IBGE malha'),

            ('region_municipalities',
             CASE WHEN facts.municipality_count < 5570 THEN 'warn' ELSE 'ok' END,
             facts.municipality_count::numeric,
             '5.570-5.571',
             format('%s municipalities; IBGE lists 5.571 (5101837 needs a geometry)',
                    facts.municipality_count)),

            ('locality_municipalities',
             CASE WHEN facts.locality_municipality_count >= 5570 THEN 'ok' ELSE 'warn' END,
             facts.locality_municipality_count::numeric,
             '5.570+',
             'Municipalities in the official IBGE code registry'),

            ('locality_gap',
             CASE
               WHEN facts.locality_gap_count <= 5 THEN 'ok'
               WHEN facts.locality_gap_count <= 20 THEN 'warn'
               ELSE 'broken'
             END,
             facts.locality_gap_count::numeric,
             '<= 5',
             COALESCE('Listed by the IBGE but not served by the malha: '
                      || facts.locality_gap_detail,
                      'Registry and malha are aligned')),

            ('population_estimates',
             CASE WHEN facts.population_estimate_count >= 5500 THEN 'ok' ELSE 'broken' END,
             facts.population_estimate_count::numeric,
             '5.500+',
             'Municipalities with a population estimate for the latest year'),

            ('region_orphans',
             CASE WHEN facts.orphan_region_count = 0 THEN 'ok' ELSE 'broken' END,
             facts.orphan_region_count::numeric,
             '0',
             'Municipalities whose parent is not a state'),

            ('region_invalid_geometry',
             CASE WHEN facts.invalid_geometry_count = 0 THEN 'ok' ELSE 'broken' END,
             facts.invalid_geometry_count::numeric,
             '0',
             'Polygons rejected by ST_IsValid (administrative levels)'),

            ('establishment_rows',
             CASE WHEN facts.establishment_rows > 0 THEN 'ok' ELSE 'broken' END,
             facts.establishment_rows::numeric,
             '> 0',
             'Estimated rows (pg_class.reltuples)'),

            ('company_rows',
             CASE WHEN facts.company_rows > 0 THEN 'ok' ELSE 'broken' END,
             facts.company_rows::numeric,
             '> 0',
             'Estimated rows (pg_class.reltuples)'),

            ('cnae_rows',
             CASE WHEN facts.cnae_rows > 0 THEN 'ok' ELSE 'broken' END,
             facts.cnae_rows::numeric,
             '> 0',
             'Estimated rows (pg_class.reltuples)'),

            ('address_rows',
             CASE WHEN facts.address_rows > 0 THEN 'ok' ELSE 'broken' END,
             facts.address_rows::numeric,
             '> 0',
             'Estimated rows of the CNEFE address base'),

            ('address_geocoded',
             CASE
               WHEN facts.address_unlocated_fraction IS NULL THEN 'warn'
               WHEN facts.address_unlocated_fraction > 0.90 THEN 'broken'
               WHEN facts.address_unlocated_fraction > 0.50 THEN 'warn'
               ELSE 'ok'
             END,
             (1 - COALESCE(facts.address_unlocated_fraction, 1))::numeric,
             '>= 0.5',
             CASE
               WHEN facts.address_unlocated_fraction IS NULL
                 THEN 'No statistics: run ANALYZE geo.address'
               ELSE round(((1 - facts.address_unlocated_fraction) * 100)::numeric, 2)::text
                    || '% of addresses carry a point'
             END),

            ('establishment_unresolved',
             CASE
               WHEN facts.unresolved_fraction IS NULL THEN 'warn'
               WHEN facts.unresolved_fraction > 0.05 THEN 'broken'
               WHEN facts.unresolved_fraction > 0.01 THEN 'warn'
               ELSE 'ok'
             END,
             COALESCE(facts.unresolved_fraction, 0)::numeric,
             '<= 0.05',
             CASE
               WHEN facts.unresolved_fraction IS NULL
                 THEN 'No statistics: run ANALYZE geo.establishment'
               ELSE round((facts.unresolved_fraction * 100)::numeric, 4)::text
                    || '% without municipality_code (estimated)'
             END),

            ('stale_datasets',
             CASE WHEN facts.stale_dataset_count = 0 THEN 'ok' ELSE 'warn' END,
             facts.stale_dataset_count::numeric,
             '0',
             'Published versions older than their schedule SLA'),

            ('failed_jobs',
             CASE WHEN facts.failed_job_count = 0 THEN 'ok' ELSE 'warn' END,
             facts.failed_job_count::numeric,
             '0',
             'Ingestion jobs that failed in the last 7 days'),

            ('unpublished_datasets',
             CASE WHEN facts.unpublished_dataset_count = 0 THEN 'ok' ELSE 'warn' END,
             facts.unpublished_dataset_count::numeric,
             '0',
             'Enabled schedules that already ran without publishing')
        ) AS checks (check_key, severity, value, expected, detail)
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`SELECT 1`.execute(db);
  },
};
