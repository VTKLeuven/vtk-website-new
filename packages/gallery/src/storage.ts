import { galleryMarker, immichConfig, type GalleryId } from './config';
import { GalleryError, immichJson } from './immich';
import type { ImmichAlbumSummary, ImmichAsset, ImmichSearchResponse } from './types';

export type ImmichAlbumKind = GalleryId | 'ambiguous' | 'private';

export type ImmichSourceFailure = 'not-configured' | 'forbidden' | 'unavailable';

export type ImmichSource<T> =
  | { available: true; data: T }
  | { available: false; reason: ImmichSourceFailure };

export type ImmichDiskUsage = {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercentage: number;
};

export type ImmichLibraryUsage = {
  photos: number;
  videos: number;
  originalBytes: number;
  photoBytes: number;
  videoBytes: number;
};

export type ImmichAlbumUsage = {
  title: string;
  kind: ImmichAlbumKind;
  assetCount: number;
  measuredAssetCount: number;
  originalBytes: number | null;
  unknownSizeCount: number;
};

export type ImmichGalleryUsage = {
  albumCount: number;
  uniqueAssetCount: number;
  originalBytes: number;
  unknownSizeCount: number;
};

export type ImmichStorageReport = {
  configured: boolean;
  disk: ImmichSource<ImmichDiskUsage>;
  library: ImmichSource<ImmichLibraryUsage>;
  albums: ImmichSource<{
    items: ImmichAlbumUsage[];
    failedAlbumCount: number;
    totals: Record<ImmichAlbumKind, ImmichGalleryUsage>;
  }>;
};

type RawDiskUsage = {
  diskAvailableRaw?: number | string | null;
  diskSizeRaw?: number | string | null;
  diskUseRaw?: number | string | null;
  diskUsagePercentage?: number | string | null;
};

type RawLibraryUsage = {
  photos?: number | string | null;
  videos?: number | string | null;
  usage?: number | string | null;
  usagePhotos?: number | string | null;
  usageVideos?: number | string | null;
};

type AlbumMeasurement = {
  item: ImmichAlbumUsage;
  assets: Map<string, number | null>;
};

const EMPTY_GALLERY_USAGE: ImmichGalleryUsage = {
  albumCount: 0,
  uniqueAssetCount: 0,
  originalBytes: 0,
  unknownSizeCount: 0,
};

