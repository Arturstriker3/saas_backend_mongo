import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../../../common/http/access.decorator';
import { ZodValidationPipe } from '../../../../common/http/zod-validation.pipe';
import {
  GetRegionParamsDTO,
  GetRegionUseCase,
  type GetRegionParamsInputDTO,
} from '../../application/use-cases/get-region.use-case';
import {
  GetCompanyParamsDTO,
  GetCompanyQueryDTO,
  GetCompanyUseCase,
  type GetCompanyParamsInputDTO,
  type GetCompanyQueryInputDTO,
} from '../../application/use-cases/get-company.use-case';
import {
  GetMunicipalityEmploymentUseCase,
  GetMunicipalityStatisticsDTO,
  GetMunicipalityStatisticsUseCase,
  GetUfStatisticsDTO,
  GetUfStatisticsUseCase,
  StatisticsQueryDTO,
  type GetMunicipalityStatisticsInputDTO,
  type GetUfStatisticsInputDTO,
  type StatisticsQueryInputDTO,
} from '../../application/use-cases/get-statistics.use-case';
import {
  GetEstablishmentParamsDTO,
  GetEstablishmentUseCase,
  type GetEstablishmentParamsInputDTO,
} from '../../application/use-cases/get-establishment.use-case';
import {
  ListEstablishmentsDTO,
  ListEstablishmentsUseCase,
  type ListEstablishmentsInputDTO,
} from '../../application/use-cases/list-establishments.use-case';
import {
  SearchEstablishmentsDTO,
  SearchEstablishmentsUseCase,
  type SearchEstablishmentsInputDTO,
} from '../../application/use-cases/search-establishments.use-case';
import { GetCoverageUseCase } from '../../application/use-cases/get-coverage.use-case';
import {
  ListChildrenDTO,
  ListRegionsDTO,
  ListRegionsUseCase,
  type ListChildrenInputDTO,
  type ListRegionsInputDTO,
} from '../../application/use-cases/list-regions.use-case';

class RegionCentroidDTO {
  @ApiProperty({ example: -10.9111 })
  lat!: number;

  @ApiProperty({ example: -37.0717 })
  lng!: number;
}

class RegionSummaryResponseDTO {
  @ApiProperty({ example: '2800308' })
  ibgeCode!: string;

  @ApiProperty({ enum: ['state', 'municipality', 'district', 'neighborhood', 'sector'] })
  level!: string;

  @ApiProperty({ example: 'Aracaju' })
  name!: string;

  @ApiProperty({ example: '28', nullable: true })
  parentCode!: string | null;

  @ApiProperty({ example: 181.857, nullable: true })
  areaKm2!: number | null;

  @ApiProperty({ type: RegionCentroidDTO, nullable: true })
  centroid!: RegionCentroidDTO | null;
}

class RegionDatasetEvidenceDTO {
  @ApiProperty({ example: 'ibge_malha' })
  datasetKey!: string;

  @ApiProperty({ example: '2022' })
  reference!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;
}

class SectorIndicatorsDTO {
  @ApiProperty({ example: 928, nullable: true })
  population!: number | null;

  @ApiProperty({ example: 376, nullable: true })
  households!: number | null;

  @ApiProperty({ example: 336, nullable: true })
  occupiedHouseholds!: number | null;

  @ApiProperty({ example: 2.8, nullable: true })
  averageHouseholdSize!: number | null;

  @ApiProperty({ example: 2453.03, nullable: true })
  averageIncome!: number | null;

  @ApiProperty({ example: 1212, nullable: true })
  medianIncome!: number | null;

  @ApiProperty({ example: true, nullable: true })
  urban!: boolean | null;

  @ApiProperty({ type: RegionDatasetEvidenceDTO })
  dataset!: RegionDatasetEvidenceDTO;
}

class RegionDetailResponseDTO extends RegionSummaryResponseDTO {
  @ApiProperty({ example: 0 })
  childrenCount!: number;

