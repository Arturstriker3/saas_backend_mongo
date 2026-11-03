import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import {
  EMPLOYMENT_PUBLISHER,
  type EmploymentPublisher,
} from '../../domain/employment-publisher.interface';
import type { EmploymentRecord } from '../../domain/employment.types';
import { createChecksumAccumulator } from '../geojson/fingerprint';
import { CempreClient } from '../cempre/cempre.client';

const MIN_DIVISIONS = 80;
const MAX_DIVISIONS = 90;
/** A complete extraction has ~233k rows; below this a division failed silently. */
const MIN_ROWS = 180_000;
const FLUSH_SIZE = 10_000;
const SOURCE_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/9418';
const METHODOLOGY =
  'IBGE — Cadastro Central de Empresas (SIDRA agregado 9418): empresas, pessoal ocupado, ' +
  'pessoal assalariado e salários por município e divisão CNAE 2.0';

/**
 * Publishes the CEMPRE employment by municipality and CNAE division, one
 * division per request — the SIDRA API refuses a request that crosses every
 * category with every municipality.
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
    const divisions = await this.client.fetchDivisions(reference);
    this.assertDivisions(divisions.length);

    const checksum = createChecksumAccumulator();
    const versionId = await this.publisher.begin({
      datasetKey: this.datasetKey,
      reference,
      methodology: METHODOLOGY,
      sourceUrl: SOURCE_URL,
      extractedAt: new Date(),
      divisions: divisions.map(({ code, name }) => ({ code, name })),
    });

    const stats = { inserted: 0, updated: 0 };
    let total = 0;

    try {
      for (const [position, division] of divisions.entries()) {
        const rows = await this.client.fetchDivision(reference, division);
        checksum.add(`${division.code}:${rows.reduce((sum, row) => sum + row.occupiedPersons, 0)}`);

        await this.flush(versionId, rows, stats);
        total += rows.length;

        this.logger.log(
          `${position + 1}/${divisions.length} division ${division.code}: ` +
            `${rows.length} municipalities (${total} rows)`,
        );
      }

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
          `${divisions.length} divisions`,
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
      const chunk = await this.publisher.writeChunk(versionId, rows.slice(index, index + FLUSH_SIZE));
      stats.inserted += chunk.inserted;
      stats.updated += chunk.updated;
    }
  }

  private assertDivisions(count: number): void {
    if (count < MIN_DIVISIONS || count > MAX_DIVISIONS) {
      throw new Error(
        `CNAE division count ${count} is outside ${MIN_DIVISIONS}-${MAX_DIVISIONS}; ` +
          'the classification or the source layout changed',
      );
    }
  }
}
