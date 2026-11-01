import { Inject, Injectable } from '@nestjs/common';
import {
  COVERAGE_REPOSITORY,
  type CoverageRepository,
} from '../../domain/region-read.repository.interface';
import type { CoverageEntry } from '../../domain/region-view.types';

@Injectable()
export class GetCoverageUseCase {
  constructor(@Inject(COVERAGE_REPOSITORY) private readonly coverage: CoverageRepository) {}

  execute(): Promise<CoverageEntry[]> {
    return this.coverage.listPublished();
  }
}
