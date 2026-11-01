import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { SectorBasicsInput, SectorIncomeInput } from '../../domain/sector-indicator.types';
import { downloadTo, extractArchive, readLines } from '../archive/geo-zip.util';

const AGGREGATES_DIR =
  'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios/Agregados_por_Setor_csv';
const INCOME_DIR =
  'https://ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel';

const BASICS_FILE = /Agregados_por_setores_basico_BR(?:_(\d{8}))?\.zip$/;
const INCOME_FILE = /Agregados_por_setores_renda_responsavel_BR(?:_(\d{8}))?_csv\.zip$/;

const BASICS_COLUMNS = ['cd_setor', 'situacao', 'v0001', 'v0002', 'v0005', 'v0007'];
const INCOME_COLUMNS = ['cd_setor', 'v06001', 'v06004', 'v06006'];
const SECTOR_CODE = /^\d{15}$/;

export interface CensoSourceSet {
  /** Publication revision of the newest file pair, as `YYYY-MM-DD`. */
  reference: string;
  basicsUrl: string;
  incomeUrl: string;
}

interface SourceFile {
  url: string;
  reference: string;
}

/**
 * Reads the Censo 2022 aggregates published per census tract on the IBGE FTP.
 * The directory keeps only the current revision, so the newest file is the source of truth.
 */
@Injectable()
export class IbgeCensoClient {
  private readonly logger = new Logger('IbgeCensoClient');

  async findLatest(): Promise<CensoSourceSet> {
    const [basics, income] = await Promise.all([
      this.findNewestFile(AGGREGATES_DIR, BASICS_FILE),
      this.findNewestFile(INCOME_DIR, INCOME_FILE),
    ]);

    const reference = basics.reference >= income.reference ? basics.reference : income.reference;

    this.logger.log(
      `Censo revision ${reference}: ${basename(basics.url)} + ${basename(income.url)}`,
    );

    return { reference, basicsUrl: basics.url, incomeUrl: income.url };
  }

  async *readBasics(url: string, workDir: string): AsyncGenerator<SectorBasicsInput> {
    let columns: Record<string, number> | null = null;

    for await (const line of this.archiveLines(url, workDir)) {
      const fields = splitCsvLine(line);
      if (!columns) {
        columns = mapColumns(fields, BASICS_COLUMNS, 'basico');
        continue;
      }

      const sectorCode = fields[columns.cd_setor];
      if (!sectorCode) continue;
      assertSectorCode(sectorCode, 'basico');

      yield {
        sectorCode,
        population: toNumber(fields[columns.v0001]),
        households: toNumber(fields[columns.v0002]),
        averageHouseholdSize: toNumber(fields[columns.v0005]),
        occupiedHouseholds: toNumber(fields[columns.v0007]),
        urban: toBoolean(fields[columns.situacao]),
      };
    }
  }

  async *readIncome(url: string, workDir: string): AsyncGenerator<SectorIncomeInput> {
    let columns: Record<string, number> | null = null;

    for await (const line of this.archiveLines(url, workDir)) {
      const fields = splitCsvLine(line);
      if (!columns) {
        columns = mapColumns(fields, INCOME_COLUMNS, 'renda');
        continue;
      }

      const sectorCode = fields[columns.cd_setor];
      if (!sectorCode) continue;
      assertSectorCode(sectorCode, 'renda');

      yield {
        sectorCode,
        responsiblePersons: toNumber(fields[columns.v06001]),
        averageIncome: toNumber(fields[columns.v06004]),
        medianIncome: toNumber(fields[columns.v06006]),
      };
    }
  }

  private async *archiveLines(url: string, workDir: string): AsyncGenerator<string> {
    await mkdir(workDir, { recursive: true });

    try {
      const zipPath = join(workDir, 'source.zip');
      await downloadTo(url, zipPath);
      const [csvPath] = await extractArchive(zipPath, workDir, ['.csv']);
      if (!csvPath) throw new Error(`The archive has no csv: ${url}`);

      this.logger.log(`Reading ${basename(csvPath)}`);
      yield* readLines(csvPath);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async findNewestFile(directory: string, pattern: RegExp): Promise<SourceFile> {
    const response = await fetch(directory);
    if (!response.ok) {
      throw new Error(
        `Censo directory listing failed with status ${response.status}: ${directory}`,
      );
    }

    const html = await response.text();
    const files: SourceFile[] = [];

    for (const match of html.matchAll(/href="([^"]+)"/g)) {
      const name = match[1].split('/').pop() ?? '';
      const found = pattern.exec(name);
      if (!found) continue;

      files.push({ url: `${directory}/${name}`, reference: toReference(found[1]) });
    }

    const newest = files.sort((left, right) => right.reference.localeCompare(left.reference))[0];
    if (!newest) throw new Error(`No file matching ${pattern} in ${directory}`);

    return newest;
  }
}

function basename(url: string): string {
  return url.split('/').pop() ?? url;
}

function toReference(date: string | undefined): string {
  if (!date || date.length !== 8) return '2022';
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function mapColumns(header: string[], required: string[], label: string): Record<string, number> {
  const columns: Record<string, number> = {};
  header.forEach((name, index) => {
    columns[name.trim().toLowerCase()] = index;
  });

  const missing = required.filter((name) => columns[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`Censo ${label} layout changed; missing column(s): ${missing.join(', ')}`);
  }

  return columns;
}

/** Splits an IBGE CSV line, honouring quoted fields and escaped quotes. */
function splitCsvLine(line: string, delimiter = ';'): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (character === delimiter && !quoted) {
      fields.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  fields.push(current);
  return fields;
}

/** IBGE mixes decimals separated by comma and by dot across these files. */
function toNumber(raw: string | undefined): number | null {
  const value = (raw ?? '').trim();
  if (value === '' || value === '.') return null;

  const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(raw: string | undefined): boolean | null {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'urbana') return true;
  if (value === 'rural') return false;
  return null;
}

/** Guards against layout drift that would otherwise leak header text into the data. */
function assertSectorCode(sectorCode: string, label: string): void {
  if (!SECTOR_CODE.test(sectorCode)) {
    throw new Error(`Censo ${label} has an unexpected sector code: "${sectorCode}"`);
  }
}
