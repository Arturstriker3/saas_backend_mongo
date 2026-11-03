import { Kysely, sql } from 'kysely';
import type { GeoDB } from '../geo-db.types';

/**
 * Creates the address base of the CNEFE. It is the only table with a point for
 * every address, so it is what turns the CNPJ (which carries no coordinate) into
 * something a map or a radius query can use.
 *
 * The table is published through a load table and a swap, like the CNPJ: it
 * holds ~106M rows and the indexes are built once, at the end.
 */
export const migration013Addresses = {
  async up(db: Kysely<GeoDB>): Promise<void> {
    await sql`
      CREATE TABLE geo.address (
        id text NOT NULL,
        uf_code text NOT NULL,
        municipality_code text NOT NULL,
        district_code text,
        subdistrict_code text,
        sector_code text,
        block text,
        face text,
        cep text,
        locality text,
        street_type text,
        street_title text,
        street text,
        street_number text,
        modifier text,
        complement text,
        latitude double precision,
        longitude double precision,
        geom geometry(Point, 4326),
        geocode_level smallint,
        species_code smallint NOT NULL,
        establishment_name text,
        dataset_version_id bigint REFERENCES geo.dataset_version(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        -- The CNEFE code identifies the address, not the record: a household and
        -- a shop on the same address share the code and differ by species.
        PRIMARY KEY (id, species_code)
      )
    `.execute(db);

    await sql`CREATE INDEX address_municipality ON geo.address (municipality_code)`.execute(db);
    await sql`CREATE INDEX address_sector ON geo.address (sector_code)`.execute(db);
    await sql`CREATE INDEX address_cep ON geo.address (cep)`.execute(db);
    await sql`CREATE INDEX address_street ON geo.address (municipality_code, street)`.execute(db);
    await sql`CREATE INDEX address_geom_gist ON geo.address USING gist (geom)`.execute(db);
  },

  async down(db: Kysely<GeoDB>): Promise<void> {
    await sql`DROP TABLE IF EXISTS geo.address`.execute(db);
  },
};
