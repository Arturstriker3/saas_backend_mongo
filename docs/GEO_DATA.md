# Geo Data Plane

Companion to `ARCHITECTURE.md`. Defines how geographic and market data is stored, versioned, ingested and served.

## Purpose

- The geo plane is a read model: public data, no user data, safe to cache.
- The transactional plane (MongoDB) keeps auth, users, billing and saved analyses.
- Both planes are never joined at request time.

## Stack

- PostgreSQL 18 + PostGIS 3.6, image `postgis/postgis:18-3.6`, dedicated container `saas_postgis`.
- PostgreSQL 18 changed the image data directory: mount the volume at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.
- PostgreSQL 19 is RC, not GA; PostGIS binaries for a new major always arrive after GA. Stay on 18.
- Extensions used: `postgis`. `h3-pg` is not part of the image; adopting H3 later requires a custom Dockerfile or computing H3 in the application layer.
- Query builder: **Kysely** (`kysely` + `pg`). No ORM, no Mongoose on this plane.
- Schema migrations: Kysely `Migrator` with an in-code provider (`src/common/database/geo/migrations`), run by the worker on boot and by `bun run geo:migrate`.
- Types: `src/common/database/geo/geo-db.types.ts`. Hand-maintained while the schema is small; regenerate with `kysely-codegen` once domain tables land.
- Access layer follows the hexagonal layout: `geo.repository.interface.ts` in domain, `geo.repository.postgis.ts` in infrastructure.

## Roles and connections

| Role         | Used by                | Privileges                           |
| ------------ | ---------------------- | ------------------------------------ |
| `geo_ingest` | geo worker, migrations | read/write, `CREATE` on `geo` schema |
| `geo_api`    | API                    | `SELECT` only                        |

Env vars:

- `GEO_DB_URL` (ingest role), `GEO_DB_READ_URL` (api role)
- `GEO_DB_MAX_POOL_SIZE`, `GEO_DB_MIN_POOL_SIZE`, `GEO_DB_CONNECT_TIMEOUT_MS`, `GEO_DB_STATEMENT_TIMEOUT_MS`
- `GEO_RAW_DIR`, `GEO_INGEST_CONCURRENCY`
- `GEO_JOB_STALE_MINUTES`, `GEO_JOB_RETENTION_DAYS`, `GEO_SCHEDULER_TICK_SECONDS`
- `RFB_CNPJ_SHARE_TOKEN` — token of the Receita Federal public share, used as the WebDAV user. It has no expiry date: it stays valid while the Receita Federal keeps the share, and only dies if the link is revoked or replaced (then a new token is needed). It is a public read-only credential, not a secret to be rotated on a schedule.
- `WORKER_METRICS_ENABLED`, `GEO_WORKER_METRICS_PORT`, `EMAIL_WORKER_METRICS_PORT`

`GEO_INGEST_CONCURRENCY` is `1` per source. Concurrent swaps of the same dataset are unsafe.

## Dataset versioning

Every dataset is immutable once published. A new publication creates a new version; the previous one is kept.

`geo.dataset_version`:

| Column         | Meaning                                                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | version id, referenced by every fact row                                                                                                                                            |
| `dataset_key`  | `ibge_malha`, `ibge_censo`, `ibge_estimativas`, `ibge_cempre`, `cnefe`, `rfb_cnpj`, `bcb_pix`, `bcb_estban`, `mte_caged`, `inep_censo_escolar`, `cnes`, `osm_poi`, `overture_place` |
| `reference`    | data reference: `2022`, `2025-07`, `2026-11-01`                                                                                                                                     |
| `extracted_at` | when the raw file was fetched                                                                                                                                                       |
| `published_at` | when the version became visible to the API                                                                                                                                          |
| `status`       | `staging`, `published`, `superseded`, `failed`                                                                                                                                      |
| `methodology`  | short text describing transformation (required)                                                                                                                                     |
| `source_url`   | origin of the raw file                                                                                                                                                              |
| `checksum`     | sha256 of the raw file                                                                                                                                                              |
| `row_count`    | rows published                                                                                                                                                                      |

Rules:

- Fact tables carry `dataset_version_id`. Queries never hardcode a version; they resolve the `published` version per `dataset_key`.
- Historical data stays queryable: an `as-of` request filters by `dataset_version_id`, it does not need a snapshot table.
- Exactly one `published` row per `dataset_key`. Publishing is an atomic transaction: set old to `superseded`, set new to `published`.
- `geo.dataset_change` stores the precomputed diff of a version against its predecessor (`dataset_version_id`, `entity_type`, `change_type` `added|removed|changed`, `entity_count`), so the client can show what changed without scanning history.

### Client-facing contract

Implemented:

- `GET /geo/regions?level=&parent=&search=&limit=` — region summaries (no geometry, centroid only).
- `GET /geo/regions/:code` — detail with GeoJSON geometry and the dataset evidence that produced it.
- `GET /geo/regions/:code/children` — direct children of a region.
- `GET /geo/coverage` — current version, reference, published_at, methodology, license, `slaDays` and `isStale` of every published dataset.

Planned:

- `GET /geo/datasets/:key/versions` — version history.
- `GET /geo/datasets/:key/versions/:from..:to/diff` — precomputed change summary by level and entity.
- `GET /geo/regions/:ibgeCode?version=` and `?asOf=` — time travel over published versions.
- Evidence rule: any metric response includes `dataset_key`, `reference`, `methodology` and `geocode_precision` when spatial.

## Data as a product

- `GET /geo/exports/:key/:version` — CSV or Parquet export of a published dataset, gated by plan.
- Export availability is declared per dataset in `geo.dataset_license` (`dataset_key`, `license`, `redistribution_allowed`, `attribution_required`, `attribution_text`).
- Datasets with `redistribution_allowed = false` are exposed as derived metrics only, never as raw export.

## Ingestion worker

Process: `src/worker-geo.ts`, mirroring `src/worker-email.ts` (Nest application context, graceful shutdown on `SIGINT`/`SIGTERM`, no HTTP server).

