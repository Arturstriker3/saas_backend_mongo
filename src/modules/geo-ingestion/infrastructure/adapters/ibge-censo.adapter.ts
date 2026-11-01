import { Inject, Injectable, Logger } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from '../../../../common/config/env';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import type { ChunkStats } from '../../domain/dataset-publisher.interface';
import {
  SECTOR_INDICATOR_PUBLISHER,
  type SectorIndicatorPublisher,
} from '../../domain/sector-indicator-publisher.interface';
import type { SectorBasicsInput, SectorIncomeInput } from '../../domain/sector-indicator.types';
import { createChecksumAccumulator, type ChecksumAccumulator } from '../geojson/fingerprint';
import { IbgeCensoClient } from '../ibge/ibge-censo.client';

const FLUSH_SIZE = 5_000;
const PROGRESS_EVERY = 100_000;
const BASICS_RANGE = { min: 460_000, max: 475_000 };
const INCOME_RANGE = { min: 450_000, max: 470_000 };
const MAX_UNMATCHED_SHARE = 0.01;
const SOURCE_URL = 'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022';
const METHODOLOGY =
  'IBGE Censo Demográfico 2022 — agregados por setores censitários (básico e renda do responsável)';

/**
 * Loads population, households and household income per census tract.
 * Attributes are keyed by sector code, so they join `geo.region` without geometry.
 */
@Injectable()
export class IbgeCensoAdapter implements DatasetAdapter {
  readonly datasetKey = 'ibge_censo';
  readonly defaultReference = '2022';
  private readonly logger = new Logger('IbgeCensoAdapter');

  constructor(
    private readonly client: IbgeCensoClient,
    @Inject(SECTOR_INDICATOR_PUBLISHER) private readonly publisher: SectorIndicatorPublisher,
  ) {}

  async discoverReference(): Promise<string> {
    const latest = await this.client.findLatest();
    return latest.reference;
  }

  async ingest(reference: string): Promise<void> {
    const latest = await this.client.findLatest();
    if (latest.reference !== reference) {
      this.logger.warn(
        `Source publishes ${latest.reference}; collecting it instead of ${reference}`,
      );
    }

    const baseDir = join(loadEnv().GEO_RAW_DIR, this.datasetKey, latest.reference);
    await rm(baseDir, { recursive: true, force: true });

    const checksum = createChecksumAccumulator();
    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference: latest.reference,
      methodology: METHODOLOGY,
      sourceUrl: SOURCE_URL,
      extractedAt: new Date(),
    });

    try {
      const basics = await this.writeBasics(versionId, latest.basicsUrl, baseDir, checksum);
      const income = await this.writeIncome(versionId, latest.incomeUrl, baseDir, checksum);

      this.assertRange('basico', basics.count, BASICS_RANGE);
      this.assertRange('renda', income.count, INCOME_RANGE);
      this.assertUnmatched(income.count, income.matched);

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        checksum: checksum.digest(),
        stats: basics.stats,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${latest.reference}: ${result.inserted} added, ` +
          `${result.updated} updated, ${income.matched} with income`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  private async writeBasics(
    versionId: string,
    url: string,
    baseDir: string,
    checksum: ChecksumAccumulator,
  ): Promise<{ count: number; stats: ChunkStats }> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    let buffer: SectorBasicsInput[] = [];
    let count = 0;

    for await (const row of this.client.readBasics(url, join(baseDir, 'basics'))) {
      checksum.add(basicsFingerprint(row));
      buffer.push(row);
      count += 1;

      if (buffer.length >= FLUSH_SIZE) {
        await this.flushBasics(versionId, buffer, stats);
        buffer = [];
        if (count % PROGRESS_EVERY === 0) this.logger.log(`${count} sectors written`);
      }
    }

    if (buffer.length > 0) await this.flushBasics(versionId, buffer, stats);

    return { count, stats };
  }

  private async flushBasics(
    versionId: string,
    buffer: SectorBasicsInput[],
    stats: ChunkStats,
  ): Promise<void> {
    const chunk = await this.publisher.writeBasics(versionId, buffer);
    stats.inserted += chunk.inserted;
    stats.updated += chunk.updated;
  }

  private async writeIncome(
    versionId: string,
    url: string,
    baseDir: string,
    checksum: ChecksumAccumulator,
  ): Promise<{ count: number; matched: number }> {
    let buffer: SectorIncomeInput[] = [];
    let count = 0;
    let matched = 0;

    for await (const row of this.client.readIncome(url, join(baseDir, 'income'))) {
      checksum.add(incomeFingerprint(row));
      buffer.push(row);
      count += 1;

      if (buffer.length >= FLUSH_SIZE) {
        matched += await this.publisher.writeIncome(versionId, buffer);
        buffer = [];
      }
    }

    if (buffer.length > 0) matched += await this.publisher.writeIncome(versionId, buffer);

    return { count, matched };
  }

  private assertRange(label: string, count: number, range: { min: number; max: number }): void {
    if (count < range.min || count > range.max) {
      throw new Error(
        `${this.datasetKey} ${label}: ${count} rows is outside ${range.min}-${range.max}`,
      );
    }
  }

  private assertUnmatched(incomeRows: number, matched: number): void {
    const unmatched = incomeRows - matched;
    if (unmatched <= 0) return;

    this.logger.warn(`${unmatched} income row(s) had no matching sector`);
    if (unmatched > incomeRows * MAX_UNMATCHED_SHARE) {
      throw new Error(
        `${unmatched} of ${incomeRows} income rows have no sector in geo.region; publish refused`,
      );
    }
  }
}

function basicsFingerprint(row: SectorBasicsInput): string {
  return [
    'basics',
    row.sectorCode,
    row.population,
    row.households,
    row.occupiedHouseholds,
    row.averageHouseholdSize,
    row.urban,
  ].join('|');
}

function incomeFingerprint(row: SectorIncomeInput): string {
  return [
    'income',
    row.sectorCode,
    row.responsiblePersons,
    row.averageIncome,
    row.medianIncome,
  ].join('|');
}
