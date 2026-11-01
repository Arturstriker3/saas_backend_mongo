import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Establishments published by the Receita Federal (CNPJ) with their primary
 * CNAE. Addresses stay out: the product needs what exists and what it does per
 * municipality, not the street of each store.
 *
 * The municipality is resolved from the CNPJ `uf` + TOM code into the 7-digit
 * IBGE code, so the rows join `geo.region` without a foreign key.
 */
export const migration006Establishments = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.cnae (
        code text PRIMARY KEY,
        description text NOT NULL,
        dataset_version_id bigint REFERENCES geo.dataset_version(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE TABLE geo.establishment (
        cnpj text PRIMARY KEY,
        cnpj_basico text NOT NULL,
        trade_name text,
        is_headquarters boolean NOT NULL,
        cnae_principal text,
        registration_status smallint,
        opened_on date,
        cep text,
        uf text,
        municipality_code text,
        dataset_version_id bigint REFERENCES geo.dataset_version(id) ON DELETE SET NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `.execute(db);

    await sql`
      CREATE INDEX establishment_municipality_cnae
        ON geo.establishment (municipality_code, cnae_principal)
    `.execute(db);

    await sql`
      CREATE INDEX establishment_company
        ON geo.establishment (cnpj_basico)
    `.execute(db);

    await sql`
      CREATE INDEX establishment_version
        ON geo.establishment (dataset_version_id)
    `.execute(db);

    await sql`
      INSERT INTO geo.dataset_license
        (dataset_key, license, redistribution_allowed, attribution_required, attribution_text)
      VALUES
        ('rfb_cnpj', 'open', true, true, 'Fonte: Receita Federal do Brasil — Cadastro Nacional da Pessoa Jurídica (CNPJ)')
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);

    await sql`
      INSERT INTO geo.ingestion_schedule (dataset_key, cadence_days, sla_days)
      VALUES ('rfb_cnpj', 30, 45)
      ON CONFLICT (dataset_key) DO NOTHING
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.establishment`.execute(db);
    await sql`DROP TABLE IF EXISTS geo.cnae`.execute(db);
    await sql`DELETE FROM geo.ingestion_schedule WHERE dataset_key = 'rfb_cnpj'`.execute(db);
    await sql`DELETE FROM geo.dataset_license WHERE dataset_key = 'rfb_cnpj'`.execute(db);
  },
};
