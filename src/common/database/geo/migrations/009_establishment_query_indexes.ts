import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Makes the published CNPJ tables durable and adds the indexes the product
 * queries depend on: active establishments per municipality and CNAE, plus
 * trigram search on the official name and the trade name.
 */
export const migration009EstablishmentQueryIndexes = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    // The migrator runs every migration inside a transaction, so `SET LOCAL`
    // lifts the timeout for the rewrite and the index builds that follow.
    await sql`SET LOCAL statement_timeout = 0`.execute(db);

    // The load/swap inherits the persistence of the mirror table; an unlogged
    // table is truncated by the first crash recovery, so the published snapshot
    // has to be logged.
    await sql`ALTER TABLE geo.cnae SET LOGGED`.execute(db);
    await sql`ALTER TABLE geo.company SET LOGGED`.execute(db);
    await sql`ALTER TABLE geo.establishment SET LOGGED`.execute(db);

    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`.execute(db);

    // Market queries always look at active establishments; the partial index
    // keeps the company history out of the picture.
    await sql`
      CREATE INDEX IF NOT EXISTS establishment_active_municipality_cnae
        ON geo.establishment (municipality_code, cnae_principal)
        WHERE registration_status = 2
    `.execute(db);

    await sql`
      CREATE INDEX IF NOT EXISTS company_legal_name_trgm
        ON geo.company USING gin (legal_name gin_trgm_ops)
    `.execute(db);

    // ~69% of the establishments carry no trade name.
    await sql`
      CREATE INDEX IF NOT EXISTS establishment_trade_name_trgm
        ON geo.establishment USING gin (trade_name gin_trgm_ops)
        WHERE trade_name IS NOT NULL
    `.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP INDEX IF EXISTS geo.establishment_trade_name_trgm`.execute(db);
    await sql`DROP INDEX IF EXISTS geo.company_legal_name_trgm`.execute(db);
    await sql`DROP INDEX IF EXISTS geo.establishment_active_municipality_cnae`.execute(db);
    // Persistence is not reverted: turning the snapshot back into an unlogged
    // table would let a crash recovery truncate it.
  },
};
