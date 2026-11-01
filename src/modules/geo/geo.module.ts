import { Module } from '@nestjs/common';
import { GeoDatabaseModule } from '../../common/database/geo/geo.module';
import { GetCoverageUseCase } from './application/use-cases/get-coverage.use-case';
import { GetRegionUseCase } from './application/use-cases/get-region.use-case';
import { ListRegionsUseCase } from './application/use-cases/list-regions.use-case';
import {
  COVERAGE_REPOSITORY,
  REGION_READ_REPOSITORY,
} from './domain/region-read.repository.interface';
import { CoverageRepositoryPostgis } from './infrastructure/coverage.repository.postgis';
import { RegionReadRepositoryPostgis } from './infrastructure/region-read.repository.postgis';
import { GeoController } from './presentation/rest/geo.controller';

@Module({
  imports: [GeoDatabaseModule],
  controllers: [GeoController],
  providers: [
    RegionReadRepositoryPostgis,
    { provide: REGION_READ_REPOSITORY, useExisting: RegionReadRepositoryPostgis },
    CoverageRepositoryPostgis,
    { provide: COVERAGE_REPOSITORY, useExisting: CoverageRepositoryPostgis },
    ListRegionsUseCase,
    GetRegionUseCase,
    GetCoverageUseCase,
  ],
})
export class GeoModule {}
