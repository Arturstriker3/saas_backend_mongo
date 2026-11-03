import { Module } from '@nestjs/common';
import { GeoDatabaseModule } from '../../common/database/geo/geo.module';
import { GetCompanyUseCase } from './application/use-cases/get-company.use-case';
import { GetCoverageUseCase } from './application/use-cases/get-coverage.use-case';
import { GetEstablishmentUseCase } from './application/use-cases/get-establishment.use-case';
import { GetRegionUseCase } from './application/use-cases/get-region.use-case';
import { ListEstablishmentsUseCase } from './application/use-cases/list-establishments.use-case';
import { ListRegionsUseCase } from './application/use-cases/list-regions.use-case';
import { SearchEstablishmentsUseCase } from './application/use-cases/search-establishments.use-case';
import {
  GetMunicipalityEmploymentUseCase,
  GetMunicipalityStatisticsUseCase,
  GetUfStatisticsUseCase,
} from './application/use-cases/get-statistics.use-case';
import { ESTABLISHMENT_READ_REPOSITORY } from './domain/establishment-read.repository.interface';
import { STATISTICS_READ_REPOSITORY } from './domain/statistics-read.repository.interface';
import {
  COVERAGE_REPOSITORY,
  REGION_READ_REPOSITORY,
} from './domain/region-read.repository.interface';
import { CoverageRepositoryPostgis } from './infrastructure/coverage.repository.postgis';
import { EstablishmentReadRepositoryPostgis } from './infrastructure/establishment-read.repository.postgis';
import { RegionReadRepositoryPostgis } from './infrastructure/region-read.repository.postgis';
import { StatisticsRepositoryPostgis } from './infrastructure/statistics.repository.postgis';
import { GeoController } from './presentation/rest/geo.controller';

@Module({
  imports: [GeoDatabaseModule],
  controllers: [GeoController],
  providers: [
    RegionReadRepositoryPostgis,
    { provide: REGION_READ_REPOSITORY, useExisting: RegionReadRepositoryPostgis },
    CoverageRepositoryPostgis,
    { provide: COVERAGE_REPOSITORY, useExisting: CoverageRepositoryPostgis },
    EstablishmentReadRepositoryPostgis,
    { provide: ESTABLISHMENT_READ_REPOSITORY, useExisting: EstablishmentReadRepositoryPostgis },
    StatisticsRepositoryPostgis,
    { provide: STATISTICS_READ_REPOSITORY, useExisting: StatisticsRepositoryPostgis },
    ListRegionsUseCase,
    GetRegionUseCase,
    GetCoverageUseCase,
    ListEstablishmentsUseCase,
    SearchEstablishmentsUseCase,
    GetEstablishmentUseCase,
    GetCompanyUseCase,
    GetMunicipalityStatisticsUseCase,
    GetUfStatisticsUseCase,
    GetMunicipalityEmploymentUseCase,
  ],
})
export class GeoModule {}
