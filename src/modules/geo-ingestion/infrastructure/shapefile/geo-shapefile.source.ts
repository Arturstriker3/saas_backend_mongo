import { Injectable, Logger } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { open as openShapefile, type ShapefileFeature } from 'shapefile';

const EXTRACTED_EXTENSIONS = ['.shp', '.dbf', '.shx', '.prj', '.cpg'];

@Injectable()
export class GeoShapefileSource {
  private readonly logger = new Logger('GeoShapefile');

  /**
   * Downloads a zipped shapefile, extracts it to disk and yields features one by one.
   * Nothing is buffered in memory, so a 700 MB archive is safe to process.
   * @param url - Public zip URL.
   * @param workDir - Directory used for the download and extraction, removed at the end.
   */
  async *read(url: string, workDir: string): AsyncGenerator<ShapefileFeature> {
    await mkdir(workDir, { recursive: true });

    try {
      const zipPath = join(workDir, 'source.zip');
      await this.download(url, zipPath);

      const shpPath = await this.extract(zipPath, workDir);
      this.logger.log(`Extracted ${basename(shpPath)}`);

      yield* this.readFeatures(shpPath);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private async download(url: string, target: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Shapefile download failed with status ${response.status}: ${url}`);
    }

    this.logger.log(`Downloading ${url}`);
    const body = Readable.fromWeb(response.body as unknown as NodeReadableStream);
    await pipeline(body, createWriteStream(target));
  }

  private extract(zipPath: string, targetDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      yauzl.open(zipPath, { lazyEntries: true }, (openError, zipFile) => {
        if (openError || !zipFile) {
          reject(openError ?? new Error('Could not open the shapefile archive'));
          return;
        }

        let shpPath: string | undefined;

        zipFile.on('error', reject);

        zipFile.on('end', () => {
          if (shpPath) resolve(shpPath);
          else reject(new Error('The archive does not contain a .shp file'));
        });

        zipFile.on('entry', (entry) => {
          const name = entry.fileName.toLowerCase();
          if (!EXTRACTED_EXTENSIONS.some((extension) => name.endsWith(extension))) {
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
              if (name.endsWith('.shp')) shpPath = target;
              zipFile.readEntry();
            });

            readStream.pipe(createWriteStream(target));
          });
        });

        zipFile.readEntry();
      });
    });
  }

  private async *readFeatures(shpPath: string): AsyncGenerator<ShapefileFeature> {
    // IBGE censo 2022 shapefiles ship a .cpg declaring UTF-8; the reader defaults to windows-1252.
    const source = await openShapefile(shpPath, undefined, { encoding: 'utf-8' });

    try {
      for (;;) {
        const result = await source.read();
        if (result.done) return;
        if (result.value?.geometry) yield result.value;
      }
    } finally {
      source.cancel();
    }
  }
}
