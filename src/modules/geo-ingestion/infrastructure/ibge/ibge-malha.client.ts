import { Injectable, Logger } from '@nestjs/common';
import type { GeoJsonGeometry } from './ibge-malha.mapper';

const IBGE_BASE_URL = 'https://servicodados.ibge.gov.br';
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

export interface IbgeState {
  id: number;
  sigla: string;
  nome: string;
}

export interface IbgeMunicipality {
  id: number;
  nome: string;
  ufId: number;
}

export interface IbgeAreaShape {
  code: string;
  geometry: GeoJsonGeometry;
}

interface IbgeFeature {
  properties: { codarea?: string };
  geometry: GeoJsonGeometry | null;
}

interface IbgeFeatureCollection {
  features?: IbgeFeature[];
}

interface IbgeStatePayload {
  id: number;
  sigla: string;
  nome: string;
}

interface IbgeMunicipalityPayload {
  id: number;
  nome: string;
  microrregiao?: { mesorregiao?: { UF?: { id?: number } } };
  'regiao-imediata'?: { 'regiao-intermediaria'?: { UF?: { id?: number } } };
}

@Injectable()
export class IbgeMalhaClient {
  private readonly logger = new Logger('IbgeMalhaClient');

  async fetchStates(): Promise<IbgeState[]> {
    const payload = await this.getJson<IbgeStatePayload[]>(
      `${IBGE_BASE_URL}/api/v1/localidades/estados?orderBy=nome`,
    );

    return payload.map((state) => ({ id: state.id, sigla: state.sigla, nome: state.nome }));
  }

  async fetchMunicipalities(): Promise<IbgeMunicipality[]> {
    const payload = await this.getJson<IbgeMunicipalityPayload[]>(
      `${IBGE_BASE_URL}/api/v1/localidades/municipios?orderBy=nome`,
    );

    return payload.map((municipality) => ({
      id: municipality.id,
      nome: municipality.nome,
      ufId: this.resolveUfId(municipality),
    }));
  }

  async fetchStateShape(ufId: number): Promise<IbgeAreaShape> {
    const shapes = await this.fetchShapes(`${IBGE_BASE_URL}/api/v3/malhas/estados/${ufId}`);

    const shape = shapes[0];
    if (!shape) throw new Error(`IBGE returned no shape for state ${ufId}`);

    return shape;
  }

  async fetchMunicipalityShapes(ufId: number): Promise<IbgeAreaShape[]> {
    return this.fetchShapes(
      `${IBGE_BASE_URL}/api/v3/malhas/estados/${ufId}/?intrarregiao=municipio`,
    );
  }

  private resolveUfId(municipality: IbgeMunicipalityPayload): number {
    const ufId =
      municipality.microrregiao?.mesorregiao?.UF?.id ??
      municipality['regiao-imediata']?.['regiao-intermediaria']?.UF?.id;

    if (!ufId) throw new Error(`Municipality ${municipality.id} has no parent state`);

    return ufId;
  }

  private async fetchShapes(url: string): Promise<IbgeAreaShape[]> {
    const query = 'formato=application/vnd.geo+json&qualidade=intermediaria';
    const payload = await this.getJson<IbgeFeatureCollection>(
      url.includes('?') ? `${url}&${query}` : `${url}?${query}`,
    );

    return (payload.features ?? []).map((feature) => {
      const code = feature.properties?.codarea;
      if (!code) throw new Error(`IBGE returned a shape without codarea at ${url}`);
      if (!feature.geometry) throw new Error(`IBGE returned a shape without geometry for ${code}`);

      return { code, geometry: feature.geometry };
    });
  }

  private async getJson<T>(url: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) {
          throw new Error(`IBGE request failed with status ${response.status}: ${url}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Attempt ${attempt}/${MAX_ATTEMPTS} failed for ${url}`);
        if (attempt < MAX_ATTEMPTS) await sleep(1_000 * attempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`IBGE request failed: ${url}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
