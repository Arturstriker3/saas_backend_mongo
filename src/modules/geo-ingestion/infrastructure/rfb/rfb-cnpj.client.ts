import { Injectable, Logger } from '@nestjs/common';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { loadEnv } from '../../../../common/config/env';
import type { CnaeInput, CompanyInput, EstablishmentInput } from '../../domain/establishment.types';
import { downloadTo, extractArchive, readLines } from '../archive/geo-zip.util';
import { joinQuotedLines, splitCsvLine } from '../csv/csv.util';
import { toCnaeInput, toCompanyInput, toEstablishmentInput } from './rfb-cnpj.mapper';

const RFB_CNPJ_HOST = 'https://arquivos.receitafederal.gov.br';

/** The Receita Federal publishes the open CNPJ files as a Nextcloud public share. */
export const RFB_CNPJ_WEBDAV_URL = `${RFB_CNPJ_HOST}/public.php/webdav`;

/** The source ships the establishments and the companies split in ten archives each. */
export const ESTABLISHMENT_PARTS = 10;
export const COMPANY_PARTS = 10;

const MONTH_DIRECTORY = /^(\d{4}-\d{2})$/;
const CNAE_FILE = /^cnaes\.zip$/i;
const ESTABLISHMENT_FILE = /^estabelecimentos(\d+)\.zip$/i;
const COMPANY_FILE = /^empresas(\d+)\.zip$/i;
/** RFB data files carry no extension: `K3241.K03200Y9.D61010.ESTABELE`. */
const DATA_ENTRY = /\.(estabele|cnaecsv|emprecsv)$/i;
const HREF = /<d:href>([^<]+)<\/d:href>/g;
const LATIN1 = 'latin1';

export interface RfbCnpjSourceSet {
  /** Publication month, as `YYYY-MM`. */
  reference: string;
  cnaeUrl: string;
  /** Establishment archives ordered by part number. */
  establishmentUrls: string[];
  /** Company archives ordered by part number. */
  companyUrls: string[];
}

interface ShareEntry {
  name: string;
  url: string;
}

/**
 * Reads the open CNPJ registry published monthly by the Receita Federal.
 * The listing is a WebDAV collection, not HTML: every request carries the share
 * token as the basic-auth user.
 *
 * A month folder becomes visible before every archive is uploaded, so discovery
 * refuses a month whose file set is incomplete.
 */
@Injectable()
export class RfbCnpjClient {
  private readonly logger = new Logger('RfbCnpjClient');

  async findLatest(): Promise<RfbCnpjSourceSet> {
    const reference = await this.findNewestReference();
    const entries = await this.list(`${RFB_CNPJ_WEBDAV_URL}/${reference}`);

    const cnae = entries.find((entry) => CNAE_FILE.test(entry.name));
    if (!cnae) throw new Error(`RFB ${reference} has no Cnaes.zip; the month is incomplete`);

    const establishmentUrls = this.collectParts(
      entries,
      ESTABLISHMENT_FILE,
      ESTABLISHMENT_PARTS,
      `${reference} estabelecimentos`,
    );
    const companyUrls = this.collectParts(
      entries,
      COMPANY_FILE,
      COMPANY_PARTS,
      `${reference} empresas`,
    );

    this.logger.log(
      `CNPJ reference ${reference}: ${establishmentUrls.length} establishment and ` +
        `${companyUrls.length} company archives`,
    );

    return { reference, cnaeUrl: cnae.url, establishmentUrls, companyUrls };
  }

  async *readCnaes(url: string, workDir: string): AsyncGenerator<CnaeInput> {
    for await (const record of joinQuotedLines(this.csvLines(url, workDir))) {
      if (record.trim() === '') continue;

      const cnae = this.mapRecord(url, record, toCnaeInput);
      if (cnae) yield cnae;
    }
  }

  async *readCompanies(url: string, workDir: string): AsyncGenerator<CompanyInput> {
    for await (const record of joinQuotedLines(this.csvLines(url, workDir))) {
      if (record.trim() === '') continue;

      const company = this.mapRecord(url, record, toCompanyInput);
      if (company) yield company;
    }
  }

