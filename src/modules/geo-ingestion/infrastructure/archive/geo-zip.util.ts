import { createReadStream, createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

/** A dropped socket is expected on multi-gigabyte public downloads. */
const DOWNLOAD_ATTEMPTS = 4;
const RETRY_DELAY_MS = 10_000;

/**
 * Streams a URL to a local file, restarting from scratch when the connection drops.
 * Never buffers the body in memory.
 * @param url - File URL.
 * @param target - Destination path.
 * @param headers - Extra request headers, e.g. the WebDAV authorization.
 */
export async function downloadTo(
  url: string,
  target: string,
  headers: Record<string, string> = {},
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await downloadOnce(url, target, headers);
      return;
    } catch (error) {
      await rm(target, { force: true });
      if (attempt >= DOWNLOAD_ATTEMPTS) throw error;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

async function downloadOnce(
  url: string,
  target: string,
  headers: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, { headers });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with status ${response.status}: ${url}`);
  }

  const body = Readable.fromWeb(response.body as unknown as NodeReadableStream);
  await pipeline(body, createWriteStream(target));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts the entries accepted by the predicate into a directory.
 * @param zipPath - Local archive path.
 * @param targetDir - Directory that receives the files.
 * @param matches - Predicate over the entry name, e.g. `(name) => name.endsWith('.csv')`.
 * @returns Paths of the extracted files, in archive order.
 */
export function extractArchive(
  zipPath: string,
  targetDir: string,
  matches: (name: string) => boolean,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('Could not open the archive'));
        return;
      }

      const extracted: string[] = [];

      zipFile.on('error', reject);

      zipFile.on('end', () => {
        if (extracted.length > 0) resolve(extracted);
        else reject(new Error('The archive has no entry matching the expected layout'));
      });

      zipFile.on('entry', (entry) => {
        if (!matches(entry.fileName.toLowerCase())) {
          zipFile.readEntry();
          return;
        }

        const target = join(targetDir, basename(entry.fileName));
        zipFile.openReadStream(entry, (streamError, readStream) => {
          if (streamError || !readStream) {
            reject(streamError ?? new Error(`Could not read ${entry.fileName}`));
            return;
          }

          readStream.on('error', reject);
          readStream.on('end', () => {
            extracted.push(target);
            zipFile.readEntry();
          });

          readStream.pipe(createWriteStream(target));
        });
      });

      zipFile.readEntry();
    });
  });
}

/**
 * Reads a local file line by line without loading it into memory.
 * @param path - Local file path.
 * @param encoding - File encoding; the Receita Federal files are `latin1`.
 */
export async function* readLines(
  path: string,
  encoding: BufferEncoding = 'utf8',
): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding });
  let pending = '';

  for await (const piece of input) {
    pending += piece;
    let newline = pending.indexOf('\n');
    while (newline >= 0) {
      yield pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }

  if (pending.length > 0) yield pending.replace(/\r$/, '');
}
