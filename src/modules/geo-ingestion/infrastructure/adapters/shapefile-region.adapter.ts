import { Inject, Injectable, Logger } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../../../../common/config/env';
import { toSearchName } from '../../../../common/text/search-name';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import {
  DATASET_PUBLISHER,
  type ChunkStats,
  type DatasetPublisher,
} from '../../domain/dataset-publisher.interface';
import type { RegionInput } from '../../domain/region.types';
import { createChecksumAccumulator, regionFingerprint } from '../geojson/fingerprint';
import { toMultiPolygonGeoJson } from '../geojson/geometry';
import { GeoShapefileSource } from '../shapefile/geo-shapefile.source';
import {
  BAIRRO_CONFIG,
  SETOR_CONFIG,
  toRegionInput,
  type ShapefileRegionConfig,
} from '../shapefile/shapefile-region.mapper';

const FLUSH_SIZE = 5_000;
const PROGRESS_EVERY = 50_000;

/**
 * Streams an IBGE shapefile into `geo.region`. Features are written in batches,
 * so a 700 MB archive never has to fit in memory.
 */
export abstract class ShapefileRegionAdapter implements DatasetAdapter {
  abstract readonly datasetKey: string;
  readonly defaultReference: string;

  protected readonly logger: Logger;

  protected constructor(
    private readonly config: ShapefileRegionConfig,
    private readonly source: GeoShapefileSource,
    private readonly publisher: DatasetPublisher,
  ) {
    this.defaultReference = config.defaultReference;
    this.logger = new Logger(config.datasetKey);
  }

  async ingest(reference: string): Promise<void> {
    const baseDir = join(loadEnv().GEO_RAW_DIR, this.datasetKey, reference);
    // A killed run leaves its archive behind and nothing is resumed, so start clean.
    await rm(baseDir, { recursive: true, force: true });
    const checksum = createChecksumAccumulator();
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    let buffer: RegionInput[] = [];
    let total = 0;
    let skipped = 0;

    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference,
      methodology: this.config.methodology,
      sourceUrl: this.config.sourceUrl,
      extractedAt: new Date(),
      sourceSrid: this.config.sourceSrid,
    });

    try {
      for (const [part, url] of this.config.urls.entries()) {
        for await (const feature of this.source.read(url, join(baseDir, `part-${part}`))) {
          const region = toRegionInput(this.config, feature, toMultiPolygonGeoJson, toSearchName);
          if (!region) {
            skipped += 1;
            continue;
          }

          checksum.add(regionFingerprint(region.level, region.ibgeCode, region.geometry));
          buffer.push(region);
          total += 1;

          if (buffer.length >= FLUSH_SIZE) {
            await this.flush(versionId, buffer, stats);
            buffer = [];
            if (total % PROGRESS_EVERY === 0) this.logger.log(`${total} regions written`);
          }
        }

        this.logger.log(`Part ${part + 1}/${this.config.urls.length} read (${total} regions)`);
      }

      if (buffer.length > 0) await this.flush(versionId, buffer, stats);

      this.assertCounts(total, skipped);

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        checksum: checksum.digest(),
        stats,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${reference}: ${result.inserted} added, ${result.updated} updated`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  private async flush(versionId: string, buffer: RegionInput[], stats: ChunkStats): Promise<void> {
    const chunk = await this.publisher.writeChunk(versionId, buffer, this.config.sourceSrid);
    stats.inserted += chunk.inserted;
    stats.updated += chunk.updated;
  }

  private assertCounts(total: number, skipped: number): void {
    if (skipped > 0) {
      this.logger.warn(`${skipped} feature(s) without code or geometry were skipped`);
    }

    if (total < this.config.expectedMin || total > this.config.expectedMax) {
      throw new Error(
        `${this.datasetKey}: ${total} regions is outside ${this.config.expectedMin}-${this.config.expectedMax}`,
      );
    }
  }
}

@Injectable()
export class IbgeBairroAdapter extends ShapefileRegionAdapter {
  readonly datasetKey = BAIRRO_CONFIG.datasetKey;

  constructor(source: GeoShapefileSource, @Inject(DATASET_PUBLISHER) publisher: DatasetPublisher) {
    super(BAIRRO_CONFIG, source, publisher);
  }
}

@Injectable()
export class IbgeSetorAdapter extends ShapefileRegionAdapter {
  readonly datasetKey = SETOR_CONFIG.datasetKey;

  constructor(source: GeoShapefileSource, @Inject(DATASET_PUBLISHER) publisher: DatasetPublisher) {
    super(SETOR_CONFIG, source, publisher);
  }
}
