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
import type { CnaeInput, CompanyInput, EstablishmentInput } from '../../domain/establishment.types';
import { checksumOf, createChecksumAccumulator } from '../geojson/fingerprint';
import { RFB_CNPJ_WEBDAV_URL, RfbCnpjClient, type RfbCnpjSourceSet } from '../rfb/rfb-cnpj.client';

const FLUSH_SIZE = 5_000;
const PROGRESS_EVERY = 1_000_000;
const MIN_ROWS_PER_PART = 100_000;
const ESTABLISHMENT_RANGE = { min: 45_000_000, max: 90_000_000 };
const COMPANY_RANGE = { min: 40_000_000, max: 95_000_000 };
const CNAE_RANGE = { min: 1_200, max: 1_500 };
const MAX_UNRESOLVED_MUNICIPALITY_SHARE = 0.05;
const METHODOLOGY =
  'RFB CNPJ — estabelecimentos com CNAE principal e município derivado do código TOM (UF + TOM + DV)';

interface EstablishmentSummary {
  count: number;
  unresolvedMunicipality: number;
  stats: ChunkStats;
  digests: string[];
}

interface PartSummary {
  stats: ChunkStats;
  digests: string[];
}

/**
 * Loads the monthly CNPJ registry: every establishment with its primary CNAE,
 * municipality and address, plus the company behind it.
 *
 * The archives of a dataset are independent, so they are read in parallel up to
 * `RFB_CNPJ_CONCURRENCY`. Each part has its own checksum, combined at the end so
 * the run stays reproducible regardless of how the parts interleave.
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

    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference: source.reference,
      methodology: METHODOLOGY,
      sourceUrl: `${RFB_CNPJ_WEBDAV_URL}/${source.reference}`,
      extractedAt: new Date(),
    });

    try {
      this.logger.log(`Concurrency: ${this.concurrency()} archive(s) at a time`);

      const cnae = await this.writeCnaes(versionId, source, baseDir);
      const company = await this.writeCompanies(versionId, source, baseDir);
      const establishments = await this.writeEstablishments(versionId, source, baseDir);

      this.assertRange('cnae', cnae.stats.inserted, CNAE_RANGE);
      this.assertRange('empresa', company.stats.inserted, COMPANY_RANGE);
      this.assertRange('estabelecimento', establishments.count, ESTABLISHMENT_RANGE);
      this.assertMunicipalityCoverage(establishments);

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        checksum: checksumOf([cnae.digest, ...company.digests, ...establishments.digests]),
        stats: establishments.stats,
        cnaeStats: cnae.stats,
        companyStats: company.stats,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${source.reference}: ` +
          `${result.inserted} establishments, ${company.stats.inserted} companies, ` +
          `${cnae.stats.inserted} cnae`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  /** Archives read at the same time; `1` in production keeps the source untouched. */
  private concurrency(): number {
    const parsed = Number.parseInt(loadEnv().RFB_CNPJ_CONCURRENCY, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  private async writeCnaes(
    versionId: string,
    source: RfbCnpjSourceSet,
    baseDir: string,
  ): Promise<{ stats: ChunkStats; digest: string }> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    const checksum = createChecksumAccumulator();
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

    return { stats, digest: checksum.digest() };
  }

  private async writeCompanies(
    versionId: string,
    source: RfbCnpjSourceSet,
    baseDir: string,
  ): Promise<PartSummary> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    const digests: string[] = new Array(source.companyUrls.length).fill('');

    await forEachWithConcurrency(source.companyUrls, this.concurrency(), async (url, index) => {
      const checksum = createChecksumAccumulator();
      let buffer: CompanyInput[] = [];
      let partCount = 0;

      this.logger.log(`Company part ${index}: downloading ${basename(url)}`);

      for await (const row of this.client.readCompanies(url, join(baseDir, `company-${index}`))) {
        checksum.add(companyFingerprint(row));
        buffer.push(row);
        partCount += 1;

        if (buffer.length >= FLUSH_SIZE) {
          await this.flushCompanies(versionId, buffer, stats);
          buffer = [];
        }
      }

      if (buffer.length > 0) await this.flushCompanies(versionId, buffer, stats);

      this.assertPartRows(partCount, index);
      digests[index] = checksum.digest();
      this.logger.log(`Company part ${index} done: ${partCount} companies`);
    });

    return { stats, digests };
  }

  private async writeEstablishments(
    versionId: string,
    source: RfbCnpjSourceSet,
    baseDir: string,
  ): Promise<EstablishmentSummary> {
    const stats: ChunkStats = { inserted: 0, updated: 0 };
    const digests: string[] = new Array(source.establishmentUrls.length).fill('');
    const counter = { count: 0, unresolvedMunicipality: 0 };

    await forEachWithConcurrency(
      source.establishmentUrls,
      this.concurrency(),
      async (url, index) => {
        const checksum = createChecksumAccumulator();
        let buffer: EstablishmentInput[] = [];
        let partCount = 0;

        this.logger.log(`Establishment part ${index}: downloading ${basename(url)}`);

        for await (const row of this.client.readEstablishments(
          url,
          join(baseDir, `part-${index}`),
        )) {
          checksum.add(establishmentFingerprint(row));
          buffer.push(row);
          partCount += 1;
          counter.count += 1;
          if (row.municipalityCode === null) counter.unresolvedMunicipality += 1;

          if (buffer.length >= FLUSH_SIZE) {
            await this.flushEstablishments(versionId, buffer, stats);
            buffer = [];
            if (counter.count % PROGRESS_EVERY < FLUSH_SIZE) {
              this.logger.log(`${counter.count} establishments written`);
            }
          }
        }

        if (buffer.length > 0) await this.flushEstablishments(versionId, buffer, stats);

        this.assertPartRows(partCount, index);
        digests[index] = checksum.digest();
        this.logger.log(`Establishment part ${index} done: ${partCount} establishments`);
      },
    );

    return { ...counter, stats, digests };
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

  private async flushCompanies(
    versionId: string,
    buffer: CompanyInput[],
    stats: ChunkStats,
  ): Promise<void> {
    const chunk = await this.publisher.writeCompanies(versionId, buffer);
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

/**
 * Runs the worker over the items with at most `limit` in flight. The first
 * failure stops new items and is rethrown after the running ones settle.
 */
async function forEachWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: unknown;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === undefined) {
      const index = next;
      next += 1;
      if (index >= items.length) return;

      try {
        await worker(items[index], index);
      } catch (error) {
        failure = error;
      }
    }
  });

  await Promise.all(runners);

  if (failure !== undefined) throw failure;
}

function basename(url: string): string {
  return url.split('/').pop() ?? url;
}

function companyFingerprint(row: CompanyInput): string {
  return [
    'company',
    row.companyCode,
    row.legalName,
    row.legalNatureCode,
    row.sizeCode,
    row.capitalSocial,
  ].join('|');
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
    row.streetType,
    row.street,
    row.streetNumber,
    row.complement,
    row.neighborhood,
    row.cep,
    row.uf,
    row.municipalityCode,
  ].join('|');
}
