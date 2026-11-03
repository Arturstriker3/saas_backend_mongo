import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  ESTABLISHMENT_READ_REPOSITORY,
  type EstablishmentReadRepository,
} from '../../domain/establishment-read.repository.interface';
import type { EstablishmentDetail } from '../../domain/establishment-view.types';

/** The RFB issues alphanumeric CNPJs since 2026: 12 alphanumeric plus 2 digits. */
const CNPJ = /^[0-9A-Z]{12}\d{2}$/;

export const GetEstablishmentParamsDTO = z.object({
  cnpj: z
    .string()
    .transform((value) => value.replace(/[^0-9A-Za-z]/g, '').toUpperCase())
    .refine((value) => CNPJ.test(value), 'CNPJ must be 14 characters: 12 alphanumeric and 2 digits'),
});

export type GetEstablishmentParamsInputDTO = z.infer<typeof GetEstablishmentParamsDTO>;

@Injectable()
export class GetEstablishmentUseCase {
  constructor(
    @Inject(ESTABLISHMENT_READ_REPOSITORY)
    private readonly establishments: EstablishmentReadRepository,
  ) {}

  /**
   * Loads one establishment with the company root, the CNAE description and the
   * municipality it sits in.
   * @param input - CNPJ, with or without punctuation.
   * @returns The establishment detail.
   */
  async execute(input: GetEstablishmentParamsInputDTO): Promise<EstablishmentDetail> {
    const establishment = await this.establishments.findByCnpj(input.cnpj);
    if (!establishment) throw new NotFoundException(`Establishment ${input.cnpj} not found`);

    return establishment;
  }
}