  @ApiProperty({ type: Object, description: 'GeoJSON MultiPolygon' })
  geometry!: unknown;

  @ApiProperty({ type: RegionDatasetEvidenceDTO, nullable: true })
  dataset!: RegionDatasetEvidenceDTO | null;

  @ApiProperty({ type: SectorIndicatorsDTO, nullable: true })
  indicators!: SectorIndicatorsDTO | null;
}

class CoverageResponseDTO {
  @ApiProperty({ example: 'ibge_malha' })
  datasetKey!: string;

  @ApiProperty({ example: '2022' })
  reference!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  publishedAt!: Date | null;

  @ApiProperty()
  methodology!: string;

  @ApiProperty()
  sourceUrl!: string;

  @ApiProperty({ example: 5603 })
  rowCount!: number;

  @ApiProperty({ nullable: true })
  license!: string | null;

  @ApiProperty({ example: true })
  redistributionAllowed!: boolean;

  @ApiProperty({ nullable: true })
  attributionText!: string | null;

  @ApiProperty({ example: 400, nullable: true })
  slaDays!: number | null;

  @ApiProperty({ example: false })
  isStale!: boolean;
}

class CnaeResponseDTO {
  @ApiProperty({ example: '5611201', nullable: true })
  code!: string | null;

  @ApiProperty({ example: 'Restaurantes e similares', nullable: true })
  description!: string | null;
}

class EstablishmentAddressResponseDTO {
  @ApiProperty({ example: 'RUA', nullable: true })
  streetType!: string | null;

  @ApiProperty({ example: 'AUGUSTA', nullable: true })
  street!: string | null;

  @ApiProperty({ example: '2000', nullable: true })
  number!: string | null;

  @ApiProperty({ example: 'LOJA 3', nullable: true })
  complement!: string | null;

  @ApiProperty({ example: 'JARDIM PAULISTA', nullable: true })
  neighborhood!: string | null;

  @ApiProperty({ example: '01304000', nullable: true })
  cep!: string | null;
}

class EstablishmentLocationResponseDTO {
  @ApiProperty({ example: '3550308', nullable: true })
  municipalityCode!: string | null;

  @ApiProperty({ example: 'São Paulo', nullable: true })
  municipalityName!: string | null;

  @ApiProperty({ example: 'SP', nullable: true })
  uf!: string | null;
}

class EstablishmentSummaryResponseDTO {
  @ApiProperty({ example: '12345678000190' })
  cnpj!: string;

  @ApiProperty({ example: '12345678' })
  cnpjBasico!: string;

  @ApiProperty({ example: 'PADARIA DO ZE', nullable: true })
  tradeName!: string | null;

  @ApiProperty({ example: 'PADARIA DO ZE LTDA', nullable: true })
  legalName!: string | null;

  @ApiProperty({ example: true })
  isHeadquarters!: boolean;

  @ApiProperty({ example: 2, nullable: true })
  registrationStatus!: number | null;

  @ApiProperty({ example: 'Ativa', nullable: true })
  registrationStatusLabel!: string | null;

  @ApiProperty({ example: '2010-05-12', nullable: true })
  openedOn!: string | null;

  @ApiProperty({ type: CnaeResponseDTO })
  cnae!: CnaeResponseDTO;

  @ApiProperty({ type: EstablishmentAddressResponseDTO })
  address!: EstablishmentAddressResponseDTO;

  @ApiProperty({ type: EstablishmentLocationResponseDTO })
  location!: EstablishmentLocationResponseDTO;
}

class EstablishmentDetailResponseDTO extends EstablishmentSummaryResponseDTO {
  @ApiProperty({ type: RegionDatasetEvidenceDTO, nullable: true })
  dataset!: RegionDatasetEvidenceDTO | null;
}

class EstablishmentPageResponseDTO {
  @ApiProperty({ type: EstablishmentSummaryResponseDTO, isArray: true })
  items!: EstablishmentSummaryResponseDTO[];

