import { createHash } from 'node:crypto';
import type { RegionLevel } from '../../../../common/database/geo/geo-db.types';

/**
 * Builds the stable fingerprint of a region, used to compare versions without
 * storing the geometry twice.
 * @param level - Region level.
 * @param ibgeCode - IBGE code.
 * @param geometry - Normalized GeoJSON string.
 */
export function regionFingerprint(level: RegionLevel, ibgeCode: string, geometry: string): string {
  return `${level}:${ibgeCode}:${createHash('sha256').update(geometry).digest('hex')}`;
}

/**
 * Hashes the fingerprints of a run into the dataset checksum.
 * @param fingerprints - Fingerprints produced during the ingestion.
 */
export function checksumOf(fingerprints: string[]): string {
  return createHash('sha256')
    .update([...fingerprints].sort().join('|'))
    .digest('hex');
}

export interface ChecksumAccumulator {
  add(fingerprint: string): void;
  digest(): string;
}

/**
 * Incremental checksum for sources too large to keep every fingerprint in memory.
 * Order dependent: it reflects the order the source delivered the features.
 */
export function createChecksumAccumulator(): ChecksumAccumulator {
  const hash = createHash('sha256');

  return {
    add(fingerprint: string): void {
      hash.update(fingerprint).update('|');
    },
    digest(): string {
      return hash.digest('hex');
    },
  };
}
