import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { RegionLevel } from '../../../../common/database/geo/geo-db.types';
import {
  REGION_READ_REPOSITORY,
  type RegionReadRepository,
} from '../../domain/region-read.repository.interface';
import type { RegionDetail } from '../../domain/region-view.types';

export const GetRegionParamsDTO = z.object({
  code: z
    .string()
    .regex(/^\d{2,15}$/)
    .describe('IBGE code'),
  level: z.enum(['state', 'municipality', 'district', 'neighborhood', 'sector']).optional(),
});

export type GetRegionParamsInputDTO = z.infer<typeof GetRegionParamsDTO>;

@Injectable()
export class GetRegionUseCase {
  constructor(@Inject(REGION_READ_REPOSITORY) private readonly regions: RegionReadRepository) {}

  /**
   * Loads a region with geometry and dataset evidence.
   * @param input - IBGE code and optional level; a 2-digit code implies a state.
   * @returns The region detail.
   */
  async execute(input: GetRegionParamsInputDTO): Promise<RegionDetail> {
    const level = input.level ?? inferLevel(input.code);
    const region = await this.regions.findByCode(input.code, level);

    if (!region) throw new NotFoundException(`Region ${input.code} not found`);

    return region;
  }
}

/**
 * Infers the level from the IBGE code length: 2 state, 7 municipality, 13 neighborhood, 15 sector.
 * @param code - IBGE code.
 */
function inferLevel(code: string): RegionLevel {
  if (code.length === 2) return 'state';
  if (code.length === 13) return 'neighborhood';
  if (code.length === 15) return 'sector';
  return 'municipality';
}
