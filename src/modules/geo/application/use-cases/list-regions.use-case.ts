import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { toSearchName } from '../../../../common/text/search-name';
import {
  REGION_READ_REPOSITORY,
  type RegionReadRepository,
} from '../../domain/region-read.repository.interface';
import type { RegionSummary } from '../../domain/region-view.types';

export const ListRegionsDTO = z.object({
  level: z.enum(['state', 'municipality', 'district', 'neighborhood', 'sector']).optional(),
  parent: z
    .string()
    .regex(/^\d{2,15}$/)
    .optional(),
  search: z.string().min(2).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListRegionsInputDTO = z.infer<typeof ListRegionsDTO>;

export const ListChildrenDTO = z.object({
  level: z.enum(['state', 'municipality', 'district', 'neighborhood', 'sector']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListChildrenInputDTO = z.infer<typeof ListChildrenDTO>;

@Injectable()
export class ListRegionsUseCase {
  constructor(@Inject(REGION_READ_REPOSITORY) private readonly regions: RegionReadRepository) {}

  execute(input: ListRegionsInputDTO): Promise<RegionSummary[]> {
    return this.regions.list({
      level: input.level,
      parentCode: input.parent,
      search: input.search ? toSearchName(input.search) : undefined,
      limit: input.limit,
    });
  }
}
