import { createReadStream, createWriteStream } from 'node:fs';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';

/**
 * Streams a URL to a local file. Never buffers the body in memory.
 * @param url - Public file URL.
 * @param target - Destination path.
 */
export async function downloadTo(url: string, target: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with status ${response.status}: ${url}`);
  }

  const body = Readable.fromWeb(response.body as unknown as NodeReadableStream);
  await pipeline(body, createWriteStream(target));
}

/**
 * Extracts the entries with the wanted extensions into a directory.
 * @param zipPath - Local archive path.
 * @param targetDir - Directory that receives the files.
 * @param extensions - Lowercase extensions to extract, e.g. `['.csv']`.
 * @returns Paths of the extracted files.
 */
export function extractArchive(
  zipPath: string,
  targetDir: string,
  extensions: string[],
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
        else reject(new Error(`The archive has no ${extensions.join('/')} entry`));
      });

      zipFile.on('entry', (entry) => {
        const name = entry.fileName.toLowerCase();
        if (!extensions.some((extension) => name.endsWith(extension))) {
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

/** Reads a local file line by line without loading it into memory. */
export async function* readLines(path: string): AsyncGenerator<string> {
  const input = createReadStream(path, { encoding: 'utf8' });
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