Module: `WorkerGeoModule` imports `GeoDatabaseModule` and `GeoIngestionModule`. `MessagingModule` and `MetricsModule` join when the first adapter emits events and counters.

### Job queue

Geo ingestion is a batch job, not an event stream: low frequency, long duration, single consumer per dataset. The queue lives in the database.

- RabbitMQ is **not** used to dispatch ingestion jobs.
- RabbitMQ keeps exactly one responsibility here: the domain event `geo.dataset.published`, consumed by notifications and email. This preserves the event bus convention in `ARCHITECTURE.md`.

`geo.ingestion_job`:

| Column                      | Meaning                                    |
| --------------------------- | ------------------------------------------ |
| `id`                        | job id (`uuidv7()`)                        |
| `dataset_key`               | target dataset                             |
| `reference`                 | reference being ingested                   |
| `status`                    | `queued`, `running`, `succeeded`, `failed` |
| `priority`                  | lower runs first                           |
| `attempts`                  | attempts already made                      |
| `max_attempts`              | retry ceiling                              |
| `run_after`                 | backoff gate                               |
| `locked_by`                 | worker instance holding the job            |
| `locked_at`                 | heartbeat timestamp                        |
| `started_at`, `finished_at` | execution window                           |
| `error`                     | last failure message                       |
| `correlation_id`            | ties logs to the run                       |

Claiming a job:

