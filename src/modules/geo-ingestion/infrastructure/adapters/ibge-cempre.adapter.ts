import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import {
  EMPLOYMENT_PUBLISHER,
  type EmploymentPublisher,
} from '../../domain/employment-publisher.interface';
import type { EmploymentRecord } from '../../domain/employment.types';
import { createChecksumAccumulator } from '../geojson/fingerprint';
import { CempreClient, CLASSES_PER_REQUEST } from '../cempre/cempre.client';

const MIN_CATEGORIES = 640;
const MAX_CATEGORIES = 700;
/**
 * A complete class-level extraction has ~800k municipality×class pairs, measured
 * against our own CNPJ registry (1.03M pairs, of which CEMPRE reports about 80%).
 * The floor sits a third below that: sparse years still publish, a wave of
 * silently empty responses does not.
 */
const MIN_ROWS = 600_000;
/** Brazil has 5 570 municipalities; fewer series than this means a broken request. */
const MIN_MUNICIPALITIES = 5_400;
const FLUSH_SIZE = 10_000;
const SOURCE_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/9418';
const METHODOLOGY =
  'IBGE — Cadastro Central de Empresas (SIDRA agregado 9418): empresas, pessoal ocupado, ' +
  'pessoal assalariado e salários por município e classe CNAE 2.0';

/**
 * Publishes the CEMPRE employment by municipality and CNAE class, two classes per
 * request — the SIDRA API answers 500 above that.
 */
@Injectable()
export class IbgeCempreAdapter implements DatasetAdapter {
  readonly datasetKey = 'ibge_cempre';
  readonly defaultReference = String(new Date().getFullYear());
  private readonly logger = new Logger('IbgeCempreAdapter');

  constructor(
    private readonly client: CempreClient,
    @Inject(EMPLOYMENT_PUBLISHER) private readonly publisher: EmploymentPublisher,
  ) {}

  async discoverReference(): Promise<string> {
    return this.client.findLatestPeriod();
  }

  async ingest(reference: string): Promise<void> {
    const categories = await this.client.fetchCategories(reference);
    this.assertCategories(categories.length);

    const checksum = createChecksumAccumulator();
    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference,
      methodology: METHODOLOGY,
      sourceUrl: SOURCE_URL,
      extractedAt: new Date(),
      categories: categories.map(({ code, name }) => ({ code, name })),
    });

    const stats = { inserted: 0, updated: 0 };
    const batches = chunk(categories, CLASSES_PER_REQUEST);
    let total = 0;

    try {
      for (const [position, batch] of batches.entries()) {
        const rows = await this.client.fetchEmployment(reference, batch);
        checksum.add(`${batch.map((category) => category.code).join('+')}:${rows.length}`);

        await this.flush(versionId, rows, stats);
        total += rows.length;

        this.logger.log(
          `${position + 1}/${batches.length} ` +
            `${batch.map((category) => category.code).join(',')}: ` +
            `${rows.length} rows (${total} total)`,
        );
      }
      await this.flushTotals(versionId, reference);

      const result = await this.publisher.finalize({
        datasetKey: this.datasetKey,
        versionId,
        reference,
        checksum: checksum.digest(),
        stats,
        minRows: MIN_ROWS,
      });

      this.logger.log(
        `Published ${this.datasetKey} ${reference}: ${result.inserted} rows, ` +
          `${categories.length} classes`,
      );
    } catch (error) {
      await this.publisher.discard(this.datasetKey, versionId);
      throw error;
    }
  }

  private async flush(
    versionId: string,
    rows: EmploymentRecord[],
    stats: { inserted: number; updated: number },
  ): Promise<void> {
    for (let index = 0; index < rows.length; index += FLUSH_SIZE) {
      const chunk = await this.publisher.writeChunk(
        versionId,
        rows.slice(index, index + FLUSH_SIZE),
      );
      stats.inserted += chunk.inserted;
      stats.updated += chunk.updated;
    }
  }

  /**
   * Reads the municipality total, which the class-level cells cannot reproduce:
   * IBGE withholds the employment of the classes with few companies.
   */
  private async flushTotals(versionId: string, reference: string): Promise<void> {
    const totals = await this.client.fetchTotals(reference);

    if (totals.length < MIN_MUNICIPALITIES) {
      throw new Error(
        `CEMPRE returned ${totals.length} municipalities, below ${MIN_MUNICIPALITIES}`,
      );
    }

    await this.publisher.writeTotals(versionId, totals);

    const occupied = totals.reduce((sum, row) => sum + row.occupiedPersons, 0);
    this.logger.log(`Totals: ${totals.length} municipalities, ${occupied} occupied`);
  }

  private assertCategories(count: number): void {
    if (count < MIN_CATEGORIES || count > MAX_CATEGORIES) {
      throw new Error(
        `CNAE class count ${count} is outside ${MIN_CATEGORIES}-${MAX_CATEGORIES}; ` +
          'the classification or the source layout changed',
      );
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}
