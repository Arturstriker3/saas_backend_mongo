import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  STATISTICS_READ_REPOSITORY,
  type StatisticsReadRepository,
} from '../../domain/statistics-read.repository.interface';
import type { MunicipalityStatistics, UfStatistics } from '../../domain/statistics-view.types';

export const StatisticsQueryDTO = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type StatisticsQueryInputDTO = z.infer<typeof StatisticsQueryDTO>;

export const GetMunicipalityStatisticsDTO = z.object({
  code: z.string().regex(/^\d{7}$/, 'IBGE municipality code with 7 digits'),
});

export type GetMunicipalityStatisticsInputDTO = z.infer<typeof GetMunicipalityStatisticsDTO>;

export const GetUfStatisticsDTO = z.object({
  uf: z.string().regex(/^(\d{2}|[A-Za-z]{2})$/, 'IBGE state code or two-letter abbreviation'),
});

export type GetUfStatisticsInputDTO = z.infer<typeof GetUfStatisticsDTO>;

@Injectable()
export class GetMunicipalityStatisticsUseCase {
  constructor(
    @Inject(STATISTICS_READ_REPOSITORY)
    private readonly statistics: StatisticsReadRepository,
  ) {}

  /**
   * Reads the pre-aggregated activity profile of a municipality.
   * @param code - IBGE municipality code.
   * @param query - How many activities to rank.
   * @returns The totals, the population and the top CNAEs.
   */
  async execute(
    code: string,
    query: StatisticsQueryInputDTO,
  ): Promise<MunicipalityStatistics> {
    const statistics = await this.statistics.municipality(code, query.limit);
    if (!statistics) throw new NotFoundException(`Municipality ${code} not found`);

    return statistics;
  }
}

@Injectable()
export class GetUfStatisticsUseCase {
  constructor(
    @Inject(STATISTICS_READ_REPOSITORY)
    private readonly statistics: StatisticsReadRepository,
  ) {}

  /**
   * Reads the pre-aggregated activity profile of a state.
   * @param uf - IBGE state code or two-letter abbreviation.
   * @param query - How many activities to rank.
   * @returns The totals and the top CNAEs.
   */
  async execute(uf: string, query: StatisticsQueryInputDTO): Promise<UfStatistics> {
    const statistics = await this.statistics.uf(uf, query.limit);
    if (!statistics) throw new NotFoundException(`State ${uf} not found`);

    return statistics;
  }
}
