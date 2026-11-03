import { Inject, Injectable, Logger } from '@nestjs/common';
import { toSearchName } from '../../../../common/text/search-name';
import type { DatasetAdapter } from '../../domain/dataset-adapter.interface';
import {
  LOCALITY_PUBLISHER,
  type LocalityPublisher,
} from '../../domain/locality-publisher.interface';
import type { LocalityInput } from '../../domain/locality.types';
import { checksumOf } from '../geojson/fingerprint';
import { IbgeMalhaClient } from '../ibge/ibge-malha.client';

const EXPECTED_STATES = 27;
const MIN_MUNICIPALITIES = 5_500;
const MAX_MUNICIPALITIES = 5_800;
const SOURCE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades';
const METHODOLOGY =
  'IBGE API de Localidades — registro oficial de códigos e nomes de estados e municípios';

/**
 * Publishes the official code registry the IBGE serves through its localities
 * API. It is the reference for comparing what exists with what the malha can
 * serve: `geo.locality_gap` shows both sides.
 */
@Injectable()
export class IbgeLocalidadesAdapter implements DatasetAdapter {
  readonly datasetKey = 'ibge_localidades';
  /** The API always serves the current registry, with no vintage to discover. */
  readonly defaultReference = 'current';
  private readonly logger = new Logger('IbgeLocalidadesAdapter');

  constructor(
    private readonly client: IbgeMalhaClient,
    @Inject(LOCALITY_PUBLISHER) private readonly publisher: LocalityPublisher,
  ) {}

  async ingest(reference: string): Promise<void> {
    const [states, municipalities] = await Promise.all([
      this.client.fetchStates(),
      this.client.fetchMunicipalities(),
    ]);
    this.assertTotals(states.length, municipalities.length);

    const localities = buildLocalities(states, municipalities);
    this.assertEveryMunicipalityHasState(localities);

    const checksum = checksumOf(
      localities.map((locality) => `${locality.level}:${locality.ibgeCode}:${locality.name}`),
    );

    const result = await this.publisher.publish({
      datasetKey: this.datasetKey,
      reference,
      methodology: METHODOLOGY,
      sourceUrl: SOURCE_URL,
      extractedAt: new Date(),
      checksum,
      localities,
    });

    this.logger.log(
      `Published ${this.datasetKey} ${reference}: ${result.inserted} added, ` +
        `${result.updated} updated (${states.length} states, ${municipalities.length} municipalities)`,
    );
  }

  private assertTotals(stateCount: number, municipalityCount: number): void {
    if (stateCount !== EXPECTED_STATES) {
      throw new Error(`Expected ${EXPECTED_STATES} states, received ${stateCount}`);
    }

    if (municipalityCount < MIN_MUNICIPALITIES || municipalityCount > MAX_MUNICIPALITIES) {
      throw new Error(
        `Municipality count ${municipalityCount} is outside ${MIN_MUNICIPALITIES}-${MAX_MUNICIPALITIES}`,
      );
    }
  }

  private assertEveryMunicipalityHasState(localities: LocalityInput[]): void {
    const orphans = localities.filter(
      (locality) => locality.level === 'municipality' && locality.ufSigla === '',
    );
    if (orphans.length > 0) {
      throw new Error(`${orphans.length} municipality(ies) have no known state`);
    }
  }
}

function buildLocalities(
  states: { id: number; sigla: string; nome: string }[],
  municipalities: { id: number; nome: string; ufId: number }[],
): LocalityInput[] {
  const siglaByState = new Map(states.map((state) => [state.id, state.sigla]));

  const stateRows: LocalityInput[] = states.map((state) => ({
    level: 'state',
    ibgeCode: String(state.id),
    name: state.nome,
    searchName: toSearchName(state.nome),
    ufCode: String(state.id),
    ufSigla: state.sigla,
  }));

  const municipalityRows: LocalityInput[] = municipalities.map((municipality) => ({
    level: 'municipality',
    ibgeCode: String(municipality.id),
    name: municipality.nome,
    searchName: toSearchName(municipality.nome),
    ufCode: String(municipality.ufId),
    ufSigla: siglaByState.get(municipality.ufId) ?? '',
  }));

  return [...stateRows, ...municipalityRows];
}
