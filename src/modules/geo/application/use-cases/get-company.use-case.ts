import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  ESTABLISHMENT_READ_REPOSITORY,
  type EstablishmentReadRepository,
} from '../../domain/establishment-read.repository.interface';
import type { CompanyProfile } from '../../domain/establishment-view.types';

const COMPANY_CODE = /^[0-9A-Z]{8}$/;

export const GetCompanyParamsDTO = z.object({
  cnpjBasico: z
    .string()
    .transform((value) => value.replace(/[^0-9A-Za-z]/g, '').toUpperCase())
    .refine((value) => COMPANY_CODE.test(value), 'CNPJ root must be 8 alphanumeric characters'),
});

export const GetCompanyQueryDTO = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type GetCompanyParamsInputDTO = z.infer<typeof GetCompanyParamsDTO>;
export type GetCompanyQueryInputDTO = z.infer<typeof GetCompanyQueryDTO>;

@Injectable()
export class GetCompanyUseCase {
  constructor(
    @Inject(ESTABLISHMENT_READ_REPOSITORY)
    private readonly establishments: EstablishmentReadRepository,
  ) {}

  /**
   * Loads the company root with its branches, headquarters first.
   * @param cnpjBasico - The 8-character company root.
   * @param page - Pagination for the branch list.
   * @returns The company profile.
   */
  async execute(cnpjBasico: string, page: GetCompanyQueryInputDTO): Promise<CompanyProfile> {
    const company = await this.establishments.findCompany(cnpjBasico, page.limit, page.offset);
    if (!company) throw new NotFoundException(`Company ${cnpjBasico} not found`);

    return company;
  }
}