function finiteNumber(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function optionalBytes(value: unknown): number | null {
  if (value == null) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function sourceFailure(error: unknown): ImmichSourceFailure {
  if (error instanceof GalleryError) {
    if (error.code === 'immich_api_key_missing') return 'not-configured';
    if (error.status === 401 || error.status === 403) return 'forbidden';
  }
  return 'unavailable';
}

export function classifyImmichAlbum(description: string | null | undefined): ImmichAlbumKind {
  const text = String(description || '');
  const mainMarker = galleryMarker('main');
  const fakbarMarker = galleryMarker('fakbar');
  const main = Boolean(mainMarker && text.includes(mainMarker));
  const fakbar = Boolean(fakbarMarker && text.includes(fakbarMarker));

  if (main && fakbar) return 'ambiguous';
  if (main) return 'main';
  if (fakbar) return 'fakbar';
  return 'private';
}

async function measureAlbum(summary: ImmichAlbumSummary): Promise<AlbumMeasurement> {
  const assets = new Map<string, number | null>();
  const seenPages = new Set<number>();
  let page: number | null = 1;

  while (page) {
    if (seenPages.has(page)) throw new Error('Immich album pagination loop detected');
    seenPages.add(page);

    const response: ImmichSearchResponse = await immichJson<ImmichSearchResponse>('/search/metadata', {
      method: 'POST',
      body: {
        albumIds: [summary.id],
        page,
        size: 1000,
        // Immich 3 houdt EXIF bewust uit grote zoekresultaten tenzij dit
        // expliciet gevraagd wordt. Daar staat de originele bestandsgrootte.
        withExif: true,
      },
    });

    for (const asset of response.assets?.items ?? []) {
      if (!asset.id) continue;
      const rawSize = asset.exifInfo?.fileSizeInByte;
      const size = optionalBytes(rawSize);
      const previous = assets.get(asset.id);
      if (previous === undefined || (previous === null && size !== null)) assets.set(asset.id, size);
    }

    const next: number = Number(response.assets?.nextPage);
    page = Number.isInteger(next) && next > 0 ? next : null;
  }

  const sizes = [...assets.values()];
  return {
    item: {
      title: summary.albumName?.trim() || 'Untitled album',
      kind: classifyImmichAlbum(summary.description),
      assetCount: finiteNumber(summary.assetCount ?? assets.size),
      measuredAssetCount: assets.size,
      originalBytes: sizes.reduce<number>((total, size) => total + (size ?? 0), 0),
      unknownSizeCount: sizes.filter((size) => size === null).length,
    },
    assets,
  };
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await callback(values[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, () => worker()),
  );
  return results;
}

async function getAlbumUsage(): Promise<{
  items: ImmichAlbumUsage[];
  failedAlbumCount: number;
  totals: Record<ImmichAlbumKind, ImmichGalleryUsage>;
}> {
  const summaries = await immichJson<ImmichAlbumSummary[]>('/albums');
  const settled = await mapWithConcurrency(summaries ?? [], 4, measureAlbum);
  const measurements: AlbumMeasurement[] = [];
  let failedAlbumCount = 0;

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      measurements.push(result.value);
      return;
    }

    failedAlbumCount += 1;
    const summary = summaries[index];
    measurements.push({
      item: {
        title: summary?.albumName?.trim() || 'Untitled album',
        kind: classifyImmichAlbum(summary?.description),
        assetCount: finiteNumber(summary?.assetCount),
        measuredAssetCount: 0,
        originalBytes: null,
        unknownSizeCount: 0,
      },
      assets: new Map(),
    });
  });

  const assetsByKind: Record<ImmichAlbumKind, Map<string, number | null>> = {
    main: new Map(),
    fakbar: new Map(),
    ambiguous: new Map(),
    private: new Map(),
  };
  const albumCounts: Record<ImmichAlbumKind, number> = {
    main: 0,
    fakbar: 0,
    ambiguous: 0,
    private: 0,
  };

  for (const measurement of measurements) {
    const kind = measurement.item.kind;
    albumCounts[kind] += 1;
    const target = assetsByKind[kind];
    for (const [id, size] of measurement.assets) {
      const previous = target.get(id);
      if (previous === undefined || (previous === null && size !== null)) target.set(id, size);
    }
  }

  const totals = Object.fromEntries(
    (Object.keys(assetsByKind) as ImmichAlbumKind[]).map((kind) => {
      const sizes = [...assetsByKind[kind].values()];
      return [
        kind,
        {
          ...EMPTY_GALLERY_USAGE,
          albumCount: albumCounts[kind],
          uniqueAssetCount: sizes.length,
          originalBytes: sizes.reduce<number>((total, size) => total + (size ?? 0), 0),
          unknownSizeCount: sizes.filter((size) => size === null).length,
        },
      ];
    }),
  ) as Record<ImmichAlbumKind, ImmichGalleryUsage>;

  return {
    items: measurements
      .map((measurement) => measurement.item)
      .sort((left, right) => {
        if (left.originalBytes === null) return 1;
        if (right.originalBytes === null) return -1;
        return right.originalBytes - left.originalBytes || left.title.localeCompare(right.title);
      }),
    failedAlbumCount,
    totals,
  };
}

export async function getImmichStorageReport(): Promise<ImmichStorageReport> {
  const configured = Boolean(immichConfig().apiKey);
  const [disk, library, albums] = await Promise.allSettled([
    immichJson<RawDiskUsage>('/server/storage'),
    immichJson<RawLibraryUsage>('/server/statistics'),
    getAlbumUsage(),
  ]);

  return {
    configured,
    disk:
      disk.status === 'fulfilled'
        ? {
            available: true,
            data: {
              totalBytes: finiteNumber(disk.value.diskSizeRaw),
              usedBytes: finiteNumber(disk.value.diskUseRaw),
              availableBytes: finiteNumber(disk.value.diskAvailableRaw),
              usagePercentage: finiteNumber(disk.value.diskUsagePercentage),
            },
          }
        : { available: false, reason: sourceFailure(disk.reason) },
    library:
      library.status === 'fulfilled'
        ? {
            available: true,
            data: {
              photos: finiteNumber(library.value.photos),
              videos: finiteNumber(library.value.videos),
              originalBytes: finiteNumber(library.value.usage),
              photoBytes: finiteNumber(library.value.usagePhotos),
              videoBytes: finiteNumber(library.value.usageVideos),
            },
          }
        : { available: false, reason: sourceFailure(library.reason) },
    albums:
      albums.status === 'fulfilled'
        ? { available: true, data: albums.value }
        : { available: false, reason: sourceFailure(albums.reason) },
  };
}
