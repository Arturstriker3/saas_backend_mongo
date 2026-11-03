import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { toSearchName } from '../../../../common/text/search-name';
import {
  ESTABLISHMENT_READ_REPOSITORY,
  type EstablishmentReadRepository,
} from '../../domain/establishment-read.repository.interface';
import type { EstablishmentSummary } from '../../domain/establishment-view.types';

export const SearchEstablishmentsDTO = z.object({
  q: z.string().trim().min(3).max(80),
  municipality: z
    .string()
    .regex(/^\d{7}$/, 'IBGE municipality code with 7 digits')
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchEstablishmentsInputDTO = z.infer<typeof SearchEstablishmentsDTO>;

@Injectable()
export class SearchEstablishmentsUseCase {
  constructor(
    @Inject(ESTABLISHMENT_READ_REPOSITORY)
    private readonly establishments: EstablishmentReadRepository,
  ) {}

  /**
   * Searches active establishments by the company legal name.
   * @param input - Search term, optional municipality and page size.
   * @returns The best matches, most similar first.
   */
  execute(input: SearchEstablishmentsInputDTO): Promise<EstablishmentSummary[]> {
    return this.establishments.search({
      term: toSearchName(input.q),
      municipalityCode: input.municipality,
      limit: input.limit,
    });
  }
}
