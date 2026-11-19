import "server-only";

import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { downloadImmichOriginal } from "@/lib/immich-gallery";
import type { AlbumZipEntry } from "@/lib/media-album-zip";

/**
 * Eén origineel voor een gestreamde zip (`streamZip` in `@vtk/storage`), gedeeld
 * door de zip van het beheer en die van een privélink.
 *
 * Een Immich die even hapert (NFS, ML bezig) krijgt één tweede kans per bestand.
 * Lukt ook die niet, dan gooit dit, en breekt de download af in plaats van een
 * zip te leveren waar stilletjes foto's ontbreken: de browser meldt een
 * mislukte download en de fout staat in de log.
 */
export async function openZipOriginal(entry: AlbumZipEntry): Promise<Readable> {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await downloadImmichOriginal(entry.assetId);
      if (!response.body) throw new Error("Immich gaf geen inhoud terug.");
      return Readable.fromWeb(response.body as unknown as NodeReadableStream);
    } catch (error) {
      failure = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  console.error("Media library: album zip stopped, original could not be opened", entry.assetId, failure);
  throw failure;
}
