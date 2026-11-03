import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ESTABLISHMENT_READ_REPOSITORY,
  type EstablishmentCursor,
  type EstablishmentReadRepository,
} from '../../domain/establishment-read.repository.interface';
import type { EstablishmentPage } from '../../domain/establishment-view.types';

const CURSOR = /^(\d{7}):([0-9A-Z]{12}\d{2})$/;

export const ListEstablishmentsDTO = z.object({
  municipality: z.string().regex(/^\d{7}$/, 'IBGE municipality code with 7 digits'),
  cnae: z
    .string()
    .regex(/^\d{3,7}$/, 'CNAE prefix: 3 digits (group), 5 (class) or 7 (subclass)')
    .optional(),
  cursor: z
    .string()
    .regex(CURSOR, 'Cursor must be "<cnae>:<cnpj>" from the previous page')
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListEstablishmentsInputDTO = z.infer<typeof ListEstablishmentsDTO>;

@Injectable()
export class ListEstablishmentsUseCase {
  constructor(
    @Inject(ESTABLISHMENT_READ_REPOSITORY)
    private readonly establishments: EstablishmentReadRepository,
  ) {}

  /**
   * Lists the active establishments of a municipality, optionally narrowed by a
   * CNAE prefix, one keyset page at a time.
   * @param input - Municipality, CNAE prefix, cursor and page size.
   * @returns The page and the cursor of the next one.
   */
  execute(input: ListEstablishmentsInputDTO): Promise<EstablishmentPage> {
    return this.establishments.list({
      municipalityCode: input.municipality,
      cnaeRange: toCnaeRange(input.cnae),
      cursor: parseCursor(input.cursor),
      limit: input.limit,
    });
  }
}

/**
 * Expands a CNAE prefix into the closed 7-digit range the index can seek:
 * `5611` becomes `5611000..5611999`.
 * @param prefix - CNAE group, class or subclass.
 * @returns The range, or undefined when no CNAE was given.
 */
function toCnaeRange(prefix?: string): { from: string; to: string } | undefined {
  if (!prefix) return undefined;

  return { from: prefix.padEnd(7, '0'), to: prefix.padEnd(7, '9') };
}

/**
 * Splits the `<cnae>:<cnpj>` cursor validated by the DTO.
 * @param cursor - Cursor from the previous page.
 * @returns The decoded cursor, or undefined on the first page.
 */
function parseCursor(cursor?: string): EstablishmentCursor | undefined {
  if (!cursor) return undefined;

  const [, cnae, cnpj] = CURSOR.exec(cursor) ?? [];
  if (!cnae || !cnpj) return undefined;

  return { cnae, cnpj };
}
