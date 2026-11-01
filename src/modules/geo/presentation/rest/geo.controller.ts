import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../../../common/http/access.decorator';
import { ZodValidationPipe } from '../../../../common/http/zod-validation.pipe';
import {
  GetRegionParamsDTO,
  GetRegionUseCase,
  type GetRegionParamsInputDTO,
} from '../../application/use-cases/get-region.use-case';
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

class RegionDetailResponseDTO extends RegionSummaryResponseDTO {
  @ApiProperty({ example: 0 })
  childrenCount!: number;

  @ApiProperty({ type: Object, description: 'GeoJSON MultiPolygon' })
  geometry!: unknown;

  @ApiProperty({ type: RegionDatasetEvidenceDTO, nullable: true })
  dataset!: RegionDatasetEvidenceDTO | null;
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

@ApiTags('Geo')
@Controller('geo')
export class GeoController {
  constructor(
    @Inject(ListRegionsUseCase) private readonly listRegions: ListRegionsUseCase,
    @Inject(GetRegionUseCase) private readonly getRegion: GetRegionUseCase,
    @Inject(GetCoverageUseCase) private readonly getCoverage: GetCoverageUseCase,
  ) {}

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
