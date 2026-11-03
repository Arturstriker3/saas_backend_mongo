import { Inject, Injectable, Logger } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../../../../common/config/env';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import type { ChunkStats } from '../../domain/dataset-publisher.interface';
import { SIMPLES_PUBLISHER, type SimplesPublisher } from '../../domain/simples-publisher.interface';
import type { SimplesInput } from '../../domain/establishment.types';
import { createChecksumAccumulator } from '../geojson/fingerprint';
import { RFB_CNPJ_WEBDAV_URL, RfbCnpjClient } from '../rfb/rfb-cnpj.client';

const FLUSH_SIZE = 10_000;
const PROGRESS_EVERY = 5_000_000;
/** The 2026-10 snapshot ships 50,8M companies; a shorter file is truncated. */
const MIN_ROWS = 40_000_000;
const METHODOLOGY =
  'RFB — Simples Nacional e MEI: opção, data de opção e data de exclusão por CNPJ básico';

/**
 * Loads the Simples Nacional and MEI option of every company that declared it.
 * The source is one archive for the whole country and replaces the previous
 * month, so the publisher swaps tables instead of merging.
 */
@Injectable()
export class RfbSimplesAdapter implements DatasetAdapter {
  readonly datasetKey = 'rfb_simples';
  readonly defaultReference = '2026-10';
  private readonly logger = new Logger('RfbSimplesAdapter');

  constructor(
    private readonly client: RfbCnpjClient,
    @Inject(SIMPLES_PUBLISHER) private readonly publisher: SimplesPublisher,
  ) {}

  async discoverReference(): Promise<string> {
    const source = await this.client.findSimples();
    return source.reference;
  }

  async ingest(reference: string): Promise<void> {
    const source = await this.client.findSimples();
    if (source.reference !== reference) {
      this.logger.warn(
        `Source publishes ${source.reference}; collecting it instead of ${reference}`,
      );
    }

    const workDir = join(loadEnv().GEO_RAW_DIR, this.datasetKey, source.reference);
    await rm(workDir, { recursive: true, force: true });

    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference: source.reference,
      methodology: METHODOLOGY,
      sourceUrl: `${RFB_CNPJ_WEBDAV_URL}/${source.reference}/Simples.zip`,
      extractedAt: new Date(),
    });

    const stats: ChunkStats = { inserted: 0, updated: 0 };
    const checksum = createChecksumAccumulator();
    let buffer: SimplesInput[] = [];
    let count = 0;

    try {
      for await (const row of this.client.readSimples(source.url, join(workDir, 'simples'))) {
        checksum.add(simplesFingerprint(row));
        buffer.push(row);
        count += 1;

        if (buffer.length >= FLUSH_SIZE) {
          await this.flush(versionId, buffer, stats);
          buffer = [];
          if (count % PROGRESS_EVERY < FLUSH_SIZE) this.logger.log(`${count} companies written`);
        }
      }

      if (buffer.length > 0) await this.flush(versionId, buffer, stats);

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        checksum: checksum.digest(),
        stats,
        minRows: MIN_ROWS,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${source.reference}: ${result.inserted} companies`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  private async flush(versionId: string, rows: SimplesInput[], stats: ChunkStats): Promise<void> {
    const chunk = await this.publisher.writeChunk(versionId, rows);
    stats.inserted += chunk.inserted;
    stats.updated += chunk.updated;
  }
}

function simplesFingerprint(row: SimplesInput): string {
  return [
    'simples',
    row.companyCode,
    row.simplesOption,
    row.simplesSince,
    row.simplesUntil,
    row.meiOption,
    row.meiSince,
    row.meiUntil,
  ].join('|');
}
