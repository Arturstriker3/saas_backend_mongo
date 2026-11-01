import { Inject, Injectable, Logger } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../../../../common/config/env';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import type { ChunkStats } from '../../domain/dataset-publisher.interface';
import {
  ESTABLISHMENT_PUBLISHER,
  type EstablishmentPublisher,
} from '../../domain/establishment-publisher.interface';
import type { CnaeInput, EstablishmentInput } from '../../domain/establishment.types';
import { createChecksumAccumulator, type ChecksumAccumulator } from '../geojson/fingerprint';
import { RFB_CNPJ_WEBDAV_URL, RfbCnpjClient, type RfbCnpjSourceSet } from '../rfb/rfb-cnpj.client';

const FLUSH_SIZE = 5_000;
const PROGRESS_EVERY = 1_000_000;
const MIN_ROWS_PER_PART = 100_000;
const ESTABLISHMENT_RANGE = { min: 45_000_000, max: 90_000_000 };
const CNAE_RANGE = { min: 1_200, max: 1_500 };
const MAX_UNRESOLVED_MUNICIPALITY_SHARE = 0.05;
const METHODOLOGY =
  'RFB CNPJ — estabelecimentos com CNAE principal e município derivado do código TOM (UF + TOM + DV)';

interface EstablishmentSummary {
  count: number;
  unresolvedMunicipality: number;
  stats: ChunkStats;
}

/**
 * Loads the monthly CNPJ registry: every establishment with its primary CNAE,
 * municipality and status. Address fields are not kept.
 */
@Injectable()
export class RfbCnpjAdapter implements DatasetAdapter {
  readonly datasetKey = 'rfb_cnpj';
  readonly defaultReference = '2026-10';
  private readonly logger = new Logger('RfbCnpjAdapter');

  constructor(
    private readonly client: RfbCnpjClient,
    @Inject(ESTABLISHMENT_PUBLISHER) private readonly publisher: EstablishmentPublisher,
  ) {}

  async discoverReference(): Promise<string> {
    const latest = await this.client.findLatest();
    return latest.reference;
  }

  async ingest(reference: string): Promise<void> {
    const source = await this.client.findLatest();
    if (source.reference !== reference) {
      this.logger.warn(
        `Source publishes ${source.reference}; collecting it instead of ${reference}`,
      );
    }

    const baseDir = join(loadEnv().GEO_RAW_DIR, this.datasetKey, source.reference);
    await rm(baseDir, { recursive: true, force: true });

    const checksum = createChecksumAccumulator();
    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference: source.reference,
      methodology: METHODOLOGY,
      sourceUrl: `${RFB_CNPJ_WEBDAV_URL}/${source.reference}`,
      extractedAt: new Date(),
    });

    try {
      const cnaeStats = await this.writeCnaes(versionId, source, baseDir, checksum);
      const establishments = await this.writeEstablishments(versionId, source, baseDir, checksum);

      this.assertRange('cnae', cnaeStats.inserted + cnaeStats.updated, CNAE_RANGE);
      this.assertRange('estabelecimento', establishments.count, ESTABLISHMENT_RANGE);
      this.assertMunicipalityCoverage(establishments);

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        checksum: checksum.digest(),
        stats: establishments.stats,
        cnaeStats,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${source.reference}: ${result.inserted} added, ` +
          `${result.updated} updated, ${cnaeStats.inserted + cnaeStats.updated} cnae`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  private async writeCnaes(
    versionId: string,
    source: RfbCnpjSourceSet,
    baseDir: string,
    checksum: ChecksumAccumulator,
  ): Promise<ChunkStats> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    let buffer: CnaeInput[] = [];

    for await (const cnae of this.client.readCnaes(source.cnaeUrl, join(baseDir, 'cnae'))) {
      checksum.add(`cnae:${cnae.code}:${cnae.description}`);
      buffer.push(cnae);

      if (buffer.length >= FLUSH_SIZE) {
        await this.flushCnaes(versionId, buffer, stats);
        buffer = [];
      }
    }

    if (buffer.length > 0) await this.flushCnaes(versionId, buffer, stats);

    return stats;
  }

  private async writeEstablishments(
    versionId: string,
    source: RfbCnpjSourceSet,
    baseDir: string,
    checksum: ChecksumAccumulator,
  ): Promise<EstablishmentSummary> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    let buffer: EstablishmentInput[] = [];
    let count = 0;
    let unresolvedMunicipality = 0;

    for (const [index, url] of source.establishmentUrls.entries()) {
      let partCount = 0;

      for await (const row of this.client.readEstablishments(url, join(baseDir, `part-${index}`))) {
        checksum.add(establishmentFingerprint(row));
        buffer.push(row);
        count += 1;
        partCount += 1;
        if (row.municipalityCode === null) unresolvedMunicipality += 1;

        if (buffer.length >= FLUSH_SIZE) {
          await this.flushEstablishments(versionId, buffer, stats);
          buffer = [];
          if (count % PROGRESS_EVERY === 0) this.logger.log(`${count} establishments written`);
        }
      }

      this.assertPartRows(partCount, index);
      this.logger.log(`Part ${index} done: ${partCount} establishments`);
    }

    if (buffer.length > 0) await this.flushEstablishments(versionId, buffer, stats);

    return { count, unresolvedMunicipality, stats };
  }

  private async flushCnaes(
    versionId: string,
    buffer: CnaeInput[],
    stats: ChunkStats,
  ): Promise<void> {
    const chunk = await this.publisher.writeCnaes(versionId, buffer);
    stats.inserted += chunk.inserted;
    stats.updated += chunk.updated;
  }

  private async flushEstablishments(
    versionId: string,
    buffer: EstablishmentInput[],
    stats: ChunkStats,
  ): Promise<void> {
    const chunk = await this.publisher.writeEstablishments(versionId, buffer);
    stats.inserted += chunk.inserted;
    stats.updated += chunk.updated;
  }

  private assertPartRows(count: number, index: number): void {
    if (count < MIN_ROWS_PER_PART) {
      throw new Error(
        `${this.datasetKey} part ${index}: ${count} rows is below ${MIN_ROWS_PER_PART}; ` +
          'the archive is incomplete or truncated',
      );
    }
  }

  private assertRange(label: string, count: number, range: { min: number; max: number }): void {
    if (count < range.min || count > range.max) {
      throw new Error(
        `${this.datasetKey} ${label}: ${count} rows is outside ${range.min}-${range.max}`,
      );
    }
  }

  private assertMunicipalityCoverage(summary: EstablishmentSummary): void {
    const share = summary.unresolvedMunicipality / summary.count;
    if (share <= MAX_UNRESOLVED_MUNICIPALITY_SHARE) return;

    throw new Error(
      `${summary.unresolvedMunicipality} of ${summary.count} establishments have no IBGE ` +
        'municipality; publish refused',
    );
  }
}

function establishmentFingerprint(row: EstablishmentInput): string {
  return [
    'establishment',
    row.cnpj,
    row.tradeName,
    row.isHeadquarters,
    row.cnaeCode,
    row.registrationStatus,
    row.openedOn,
    row.cep,
    row.uf,
    row.municipalityCode,
  ].join('|');
}
