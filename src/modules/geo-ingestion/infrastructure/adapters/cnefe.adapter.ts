import { Inject, Injectable, Logger } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../../../../common/config/env';
import type { AddressInput } from '../../domain/address.types';
import {
  ADDRESS_PUBLISHER,
  type AddressPublisher,
} from '../../domain/address-publisher.interface';
import type { ChunkStats } from '../../domain/dataset-publisher.interface';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import { createChecksumAccumulator } from '../geojson/fingerprint';
import { CNEFE_SOURCE_URL, CNEFE_UFS, CnefeClient } from '../cnefe/cnefe.client';

const REFERENCE = '2022';
/** The 2022 CNEFE has ~106M addresses; below this the source is incomplete. */
const MIN_ADDRESSES = 90_000_000;
const FLUSH_SIZE = 10_000;
const PROGRESS_EVERY = 1_000_000;
const METHODOLOGY =
  'IBGE — Cadastro Nacional de Endereços para Fins Estatísticos (CNEFE) do Censo 2022';

/**
 * Loads the CNEFE address base, one state archive at a time. Each archive is
 * downloaded, read as a stream and deleted before the next one, so the peak
 * disk usage is a single state — not the 25 GB of the whole country.
 */
@Injectable()
export class CnefeAdapter implements DatasetAdapter {
  readonly datasetKey = 'cnefe';
  readonly defaultReference = REFERENCE;
  private readonly logger = new Logger('CnefeAdapter');

  constructor(
    private readonly client: CnefeClient,
    @Inject(ADDRESS_PUBLISHER) private readonly publisher: AddressPublisher,
  ) {}

  async ingest(reference: string): Promise<void> {
    const baseDir = join(loadEnv().GEO_RAW_DIR, this.datasetKey, reference);
    await rm(baseDir, { recursive: true, force: true });

    const checksum = createChecksumAccumulator();
    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference,
      methodology: METHODOLOGY,
      sourceUrl: CNEFE_SOURCE_URL,
      extractedAt: new Date(),
    });

    const stats: ChunkStats = { inserted: 0, updated: 0 };
    let total = 0;
    let nextProgress = PROGRESS_EVERY;

    try {
      for (const uf of CNEFE_UFS) {
        const ufDir = join(baseDir, uf.sigla);
        const csvPath = await this.client.download(uf, ufDir);
        let buffer: AddressInput[] = [];

        for await (const address of this.client.readAddresses(csvPath)) {
          checksum.add(address.id);
          buffer.push(address);
          total += 1;

          if (buffer.length >= FLUSH_SIZE) {
            await this.flush(versionId, buffer, stats);
            buffer = [];
          }

          if (total >= nextProgress) {
            this.logger.log(`${total} addresses written (${uf.sigla})`);
            nextProgress += PROGRESS_EVERY;
          }
        }

        if (buffer.length > 0) await this.flush(versionId, buffer, stats);
        await rm(ufDir, { recursive: true, force: true });

        this.logger.log(`${uf.sigla} read: ${total} addresses so far`);
      }

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        checksum: checksum.digest(),
        stats,
        minRows: MIN_ADDRESSES,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${reference}: ${result.inserted} addresses`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  private async flush(
    versionId: string,
    buffer: AddressInput[],
    stats: ChunkStats,
  ): Promise<void> {
    const chunk = await this.publisher.writeChunk(versionId, buffer);
    stats.inserted += chunk.inserted;
    stats.updated += chunk.updated;
  }
}