  async *readEstablishments(url: string, workDir: string): AsyncGenerator<EstablishmentInput> {
    for await (const record of joinQuotedLines(this.csvLines(url, workDir))) {
      if (record.trim() === '') continue;

      const establishment = this.mapRecord(url, record, toEstablishmentInput);
      if (establishment) yield establishment;
    }
  }

  /** Turns a layout rejection into a message that shows the offending record. */
  private mapRecord<T>(
    url: string,
    record: string,
    mapper: (fields: string[]) => T | null,
  ): T | null {
    try {
      return mapper(splitCsvLine(record));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message} (${basename(url)}): "${record.slice(0, 140)}"`);
    }
  }

  /** Collects the numbered archives of one part kind, ordered by part number. */
  private collectParts(
    entries: ShareEntry[],
    pattern: RegExp,
    expected: number,
    label: string,
  ): string[] {
    const parts = entries
      .map((entry) => ({ index: partIndex(pattern, entry.name), url: entry.url }))
      .filter((part): part is { index: number; url: string } => part.index !== null)
      .sort((left, right) => left.index - right.index);

    if (parts.length !== expected) {
      throw new Error(
        `RFB ${label} has ${parts.length} archive(s), expected ${expected}; ` +
          'the month is incomplete',
      );
    }

    return parts.map((part) => part.url);
  }

  private async *csvLines(url: string, workDir: string): AsyncGenerator<string> {
    await mkdir(workDir, { recursive: true });

    try {
      const zipPath = join(workDir, 'source.zip');
      await downloadTo(url, zipPath, this.authHeaders());
      const dataPath = await this.extractSingleDataFile(zipPath, workDir, url);

      this.logger.log(`Reading ${basename(url)}`);
      yield* readLines(dataPath, LATIN1);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /** A part must carry exactly one data file; anything else is a layout change. */
  private async extractSingleDataFile(
    zipPath: string,
    workDir: string,
    url: string,
  ): Promise<string> {
    const paths = await extractArchive(zipPath, workDir, (name) => DATA_ENTRY.test(name));
    const [dataPath] = paths;

    if (paths.length !== 1 || !dataPath) {
      throw new Error(`The archive ${basename(url)} has ${paths.length} data file(s), expected 1`);
    }

    return dataPath;
  }

  private async findNewestReference(): Promise<string> {
    const references = new Set<string>();

    for (const entry of await this.list(RFB_CNPJ_WEBDAV_URL)) {
      const month = MONTH_DIRECTORY.exec(entry.name);
      if (month) references.add(month[1]);
    }

    const newest = [...references].sort().pop();
    if (!newest) throw new Error('RFB CNPJ has no published month directory');

    return newest;
  }

  /** Lists one collection of the share, one level deep. */
  private async list(url: string): Promise<ShareEntry[]> {
    const response = await fetch(url, {
      method: 'PROPFIND',
      headers: { ...this.authHeaders(), Depth: '1' },
    });

    if (response.status !== 207) {
      throw new Error(`RFB listing failed with status ${response.status}: ${url}`);
    }

    const xml = await response.text();
    const entries: ShareEntry[] = [];

    for (const match of xml.matchAll(HREF)) {
      const href = decodeURIComponent(match[1]);
      const name = href.split('/').filter(Boolean).pop();
      if (!name) continue;

      entries.push({ name, url: new URL(href, RFB_CNPJ_HOST).toString() });
    }

    return entries;
  }

  /** The share token is the WebDAV user; the password stays empty. */
  private authHeaders(): Record<string, string> {
    const token = loadEnv().RFB_CNPJ_SHARE_TOKEN;
    return { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` };
  }
}

function partIndex(pattern: RegExp, name: string): number | null {
  const match = pattern.exec(name);
  if (!match) return null;

  const index = Number.parseInt(match[1], 10);
  return Number.isNaN(index) ? null : index;
}
