import { Injectable } from '@nestjs/common';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInput } from '../../domain/address.types';
import { downloadTo, extractArchive, readLines } from '../archive/geo-zip.util';
import { splitCsvLine } from '../csv/csv.util';
import { CNEFE_HEADER, isExpectedHeader, toAddressRecord } from './cnefe.mapper';

export const CNEFE_SOURCE_URL =
  'https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/' +
  'Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF';

const BASE_URL = CNEFE_SOURCE_URL;

export interface CnefeUf {
  code: string;
  sigla: string;
}

/** Every state file the CNEFE publishes, in the archive's numeric order. */
export const CNEFE_UFS: CnefeUf[] = [
  { code: '11', sigla: 'RO' },
  { code: '12', sigla: 'AC' },
  { code: '13', sigla: 'AM' },
  { code: '14', sigla: 'RR' },
  { code: '15', sigla: 'PA' },
  { code: '16', sigla: 'AP' },
  { code: '17', sigla: 'TO' },
  { code: '21', sigla: 'MA' },
  { code: '22', sigla: 'PI' },
  { code: '23', sigla: 'CE' },
  { code: '24', sigla: 'RN' },
  { code: '25', sigla: 'PB' },
  { code: '26', sigla: 'PE' },
  { code: '27', sigla: 'AL' },
  { code: '28', sigla: 'SE' },
  { code: '29', sigla: 'BA' },
  { code: '31', sigla: 'MG' },
  { code: '32', sigla: 'ES' },
  { code: '33', sigla: 'RJ' },
  { code: '35', sigla: 'SP' },
  { code: '41', sigla: 'PR' },
  { code: '42', sigla: 'SC' },
  { code: '43', sigla: 'RS' },
  { code: '50', sigla: 'MS' },
  { code: '51', sigla: 'MT' },
  { code: '52', sigla: 'GO' },
  { code: '53', sigla: 'DF' },
];

@Injectable()
export class CnefeClient {
  /**
   * Downloads and extracts one state archive.
   * @param uf - State to download.
   * @param directory - Scratch directory for the archive and the CSV.
   * @returns Path of the extracted CSV.
   */
  async download(uf: CnefeUf, directory: string): Promise<string> {
    const file = `${uf.code}_${uf.sigla}`;
    const zipPath = join(directory, `${file}.zip`);
    const csvDirectory = join(directory, 'csv');

    await mkdir(csvDirectory, { recursive: true });
    await downloadTo(`${BASE_URL}/${file}.zip`, zipPath);

    const extracted = await extractArchive(zipPath, csvDirectory, (name) => name.endsWith('.csv'));
    await rm(zipPath, { force: true });

    const csvPath = extracted[0];
    if (!csvPath) throw new Error(`CNEFE ${uf.sigla}: archive has no CSV`);

    return csvPath;
  }

  /**
   * Streams the addresses of an extracted CSV, validating the header first.
   * @param csvPath - Extracted file.
   */
  async *readAddresses(csvPath: string): AsyncGenerator<AddressInput> {
    let headerChecked = false;

    for await (const line of readLines(csvPath, 'utf8')) {
      if (line.trim() === '') continue;

      // The IBGE publishes the CSV with a UTF-8 BOM.
      const fields = splitCsvLine(line.replace(/^\uFEFF/, ''));

      if (!headerChecked) {
        if (!isExpectedHeader(fields)) {
          throw new Error(
            `CNEFE layout changed: expected ${CNEFE_HEADER.length} columns, ` +
              `received "${line.slice(0, 120)}"`,
          );
        }
        headerChecked = true;
        continue;
      }

      const record = toAddressRecord(fields);
      if (record) yield record;
    }

    if (!headerChecked) throw new Error('CNEFE file has no header');
  }
}