  @ApiProperty({
    example: '5611201:12345678000190',
    nullable: true,
    description: 'Send as `cursor` to read the next page; null on the last page',
  })
  nextCursor!: string | null;
}

class CompanyResponseDTO {
  @ApiProperty({ example: '12345678' })
  cnpjBasico!: string;

  @ApiProperty({ example: 'PADARIA DO ZE LTDA' })
  legalName!: string;

  @ApiProperty({ example: '2062', nullable: true })
  legalNatureCode!: string | null;

  @ApiProperty({ example: '01', nullable: true })
  sizeCode!: string | null;

  @ApiProperty({ example: 5000, nullable: true })
  capitalSocial!: number | null;

  @ApiProperty({ example: 3 })
  establishmentCount!: number;

  @ApiProperty({ example: 2 })
  activeEstablishmentCount!: number;

  @ApiProperty({ type: EstablishmentSummaryResponseDTO, isArray: true })
  establishments!: EstablishmentSummaryResponseDTO[];

  @ApiProperty({ type: RegionDatasetEvidenceDTO, nullable: true })
  dataset!: RegionDatasetEvidenceDTO | null;
}

class CnaeRankResponseDTO {
  @ApiProperty({ example: '5611201' })
  code!: string;

  @ApiProperty({ example: 'Restaurantes e similares', nullable: true })
  description!: string | null;

  @ApiProperty({ example: 40545 })
  establishments!: number;

  @ApiProperty({
    example: 0.0161,
    description: 'Fraction of the active establishments of the scope',
  })
  share!: number;
}

class MunicipalityStatisticsResponseDTO {
  @ApiProperty({
    example: { code: '3550308', name: 'São Paulo', uf: 'SP', population: 11911337 },
  })
  municipality!: {
    code: string;
    name: string | null;
    uf: string | null;
    population: number | null;
  };

  @ApiProperty({ example: 2513555 })
  activeEstablishments!: number;

  @ApiProperty({ example: 1053, description: 'Distinct CNAEs with at least one establishment' })
  cnaeCount!: number;

  @ApiProperty({ type: CnaeRankResponseDTO, isArray: true })
  topCnaes!: CnaeRankResponseDTO[];
}

class UfStatisticsResponseDTO {
  @ApiProperty({ example: { code: '35', sigla: 'SP', name: 'São Paulo' } })
  uf!: { code: string; sigla: string | null; name: string | null };

  @ApiProperty({ example: 5880000 })
  activeEstablishments!: number;

  @ApiProperty({ example: 1200 })
  cnaeCount!: number;

  @ApiProperty({ type: CnaeRankResponseDTO, isArray: true })
  topCnaes!: CnaeRankResponseDTO[];
}

class EmploymentTotalsResponseDTO {
  @ApiProperty({ example: 300000 })
  companies!: number;

  @ApiProperty({ example: 4100000 })
  occupiedPersons!: number;

  @ApiProperty({ example: 3600000 })
  salariedPersons!: number;

  @ApiProperty({
    example: 14000000,
    description: 'Salaries and other remuneration, in thousands of reais',
  })
  salariesThousandBrl!: number;

  @ApiProperty({ example: 3240.5, nullable: true, description: 'In reais' })
  averageMonthlySalary!: number | null;
}

class CnaeDivisionEmploymentResponseDTO {
  @ApiProperty({ example: '47' })
  code!: string;

  @ApiProperty({ example: 'Comércio; reparação de veículos automotores e motocicletas' })
  name!: string;

  @ApiProperty({ example: 98000 })
  companies!: number;

  @ApiProperty({ example: 780000 })
  occupiedPersons!: number;

  @ApiProperty({ example: 690000 })
  salariedPersons!: number;

  @ApiProperty({ example: 2100000 })
  salariesThousandBrl!: number;

  @ApiProperty({
    example: 0.19,
    description: 'Fraction of the occupied persons of the municipality',
  })
  share!: number;
}