```sql
UPDATE geo.ingestion_job
SET status = 'running', locked_by = $1, locked_at = now(), started_at = now()
WHERE id = (
  SELECT id FROM geo.ingestion_job
  WHERE status = 'queued' AND run_after <= now()
  ORDER BY priority, run_after
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

Rules:

- Claim and release are short transactions. The ingestion itself never runs inside an open transaction.
- `locked_at` is refreshed as a heartbeat every 60s. A reaper returns jobs whose heartbeat is older than `GEO_JOB_STALE_MINUTES` to `queued` with `attempts + 1`. It runs at boot and every 5 minutes, so a job orphaned by a crash is recovered even when the worker comes back long after the crash.
- A unique partial index on `(dataset_key, reference)` where `status IN ('queued','running')` prevents two runs of the same reference at once, while still allowing the dataset to be collected again on its next cadence window.
- Retry uses `run_after = now() + backoff(attempts)`. After `max_attempts` the job becomes `failed` and the dataset is reported stale.
- Finished jobs are purged after `GEO_JOB_RETENTION_DAYS`.

### Pipeline stages

1. `resolve` — discover the newest available reference at the source; skip if already `published` or `staging`.
2. `download` — stream to `GEO_RAW_DIR/{dataset_key}/{reference}/`; never buffer in memory.
3. `verify` — compute sha256, compare with source when available, abort on mismatch.
4. `extract` — unzip/convert in place; reject on unexpected file list.
5. `stage` — `COPY ... FROM STDIN` into `staging.{dataset_key}` tables. `COPY` only, no row-by-row inserts.
6. `transform` — normalize codes (IBGE, CNAE, CNPJ digits), resolve hierarchy (`municipality_id`, `district_id`, `neighborhood_id`, `sector_id`), geocode when applicable, write into `geo.*` with the new `dataset_version_id`.
7. `validate` — row counts within expected bounds, zero orphan foreign keys, geometry validity (`ST_IsValid`), null ratio on mandatory fields. Any failure aborts the whole version.
8. `publish` — single transaction: insert `dataset_version` as `published`, set previous to `superseded`, compute `dataset_change`.
9. `refresh` — refresh dependent materialized views (`geo.mv_*`).
10. `announce` — emit `geo.dataset.published` on the event bus with `{ datasetKey, versionId, reference, rowCount }`.

### Guarantees

- Idempotent: unique `(dataset_key, reference)` on `dataset_version`; re-enqueuing a published reference is a no-op.
- Atomic: a version is visible only after `publish`. Failed runs leave `staging` tables and no `geo` rows.
- Recoverable: a crashed run is recovered by the heartbeat reaper, retried with backoff, then parked as `failed`. `staging` is truncated at the start of every run.
- Not resumable mid-dataset: a recovered job re-reads the dataset from the beginning, reusing the `staging` version. Recovery costs time, never correctness.
- Bounded: each part is deleted as soon as it is read, and a run starts by wiping its reference directory, so a killed run cannot leave archives piling up. Nothing is kept between runs: a retry downloads again.
- Observable: see Observability.
- Dependency order matters: malhas → censo → cnefe → cnpj → rest. A dataset declares `dependsOn` and is skipped while a dependency is missing.

### Scheduling

`IngestionScheduler` runs inside the worker. On every tick (`GEO_SCHEDULER_TICK_SECONDS`, default 300s) it asks `geo.ingestion_schedule` for enabled datasets whose cadence window has elapsed and inserts one job per dataset. No external cron, no broker.

| Column            | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `cadence_days`    | how often the dataset must be collected again            |
| `sla_days`        | age at which the published version is reported as stale  |
| `last_reference`  | reference of the last collection, reused on the next run |
| `last_checked_at` | start of the current cadence window                      |

Rules:

- A due dataset is enqueued only if an adapter is registered. Datasets are seeded in the schedule before their collector exists, so they wait instead of failing a job.
- The reference comes from `last_reference`; a dataset that never ran uses `defaultReference` from its adapter. Re-collecting the same reference is intentional: it detects source corrections and produces a new `dataset_change`.
- `last_checked_at` moves forward at enqueue time, so the tick is a cadence gate, not a retry loop. Transient failures are handled by the job retry (`max_attempts` with backoff); a parked `failed` job shows up in the workers dashboard and is re-run with `geo:ingest`.
- A new vintage (e.g. the next census) is a code change in the adapter, not an operational command: the reference lives in the adapter config and the version is published only after validation.

In production the only moving part is the worker process being up: it collects on cadence, retries on failure and recovers crashed runs through the reaper.

### Worker commands

- `bun run geo:migrate` — apply pending migrations.
- `bun run geo:ingest -- --dataset=rfb_cnpj --reference=2026-09` — inserts a job for a manual run.
- `bun run dev:workerGeo` — worker in watch mode.

## Observability

Each worker exposes its own metrics endpoint: Prometheus pulls over HTTP and an application context has no server.

| Process             | Endpoint   | Port |
| ------------------- | ---------- | ---- |
| geo worker          | `/metrics` | 9464 |
| email worker        | `/metrics` | 9465 |
| API                 | `/metrics` | 3000 |
| `postgres-exporter` | `/metrics` | 9187 |

In-process metrics (`prom-client`, `src/common/metrics/worker-metrics.*`):

- `geo_ingest_jobs_total{dataset_key, outcome}` — `completed`, `failed`, `no_adapter`.
- `geo_ingest_duration_seconds{dataset_key}` — histogram.
- `geo_ingest_last_success_timestamp_seconds{dataset_key}` — freshness of the last publication.
- `email_messages_total{queue, outcome}` and `email_message_duration_seconds{queue, outcome}`.
- Default process metrics (`process_*`, `nodejs_*`) on both workers.

Queue metrics come from Postgres (`infra/postgres-exporter/queries.yaml`), so they stay valid when the worker is dead:

- `geo_ingestion_jobs{status}` — queued, running, failed.
- `geo_queue_oldest_queued_seconds` — backlog age.
- `geo_stuck_running_jobs` — running with a heartbeat older than 15 minutes.
- `geo_dataset_age_seconds{dataset_key}` — staleness of the published version.

Alerts that matter: `geo_queue_oldest_queued_seconds > 3600`, `geo_stuck_running_jobs > 0`, `up{job="worker-geo"} == 0`, `geo_dataset_age_seconds` above the dataset `slaDays`.

Dashboard: `infra/grafana/dashboards/workers.json`.

Dashboard copy rule: titles and descriptions are written in plain Portuguese so a non-engineer understands what is measured and what a bad state means. Every panel carries a `description` tooltip, the board opens with a "how to read" block, and legends use human labels (`esperando`, `em andamento`, `com erro`) instead of raw label values.

## Data health

`geo.data_health` is a **view**, not a table: it answers "is the database healthy, and what is broken?" with one `SELECT`, and is always current — no refresh step to forget.

```sql
SELECT * FROM geo.data_health ORDER BY severity DESC, check_key;
```

Every check reads the catalog, a small domain table or planner statistics. Nothing scans the 70M+ row tables, so the view is instant and volumes reflect the last `ANALYZE`.

| `severity` | Meaning                                   |
| ---------- | ----------------------------------------- |
| `ok`       | within expectation                        |
| `warn`     | degraded, still serving                   |
| `broken`   | wrong data or a structural problem to fix |

| `check_key`                | Detects                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `extensions`               | `postgis` and `pg_trgm` installed                                                                                                 |
| `query_indexes`            | the five indexes the product queries depend on                                                                                    |
| `load_tables`              | `geo.*_load` mirrors left behind by a killed publish                                                                              |
| `unlogged_tables`          | tables a crash recovery would truncate                                                                                            |
| `region_states`            | states published from the malha                                                                                                   |
| `region_municipalities`    | municipalities published versus the 5,571 the IBGE lists                                                                          |
| `locality_municipalities`  | municipalities in the official IBGE code registry                                                                                 |
| `locality_gap`             | codes the IBGE lists but the malha cannot serve                                                                                   |
| `population_estimates`     | municipalities with a population estimate for the latest year                                                                     |
| `address_rows`             | estimated rows of the CNEFE address base                                                                                          |
| `address_geocoded`         | share of addresses with a point (`pg_stats.null_frac` on `geom`)                                                                  |
| `region_orphans`           | municipalities whose parent is not a state                                                                                        |
| `region_invalid_geometry`  | polygons rejected by `ST_IsValid`                                                                                                 |
| `establishment_rows`       | estimated rows (`pg_class.reltuples`)                                                                                             |
| `company_rows`             | estimated rows                                                                                                                    |
| `cnae_rows`                | estimated rows                                                                                                                    |
| `establishment_unresolved` | share of establishments without `municipality_code` (`pg_stats.null_frac`; `warn` above 1%, `broken` above the 5% pipeline limit) |
| `stale_datasets`           | published versions older than their `slaDays`                                                                                     |
| `failed_jobs`              | ingestion jobs that failed in the last 7 days                                                                                     |
| `unpublished_datasets`     | enabled schedules that already ran without publishing                                                                             |

`establishment_unresolved` depends on `ANALYZE`: without statistics it reports `warn` and asks for an `ANALYZE geo.establishment` instead of guessing.

## Region model

`geo.region` is a current-state dimension, not a versioned fact table: the natural key is `(level, ibge_code)` and rows are upserted, never duplicated. Each row carries the `dataset_version_id` that last confirmed it, and the history of what changed lives in `geo.dataset_change` (counts by entity type and change type). Versioning every region row would multiply 5.6k rows per ingestion and break the foreign keys that districts, sectors and establishments will point to.

Write rules:

- Geometries are repaired with `ST_MakeValid` + `ST_CollectionExtract(geom, 3)` before insert, because IBGE polygons contain self-intersections. A version is refused if any stored geometry is still invalid.
- Area and centroid are computed in the database (`ST_Area(geom::geography)`, `ST_PointOnSurface`), never in the application.
- Hierarchy is resolved by `parent_code` joined to the level above, so states are written before municipalities in the same transaction.
- A municipality created after the malha vintage has no shape in the source. Gaps are logged with their IBGE codes and tolerated up to `MAX_MISSING_SHAPES`; above that the run fails.

### Sector indicators

`geo.sector_indicator` holds the Censo 2022 attributes, one row per census tract, joined to `geo.region` by `sector_code` (no foreign key: `region` is keyed by `(level, ibge_code)`).

| Column                                                                      | Source               |
| --------------------------------------------------------------------------- | -------------------- |
| `population`, `households`, `occupied_households`, `average_household_size` | agregados básicos    |
| `responsible_persons`, `average_income`, `median_income`                    | renda do responsável |
| `urban`                                                                     | básicos (situação)   |

- The source publishes one ZIP with a dated name per revision (`..._20260520.zip`), so the **reference is the revision date** and each republication becomes a comparable version. `discoverReference()` reads the directory listing, and the scheduler uses it instead of the last reference.
- Both files are read as a stream of lines and written in batches of 5 000; nothing is buffered per dataset.
- Basics are upserted first (clearing income), then income fills the sectors that report it. Sectors without a responsible person stay `NULL` instead of inheriting a stale value: 458 772 of 468 099 rows carry income.
- A row whose sector code is not 15 digits aborts the run — that is how a layout change or a leaked header gets caught before publishing.
- `GET /geo/regions/:code` returns `indicators` for census tracts, with the dataset reference that produced it.

### Official registry and municipality indicators

`geo.locality` is the IBGE **localities API** published as its own dataset (`ibge_localidades`): states and municipalities with the official code, name, normalized search name and state. It is the reference for "which codes exist", not a copy of the malha — the two are compared by the `geo.locality_gap` view:

| `gap`               | Meaning                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `missing_in_region` | the IBGE lists the code, the malha cannot serve it (no geometry) |
| `missing_in_source` | a region exists in the malha but not in the official registry    |

- The registry is replaced in one transaction: ~5 600 rows, no staging table and no swap.
- A code that disappears from the source is deleted, because the IBGE merged or extinguished it.
- A small gap is normal (a municipality created after the malha vintage); `geo.data_health` only escalates when it grows.

`geo.region_indicator` holds numeric attributes keyed by region. `ibge_estimativas` publishes `population` per municipality, one row per year, read from SIDRA aggregate 6579:

- The reference is the estimate **year**, so the series accumulates instead of replacing the previous one.
- `discoverReference()` reads the last period the aggregate publishes; the API uses `-`, `...` and `X` for missing values, which are dropped.
- The publisher replaces only the `(indicator_key, reference)` it is writing; other years stay.

### Formal employment (CEMPRE)

`geo.municipality_cnae_employment` is the formal side of the economy: the CNPJ registry says who exists, CEMPRE says how many people each activity employs and how much it pays.

| Column                                      | Source                                                      |
| ------------------------------------------- | ----------------------------------------------------------- |
| `municipality_code`, `cnae_code` (2 digits) | classificação CNAE 2.0 do SIDRA, nível divisão              |
| `companies`                                 | variável 2585 — número de empresas e outras organizações    |
| `occupied_persons`, `salaried_persons`      | variáveis 707 e 708                                         |
| `salaries_thousand_brl`                     | variável 662 — salários e outras remunerações, em mil reais |
| `geo.cnae_division.name`                    | nome da divisão publicado pelo próprio agregado             |

- The grain is the **CNAE division**, not the class: SIDRA only serves class level for municipalities with 50 000 inhabitants or more, so a class-grain table would be partial exactly where it matters. `cnae_code` joins `geo.establishment.cnae_principal` by its first two digits.
- The reference is the **year** (2022, 2023, 2024 at the time of writing), so the yearly series accumulates instead of replacing the previous vintage.
- One request per division: the API answers **500** when a single call crosses every CNAE category with every municipality, and `LIKE`-style discovery is not available — the division category ids are opaque (6 digits) and only the name carries the code, so the adapter reads the national total once to map `01 Agricultura…` to an id and then asks for one division at a time (87 requests, ~15 min).
- Mid-division the API mixes higher levels in the same payload (section, division, group and class are all categories of classification 12762); the adapter keeps only names that start with two digits and a space.
- A division with no company in a municipality is not written, so the table has ~5 500 rows per division instead of a dense grid; the 2024 edition published 232 735 rows over 86 divisions and 5 570 municipalities.
- Below 180 000 rows the publish is refused — a silent failure of one division would otherwise shrink the country.
- `GET /geo/stats/municipalities/:code/employment` reads it: totals (companies, occupied, salaried, salaries, average monthly salary) plus the top divisions by occupied persons.

### Addresses (CNEFE)

`geo.address` is the CNEFE 2022 base: ~111M addresses with a point each, published from 27 state archives (`{uf}_{sigla}.zip`) at `Arquivos_CNEFE/CSV/UF`.

| Column                                                                                  | Source                                                 |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `id`                                                                                    | `COD_UNICO_ENDERECO`                                   |
| `uf_code`, `municipality_code`, `district_code`, `subdistrict_code`, `sector_code`      | `COD_*`                                                |
| `cep`, `locality`, `street_type`, `street_title`, `street`, `street_number`, `modifier` | endereço                                               |
| `complement`                                                                            | the five `NOM_COMP_ELEM`/`VAL_COMP_ELEM` pairs, joined |
| `latitude`, `longitude`, `geom`                                                         | `LATITUDE`, `LONGITUDE` (SRID 4326)                    |
| `geocode_level`, `species_code`, `establishment_name`                                   | `NV_GEO_COORD`, `COD_ESPECIE`, `DSC_ESTABELECIMENTO`   |

- It is what turns the CNPJ into something a map can use: the registry carries no coordinate.
- The CNEFE code identifies the **address**, not the record: a household and a shop on the same address share the code and differ by `species_code`. The primary key is `(id, species_code)`; a duplicate pair is a source defect and stops the publish.
- Files are UTF-8 with a BOM and 34 columns. The adapter compares the header with the expected layout and refuses a shifted file — a shifted column would silently mis-geocode.
- Each archive is downloaded, read as a stream and deleted before the next one. Peak disk usage is a single state, not the ~25 GB of the whole country.
- The rows are written to `geo.address_load` without indexes, then the primary key, the btree indexes and the GiST index on `geom` are built once and the table is swapped in.
- Below 90M rows the publish is refused: a partial download must never replace the live table.
- Do not deduplicate with a self-join: at 111M rows it spilled 74 GB of temporary files and never finished. The primary key is built directly.

### Establishments

`rfb_cnpj` publishes the monthly CNPJ registry in three tables that share the same `dataset_version_id`: `geo.establishment` (one row per establishment), `geo.company` (one row per CNPJ root, with the legal name) and `geo.cnae` (the taxonomy that makes the code readable).

| Column                                                                 | Source                                     |
| ---------------------------------------------------------------------- | ------------------------------------------ |
| `cnpj`, `cnpj_basico`, `is_headquarters`                               | `Estabelecimentos{n}` (matriz/filial flag) |
| `trade_name`                                                           | nome fantasia                              |
| `cnae_principal`                                                       | CNAE fiscal principal                      |
| `registration_status`, `opened_on`                                     | situação cadastral, data de início         |
| `cep`, `uf`, `municipality_code`                                       | endereço                                   |
| `street_type`, `street`, `street_number`, `complement`, `neighborhood` | endereço                                   |
| `geo.company.legal_name`                                               | `Empresas{n}` — razão social               |
| `geo.company.legal_nature_code`, `size_code`, `capital_social`         | `Empresas{n}`                              |
| `geo.cnae.code`, `geo.cnae.description`                                | `Cnaes.zip`                                |

- The reference is the publication month (`YYYY-MM`); the source keeps one folder per month and `discoverReference()` lists them.
- The files are **not** served as an HTML directory: the Receita Federal publishes them through a Nextcloud public share, so discovery is a WebDAV `PROPFIND` and every request carries the share token as the basic-auth user (`RFB_CNPJ_SHARE_TOKEN`). A new share link means a new token.
- **A month folder is published before every archive is uploaded.** Discovery refuses a month that does not list `Cnaes.zip` plus all ten `Estabelecimentos{0..9}.zip` and all ten `Empresas{0..9}.zip`, and each part must reach a row floor, so a truncated upload never becomes a version.
- Entries inside the archives carry no `.csv` extension (`K3241.K03200Y9.D61010.ESTABELE`, `K3241.K03200Y9.D61010.EMPRECSV`, `F.K03200$Z.D61010.CNAECSV`); a part must extract exactly one data file.
- `trade_name` is optional in the source: in the 2026-10 edition ~69% of the establishments carry none. The official name is the razão social, so any listing joins `geo.company` by `cnpj_basico`; the establishment row alone is not identifiable by people.
- `registration_status` is the situação cadastral: `01` nula, `02` ativa, `03` suspensa, `04` inapta, `08` baixada. Market queries filter `= 2`; the rest is company history.
- The RFB started issuing **alphanumeric CNPJs** in 2026: the 12 root/order positions may carry letters (`00000000E08G12`), while the two check digits stay numeric. `cnpj` and `cnpj_basico` are `text` and the mapper accepts `[0-9A-Z]`, normalizing to upper case.
- Multiple tables are published as a primary key, so a repeated key blocks the publish after the whole load: records without a razão social are skipped (they carry no usable name and repeat an existing code), and the publish still drops any remaining duplicate on the key before building the primary key, logging how many rows it discarded.
- `size_code` is the porte: `00` not informed, `01` MEI, `03` EPP, `05` others. `capital_social` is published with a comma decimal separator (`2.000,00`) and is stored as numeric.
- `municipality_code` is a **translation**, not a derivation: the `MUNICIPIO` column of `Estabelecimentos{n}` is the Receita Federal `TOM` code, which has its own numbering (`7107` is São Paulo for the RFB, while the IBGE code is `3550308`). The bridge is `Municipios.zip`, which maps every TOM to a name; that name is matched against `geo.region` by the normalized `search_name` plus the establishment's state. Spellings the RFB uses differently (`SAO LUIZ`, `PINDARE MIRIM`, `BRASOPOLIS`) fall back to a trigram similarity of 0.5 or more **inside that state**, so `SAO LUIZ` resolves to São Luís/MA and São Luiz/RR according to the UF, and every guess is logged. The municipalities the IBGE renamed (`BOA SAUDE`, `ARES`, `FORTALEZA DO TABOCAO`, `SAO VALERIO DA NATIVIDADE`) are listed explicitly, because no name comparison can reach them. Anything unresolved stays `NULL` — establishments abroad (`uf = EX`), unknown UFs and `Boa Esperança do Norte/MT`, which the IBGE localities API lists but the malha API still serves without a geometry — and more than 5% unresolved aborts the run.
- The address is kept without the contact data: street, number, complement and neighborhood are what a geocoder needs, while phone, e-mail, sócios and the secondary CNAE stay out. The CNPJ open data carries no latitude/longitude, so a point has to be derived from the address or the CEP in a later step.
- Files are `latin1`, semicolon separated and fully quoted; they are read as a stream part by part, and each part is deleted as soon as it is read. The largest part is ~2.3 GB compressed and ~7 GB extracted, so the worker needs that much free disk under `GEO_RAW_DIR`.
- Row floors: 45M–90M establishments, 40M–95M companies and 1 200–1 500 CNAEs per version, minimum 100 000 rows per part. A full run downloads roughly 18 GB.

## Serving rules

- Bounding box filter before any exact spatial predicate.
- Hard limits per endpoint: `radius <= 5000m`, `limit <= 200`.
- No `SELECT *`; explicit column lists only.
- Heavy aggregations read from materialized views refreshed at publish time.
- Tiles: `ST_TileEnvelope` + `ST_AsMVT`, versioned URL `/geo/tiles/{version}/{layer}/{z}/{x}/{y}.mvt`, `Cache-Control: public, max-age=31536000, immutable`.

### Establishment endpoints

| Endpoint                                      | Answers                                                                  | Keyset                             |
| --------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- |
| `GET /geo/establishments/:cnpj`               | one establishment with the razão social, the CNAE and the municipality   | `establishment_pkey`               |
| `GET /geo/companies/:cnpjBasico`              | the company root, the branch counts and the branches, headquarters first | `company_pkey`, then `cnpj_basico` |
| `GET /geo/establishments?municipality=&cnae=` | active establishments of a municipality, ordered by CNAE and CNPJ        | index scan + `cursor`              |
| `GET /geo/establishments/search?q=`           | active establishments whose company name contains the term               | top-20 by similarity               |

- The list is **keyset paginated**, never `OFFSET`: `nextCursor` carries `"<cnae>:<cnpj>"` and the next page seeks straight to it (0.2 ms deep in a 2.5M row municipality; `OFFSET 500000` took 191 s on the same data).
- `cnae` is a **prefix** and is expanded into the closed range the index can seek: `5611` becomes `5611000..5611999`. `LIKE '5611%'` has no lower bound, so the ordered scan started at the first CNAE of the municipality and filtered 1.5M rows.
- The list serves **active** establishments only (`registration_status = 2`), which is what the partial index covers. Closed branches appear in the detail and in the company profile.
- Search covers the **razão social**, not the trade name: a common word like `hortifruti` matches 20 000 trade names, and every match costs a heap fetch in the 35 GB table — 38 s on cold storage. The `establishment_trade_name_trgm` index stays for a future denormalized search table.
- Everything is a primary key lookup or an ordered index scan; the measured times on 73.8M establishments are 34–100 ms for the detail and the company profile, 94 ms for a cold first page and ~0.4 s for the trigram search on a warm cache.

### Aggregates

Two materialized views answer "what does this place do" without grouping 28M establishments per request:

| View                                     | Grain                       | Rows  |
| ---------------------------------------- | --------------------------- | ----- |
| `geo.mv_establishment_municipality_cnae` | municipality × CNAE, active | ~1.5M |
| `geo.mv_establishment_uf_cnae`           | state × CNAE, active        | ~36k  |

- Both are refreshed **inside the swap transaction** of the CNPJ publish, so the numbers and the establishments they describe change in the same commit — there is no window where a city shows yesterday's count with today's registry. The whole refresh adds a couple of minutes to a publish that already builds six indexes over 73M rows.
- The state view is derived from the municipality view: the first two digits of an IBGE municipality code are the state code, so the national aggregate is a pass over ~1.5M rows instead of a second 73.8M row scan. Refresh order matters and follows `STATISTIC_VIEWS` in the publisher.
- Only active establishments (`registration_status = 2`) are aggregated: the views exist to describe the market, and closed branches would inflate every ranking.
- `GET /geo/stats/municipalities/:code` and `GET /geo/stats/ufs/:uf` read them with a single `LIMIT` and a window sum, so the total and the number of activities come in the same round trip as the ranking. Municipality headers join `geo.locality` (name, UF) and `geo.region_indicator` (population, latest reference).
- Measured over 28.3M active establishments: 7–9 ms for São Paulo (1 254 CNAEs) and 71 ms for the state of São Paulo (8.8M active) on a cold cache.
- A municipality the IBGE lists but that has no establishment returns zeros, not a 404; the 404 is reserved for a code that is not in the official registry.

### Query indexes

The CNPJ snapshot is published through load tables and a swap, so the indexes are part of the publisher (`TARGETS`), not only of the migration: whatever the swap does not rebuild disappears on the next publish.

| Index                                     | Serves                                                                                                                     |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `establishment_pkey` (`cnpj`)             | lookup of one establishment                                                                                                |
| `establishment_company` (`cnpj_basico`)   | all establishments of a company                                                                                            |
| `establishment_municipality_cnae`         | counts per municipality and CNAE, including closed companies                                                               |
| `establishment_active_municipality_cnae`  | `(municipality_code, cnae_principal, cnpj)` for `registration_status = 2`: the paginated listing of a municipality by CNAE |
| `establishment_trade_name_trgm` (GIN)     | `ILIKE '%…%'` on the trade name, non-null rows only                                                                        |
| `company_pkey`, `company_legal_name_trgm` | razão social by code, and by partial text                                                                                  |
| `cnae_pkey`                               | CNAE description                                                                                                           |

Trigram search needs `pg_trgm` (created by migration `009`). The published tables are **logged**: the mirror is created by `LIKE`, which does not carry persistence, but the published snapshot must survive a crash recovery.

## Source catalog

Granularity is the finest available. `cadence` is the natural publication rhythm of the source, not a guarantee. `access` is `api`, `bulk` (files over FTP/S3/HTTP) or `portal` (HTML/PDF without machine contract). `stability` is defined in Extraction reality.

### Meta datasets

Small, cheap and required for correct version comparison.

| Key                            | What it answers                     | Granularity   | Cadence   | Access | Stability | License         |
| ------------------------------ | ----------------------------------- | ------------- | --------- | ------ | --------- | --------------- |
| `ibge_localidades`             | official code and name registry     | município, UF | irregular | api    | stable    | open, cite IBGE |
| `ibge_alteracoes_territoriais` | municipality splits and merges      | município     | annual    | bulk   | stable    | open, cite IBGE |
| `ibge_ipca_inpc`               | deflator for cross-version compare  | national, UF  | monthly   | api    | stable    | open, cite IBGE |
| `cnae_ncm_cbo`                 | versioned taxonomies                | code          | irregular | bulk   | stable    | open            |
| `feriados`                     | national, state, municipal holidays | município     | annual    | bulk   | stable    | open            |

### Wave 1 — foundation

| Key                | What it answers              | Granularity                  | Cadence                  | Access | Stability | License         |
| ------------------ | ---------------------------- | ---------------------------- | ------------------------ | ------ | --------- | --------------- |
| `ibge_malha`       | where the territory is       | state, municipality (v3 API) | annual                   | bulk   | stable    | open, cite IBGE |
| `ibge_censo`       | how many, how much they earn | setor censitário             | closed until next census | api    | stable    | open, cite IBGE |
| `ibge_estimativas` | current population           | município                    | annual                   | api    | stable    | open, cite IBGE |
| `cnefe`            | addresses, geocoding base    | endereço                     | irregular                | bulk   | semi      | open, cite IBGE |
| `rfb_cnpj`         | who exists, what they do     | estabelecimento              | monthly                  | bulk   | stable    | open, cite RFB  |

The v3 malhas API covers states and municipalities only. Districts, neighborhoods and census tracts come from the IBGE FTP shapefiles (wave 2b) and require a shapefile reader and `ST_Transform` from SIRGAS 2000.

### Wave 2 — decision layer

| Key                  | What it answers                     | Granularity                | Cadence | Access | Stability | License             |
| -------------------- | ----------------------------------- | -------------------------- | ------- | ------ | --------- | ------------------- |
| `ibge_cempre`        | formal jobs and average wage        | município × CNAE           | annual  | api    | stable    | open, cite IBGE     |
| `mte_caged`          | hiring and firing                   | município × CNAE           | monthly | bulk   | stable    | open, cite MTE      |
| `bcb_pix`            | money moving, PF vs PJ              | município                  | monthly | api    | stable    | open, cite BCB      |
| `inep_censo_escolar` | schools, enrollment, infrastructure | escola (geocoded)          | annual  | bulk   | semi      | open                |
| `cnes`               | health facilities                   | estabelecimento (geocoded) | monthly | bulk   | semi      | open                |
| `overture_place`     | points of interest, competitors     | lugar                      | monthly | bulk   | stable    | CDLA Permissive 2.0 |
| `osm_poi`            | streets, transit, land use          | elemento OSM               | daily   | bulk   | semi      | ODbL                |
| `rfb_simples`        | MEI and Simples adoption            | estabelecimento            | monthly | bulk   | stable    | open, cite RFB      |
| `mdic_comex`         | exports and imports                 | município × SH4            | monthly | bulk   | stable    | open, cite MDIC     |
| `senatran_frota`     | vehicles, income proxy              | município                  | monthly | bulk   | semi      | open                |

`ibge_cempre` is the first dataset of this wave in production — see **Formal employment (CEMPRE)** for what it stores and how it is extracted.

### Wave 3 — differentiation

| Key                     | What it answers                        | Granularity              | Cadence                  | Access | Stability | License         |
| ----------------------- | -------------------------------------- | ------------------------ | ------------------------ | ------ | --------- | --------------- |
| `ibge_entorno`          | street infrastructure quality          | município, concentração  | closed until next census | bulk   | semi      | open, cite IBGE |
| `ibge_favelas`          | named favela polygons                  | setor                    | closed until next census | bulk   | semi      | open, cite IBGE |
| `ibge_censo_segmentos`  | race, age, disability by tract         | setor                    | closed until next census | api    | stable    | open, cite IBGE |
| `ibge_arranjos`         | conurbation boundaries                 | município                | irregular                | bulk   | stable    | open, cite IBGE |
| `ibge_pendular`         | where people live vs work              | município                | closed until next census | bulk   | semi      | open, cite IBGE |
| `ibge_regic`            | urban hierarchy and centrality         | município                | irregular                | bulk   | semi      | open, cite IBGE |
| `ibge_pib_municipal`    | size of local economy                  | município                | annual                   | api    | stable    | open, cite IBGE |
| `ibge_pam_ppm`          | agricultural and livestock output      | município                | annual                   | api    | stable    | open, cite IBGE |
| `ibge_pnad`             | income and occupation                  | UF, região metropolitana | quarterly                | api    | stable    | open, cite IBGE |
| `ibge_pof`              | consumption by income band             | national                 | irregular                | bulk   | semi      | open, cite IBGE |
| `atlas_idhm`            | human development, sub-municipal       | UDH                      | one-off                  | bulk   | semi      | open            |
| `mapbiomas`             | land use and cover 1985 onwards        | 30 m raster              | annual                   | bulk   | semi      | CC BY-SA        |
| `cadunico`              | vulnerability and income floor         | município                | monthly                  | portal | volatile  | open, aggregate |
| `inss_beneficios`       | benefits paid per municipality         | município                | monthly                  | portal | semi      | open            |
| `ans_beneficiarios`     | health plan coverage                   | município                | monthly                  | bulk   | semi      | open            |
| `mte_seguro_desemprego` | layoffs at scale                       | município                | monthly                  | bulk   | semi      | open            |
| `bcb_estban`            | deposits and credit                    | município                | monthly                  | api    | stable    | open, cite BCB  |
| `bcb_cartoes`           | card spending                          | município                | monthly                  | api    | stable    | open, cite BCB  |
| `bcb_fraudes_pix`       | fraud rate                             | município                | monthly                  | api    | semi      | open, cite BCB  |
| `rfb_irpf`              | declared income distribution           | município                | annual                   | bulk   | stable    | open, cite RFB  |
| `rfb_arrecadacao`       | federal tax collected                  | município                | monthly                  | bulk   | semi      | open, cite RFB  |
| `pncp_contratos`        | public money entering the municipality | município × órgão        | daily                    | api    | semi      | open            |
| `bndes_financiamentos`  | productive investment                  | município                | irregular                | bulk   | semi      | open            |
| `divida_ativa`          | delinquent corporate debt              | PJ                       | monthly                  | bulk   | semi      | open            |
| `gtfs`                  | transit schedules and stops            | rota, parada por cidade  | irregular                | bulk   | volatile  | open            |
| `antt_trafego`          | intercity traffic                      | praça de pedágio         | annual                   | bulk   | semi      | open            |
| `anac_aeroportos`       | air passenger movement                 | aeroporto                | monthly                  | bulk   | stable    | open            |
| `antaq_portos`          | port cargo movement                    | porto                    | monthly                  | bulk   | semi      | open            |
| `aneel_consumo`         | energy consumption by class            | município                | annual                   | bulk   | semi      | open            |
| `aneel_gd`              | distributed generation installs        | endereço                 | monthly                  | bulk   | semi      | open            |
| `anatel_estacoes`       | telecom towers                         | estação                  | monthly                  | bulk   | semi      | open            |
| `anatel_banda_larga`    | broadband access                       | município                | monthly                  | bulk   | semi      | open            |
| `anp_precos`            | weekly fuel prices                     | município                | weekly                   | bulk   | stable    | open            |
| `anp_posto`             | fuel stations                          | estabelecimento          | irregular                | bulk   | semi      | open            |
| `cadastur`              | registered tourism providers           | estabelecimento          | monthly                  | bulk   | semi      | open            |
| `mapa_turismo`          | official tourism municipalities        | município                | irregular                | bulk   | semi      | open            |
| `sinapi_cub`            | construction cost                      | UF                       | monthly                  | bulk   | semi      | open            |
| `dieese_cesta`          | basic food basket cost                 | capital                  | monthly                  | portal | semi      | open            |
| `snis`                  | sanitation                             | município                | annual                   | bulk   | semi      | open            |
| `s2id_emergencia`       | emergency decrees                      | município                | monthly                  | portal | volatile  | open            |
| `cemaden_risco`         | flood and landslide risk               | área                     | irregular                | bulk   | semi      | open            |
| `inpe_queimadas`        | fire hotspots                          | point                    | daily                    | api    | stable    | open            |
| `atlas_violencia`       | violence indicators                    | município                | annual                   | bulk   | semi      | open            |
| `datasus_sim_sinasc`    | mortality and births                   | município                | annual                   | bulk   | semi      | open            |
| `inep_ideb`             | school quality                         | escola                   | biennial                 | bulk   | semi      | open            |
| `mte_rais`              | formal employment stock                | estabelecimento          | annual                   | bulk   | semi      | open, cite MTE  |

### Wave 4 — territorial and vertical

| Key                 | What it answers                | Granularity     | Cadence   | Access | Stability | License         |
| ------------------- | ------------------------------ | --------------- | --------- | ------ | --------- | --------------- |
| `municipal_zoning`  | what is allowed where          | lote, zona      | irregular | portal | volatile  | open (varies)   |
| `municipal_iptu`    | land and building value        | lote            | irregular | portal | volatile  | open (varies)   |
| `municipal_alvaras` | business licences issued       | estabelecimento | irregular | portal | volatile  | open (varies)   |
| `od_survey`         | metropolitan trip matrix       | zona OD         | one-off   | portal | volatile  | open            |
| `sicar`             | georeferenced rural properties | imóvel          | irregular | portal | volatile  | open            |
| `ibge_censo_agro`   | farm structure                 | estabelecimento | one-off   | bulk   | semi      | open, cite IBGE |
| `fipezap`           | rent index                     | município       | monthly   | bulk   | semi      | commercial      |
| `ibpt_tributos`     | tax burden per CNAE/NCM        | setor           | annual    | bulk   | semi      | commercial      |

## Extraction reality

The catalog above is not uniform. Only one tier can run unattended.

**Tier A — stable contract.** Documented API or fixed layout, predictable cadence. Safe to schedule, no human in the loop.

- IBGE (SIDRA, malhas, localidades, estimativas, CEMPRE, PAM/PPM), BCB Olinda (PIX, ESTBAN), MDIC Comex, Overture (versioned Parquet on S3), OSM via Geofabrik, INPE.
- Caveat: `rfb_cnpj` has a documented layout but the monthly folder becomes visible **before every fragment is uploaded**. The adapter must assert expected file count and row bounds, and refuse to publish a partial upload.

**Tier B — semi-structured.** A file exists, but the shape drifts: header changes, merged cells in spreadsheets, a month published late or skipped. Requires layout detection, schema-drift quarantine and an owner.

- INEP, DATASUS/CNES, ANEEL, ANATEL, ANP, ANS, MapBiomas, SINAPI/CUB, DIEESE, Portal da Transparência, BNDES, RAIS, INSS.
- Expected failure mode: the parser keeps "working" and silently ingests shifted columns. Every adapter validates column names and rejects on mismatch.

**Tier C — no standard.** One portal per institution or municipality, HTML/PDF/scanned forms, no versioning. Not schedulable.

- `municipal_zoning`, `municipal_iptu`, `municipal_alvaras`, `od_survey`, `sicar`, `cadunico`, `s2id_emergencia`.
- Handled as curated snapshots: a human obtains the file, the worker ingests from the stored artifact. Never advertised as recurring until proven recurring.

**Format standard is not feed quality.** `gtfs` is a standard specification, but each operator ships a different quality of feed; expect a meaningful share to require per-city normalization or manual repair. Treat GTFS as tier C per city until the feed passes validation.

### Adapter contract

Every dataset implements the same interface, so the worker is generic:

- `discover()` — list available references at the source.
- `fetch(reference)` — download to `GEO_RAW_DIR`, compute checksum.
- `assertComplete(files)` — expected file list, row count bounds, non-empty fragments.
- `detectLayout(file)` — validate columns/encoding; reject unknown layout versions.
- `stage()` / `transform()` / `publish()` — as described in the pipeline stages.
- Declared metadata: `cadence`, `access`, `tier`, `slaDays`, `dependsOn`, `license`, `redistributionAllowed`.

### Freshness and staleness

- `slaDays` is the tolerated delay after which a dataset is stale.
- `geo_dataset_age_days` is exported per dataset and alerted when above `slaDays`.
- `GET /geo/coverage` returns `isStale` per dataset; the client must show it next to any number derived from that dataset.
- A tier C dataset is never shown as "current" — it carries the reference date of the snapshot, always.

## Open decisions

- Whether `overture_place` and `osm_poi` are merged into one served layer. Merging creates a derived database, which pulls ODbL share-alike into the result.
- Retention window and plan gating for exports.
- Whether `asOf` queries are exposed on the free tier or paid only.
- Whether tier C sources enter the product as curated snapshots or stay out until the first city proves the adapter.
- How many municipal adapters (`municipal_zoning`, `municipal_iptu`, `municipal_alvaras`) are supported in the first year, and which cities.
