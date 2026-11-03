import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import {
  REGION_INDICATOR_PUBLISHER,
  type RegionIndicatorPublisher,
} from '../../domain/region-indicator-publisher.interface';
import type { RegionIndicatorInput } from '../../domain/region-indicator.types';
import { checksumOf } from '../geojson/fingerprint';
import { IbgeEstimativasClient } from '../ibge/ibge-estimativas.client';

const MIN_MUNICIPALITIES = 5_500;
const MAX_MUNICIPALITIES = 5_800;
const INDICATOR_KEY = 'population';
const SOURCE_URL = 'https://servicodados.ibge.gov.br/api/v3/agregados/6579';
const METHODOLOGY = 'IBGE — Estimativas da População residente (SIDRA agregado 6579, variável 9324)';

/**
 * Publishes the current municipal population estimate. Every year is its own
 * version, so the series accumulates instead of replacing the previous one.
 */
@Injectable()
export class IbgeEstimativasAdapter implements DatasetAdapter {
  readonly datasetKey = 'ibge_estimativas';
  readonly defaultReference = String(new Date().getFullYear());
  private readonly logger = new Logger('IbgeEstimativasAdapter');

  constructor(
    private readonly client: IbgeEstimativasClient,
    @Inject(REGION_INDICATOR_PUBLISHER) private readonly publisher: RegionIndicatorPublisher,
  ) {}

  async discoverReference(): Promise<string> {
    return this.client.findLatestPeriod();
  }

  async ingest(reference: string): Promise<void> {
    const estimates = await this.client.fetchPopulation(reference);
    this.assertRange(estimates.length);

    const indicators: RegionIndicatorInput[] = estimates.map((estimate) => ({
      regionCode: estimate.municipalityCode,
      indicatorKey: INDICATOR_KEY,
      reference,
      value: estimate.population,
    }));

    const checksum = checksumOf(
      indicators.map((indicator) => `${indicator.regionCode}:${indicator.value}`),
    );

    const result = await this.publisher.publish({
      datasetKey: this.datasetKey,
      reference,
      methodology: METHODOLOGY,
      sourceUrl: SOURCE_URL,
      extractedAt: new Date(),
      checksum,
      indicatorKey: INDICATOR_KEY,
      indicators,
    });

    this.logger.log(
      `Published ${this.datasetKey} ${reference}: ${result.inserted} added, ` +
        `${result.updated} updated (${indicators.length} municipalities)`,
    );
  }

  private assertRange(count: number): void {
    if (count < MIN_MUNICIPALITIES || count > MAX_MUNICIPALITIES) {
      throw new Error(
        `Estimate count ${count} is outside ${MIN_MUNICIPALITIES}-${MAX_MUNICIPALITIES}`,
      );
    }
  }
}