class MunicipalityEmploymentResponseDTO {
  @ApiProperty({ example: { code: '3550308', name: 'São Paulo', uf: 'SP' } })
  municipality!: { code: string; name: string | null; uf: string | null };

  @ApiProperty({ example: '2024', nullable: true })
  reference!: string | null;

  @ApiProperty({ type: EmploymentTotalsResponseDTO })
  totals!: EmploymentTotalsResponseDTO;

  @ApiProperty({ type: CnaeDivisionEmploymentResponseDTO, isArray: true })
  divisions!: CnaeDivisionEmploymentResponseDTO[];
}

@ApiTags('Geo')
@Controller('geo')
export class GeoController {
  constructor(
    @Inject(ListRegionsUseCase) private readonly listRegions: ListRegionsUseCase,
    @Inject(GetRegionUseCase) private readonly getRegion: GetRegionUseCase,
    @Inject(GetCoverageUseCase) private readonly getCoverage: GetCoverageUseCase,
    @Inject(ListEstablishmentsUseCase)
    private readonly listEstablishments: ListEstablishmentsUseCase,
    @Inject(SearchEstablishmentsUseCase)
    private readonly searchEstablishments: SearchEstablishmentsUseCase,
    @Inject(GetEstablishmentUseCase)
    private readonly getEstablishment: GetEstablishmentUseCase,
    @Inject(GetCompanyUseCase) private readonly getCompany: GetCompanyUseCase,
    @Inject(GetMunicipalityStatisticsUseCase)
    private readonly getMunicipalityStatistics: GetMunicipalityStatisticsUseCase,
    @Inject(GetUfStatisticsUseCase) private readonly getUfStatistics: GetUfStatisticsUseCase,
    @Inject(GetMunicipalityEmploymentUseCase)
    private readonly getMunicipalityEmployment: GetMunicipalityEmploymentUseCase,
  ) {}

  @Get('stats/municipalities/:code/employment')
  @Authenticated()
  @ApiOperation({ summary: 'Formal employment by CNAE division (CEMPRE) of a municipality' })
  @ApiQuery({ name: 'limit', required: false, description: 'How many divisions to rank (max 50)' })
  @ApiOkResponse({ type: MunicipalityEmploymentResponseDTO })
  async municipalityEmployment(
    @Param(new ZodValidationPipe(GetMunicipalityStatisticsDTO))
    params: GetMunicipalityStatisticsInputDTO,
    @Query(new ZodValidationPipe(StatisticsQueryDTO)) query: StatisticsQueryInputDTO,
  ) {
    return this.getMunicipalityEmployment.execute(params.code, query);
  }

  @Get('stats/municipalities/:code')
  @Authenticated()
  @ApiOperation({ summary: 'Active establishments and top CNAEs of a municipality' })
  @ApiQuery({ name: 'limit', required: false, description: 'How many CNAEs to rank (max 50)' })
  @ApiOkResponse({ type: MunicipalityStatisticsResponseDTO })
  async municipalityStatistics(
    @Param(new ZodValidationPipe(GetMunicipalityStatisticsDTO))
    params: GetMunicipalityStatisticsInputDTO,
    @Query(new ZodValidationPipe(StatisticsQueryDTO)) query: StatisticsQueryInputDTO,
  ) {
    return this.getMunicipalityStatistics.execute(params.code, query);
  }

  @Get('stats/ufs/:uf')
  @Authenticated()
  @ApiOperation({ summary: 'Active establishments and top CNAEs of a state' })
  @ApiQuery({ name: 'limit', required: false, description: 'How many CNAEs to rank (max 50)' })
  @ApiOkResponse({ type: UfStatisticsResponseDTO })
  async ufStatistics(
    @Param(new ZodValidationPipe(GetUfStatisticsDTO)) params: GetUfStatisticsInputDTO,
    @Query(new ZodValidationPipe(StatisticsQueryDTO)) query: StatisticsQueryInputDTO,
  ) {
    return this.getUfStatistics.execute(params.uf, query);
  }

  @Get('establishments')
  @Authenticated()
  @ApiOperation({ summary: 'List active establishments of a municipality, by CNAE prefix' })
  @ApiQuery({ name: 'municipality', required: true, description: 'IBGE municipality code' })
  @ApiQuery({ name: 'cnae', required: false, description: 'CNAE prefix: 3, 5 or 7 digits' })
  @ApiQuery({ name: 'cursor', required: false, description: 'nextCursor from the previous page' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: EstablishmentPageResponseDTO })
  async establishments(
    @Query(new ZodValidationPipe(ListEstablishmentsDTO)) query: ListEstablishmentsInputDTO,
  ) {
    return this.listEstablishments.execute(query);
  }

  @Get('establishments/search')
  @Authenticated()
  @ApiOperation({ summary: 'Search establishments by the company legal name' })
  @ApiQuery({ name: 'q', required: true, description: 'At least 3 characters' })
  @ApiQuery({ name: 'municipality', required: false, description: 'IBGE municipality code' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: EstablishmentSummaryResponseDTO, isArray: true })
  async search(
    @Query(new ZodValidationPipe(SearchEstablishmentsDTO)) query: SearchEstablishmentsInputDTO,
  ) {
    return this.searchEstablishments.execute(query);
  }

  @Get('establishments/:cnpj')
  @Authenticated()
  @ApiOperation({ summary: 'Establishment detail by CNPJ' })
  @ApiOkResponse({ type: EstablishmentDetailResponseDTO })
  async establishment(
    @Param(new ZodValidationPipe(GetEstablishmentParamsDTO)) params: GetEstablishmentParamsInputDTO,
  ) {
    return this.getEstablishment.execute(params);
  }

  @Get('companies/:cnpjBasico')
  @Authenticated()
  @ApiOperation({ summary: 'Company profile with its establishments, headquarters first' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiOkResponse({ type: CompanyResponseDTO })
  async company(
    @Param(new ZodValidationPipe(GetCompanyParamsDTO)) params: GetCompanyParamsInputDTO,
    @Query(new ZodValidationPipe(GetCompanyQueryDTO)) query: GetCompanyQueryInputDTO,
  ) {
    return this.getCompany.execute(params.cnpjBasico, query);
  }

  @Get('regions')
  @Authenticated()
  @ApiOperation({ summary: 'List regions by level, parent or name' })
  @ApiQuery({ name: 'level', required: false })
  @ApiQuery({ name: 'parent', required: false, description: 'IBGE code of the parent region' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiOkResponse({ type: RegionSummaryResponseDTO, isArray: true })
  async list(@Query(new ZodValidationPipe(ListRegionsDTO)) query: ListRegionsInputDTO) {
    return this.listRegions.execute(query);
  }

  @Get('regions/:code/children')
  @Authenticated()
  @ApiOperation({ summary: 'List the direct children of a region' })
  @ApiOkResponse({ type: RegionSummaryResponseDTO, isArray: true })
  async children(
    @Param(new ZodValidationPipe(GetRegionParamsDTO)) params: GetRegionParamsInputDTO,
    @Query(new ZodValidationPipe(ListChildrenDTO)) query: ListChildrenInputDTO,
  ) {
    return this.listRegions.execute({
      parent: params.code,
      level: query.level,
      limit: query.limit,
    });
  }

  @Get('regions/:code')
  @Authenticated()
  @ApiOperation({ summary: 'Region detail with geometry and source evidence' })
  @ApiOkResponse({ type: RegionDetailResponseDTO })
  async detail(@Param(new ZodValidationPipe(GetRegionParamsDTO)) params: GetRegionParamsInputDTO) {
    return this.getRegion.execute(params);
  }

  @Get('coverage')
  @Authenticated()
  @ApiOperation({ summary: 'Published datasets with reference, license and staleness' })
  @ApiOkResponse({ type: CoverageResponseDTO, isArray: true })
  async coverage() {
    return this.getCoverage.execute();
  }
}
