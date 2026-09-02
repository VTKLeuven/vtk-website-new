import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getImmichStorageReport } from '@vtk/gallery';
import { storageFeatureForKey } from '@/lib/storage-categories';
import { summarizeS3Objects } from '@/lib/storage-insights';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asset(id: string, size: number | string | null) {
  return { id, exifInfo: { fileSizeInByte: size } };
}

beforeEach(() => {
  vi.stubEnv('GALLERY_IMMICH_API_URL', 'http://immich.test/api');
  vi.stubEnv('GALLERY_IMMICH_API_KEY', 'test-key');
  vi.stubEnv('GALLERY_ALBUM_MARKER', '[gallery]');
  vi.stubEnv('GALLERY_FAKBAR_ALBUM_MARKER', '[fakbar]');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('S3 storage attribution', () => {
  it('groups every object by the feature-owned prefix without exposing file contents', () => {
    const report = summarizeS3Objects(
      [
        { key: 'bonnetjes/a.pdf', sizeBytes: 800 },
        { key: 'bonnetjes/b.jpg', sizeBytes: 200 },
        { key: 'avatars/member.jpg', sizeBytes: 300 },
        { key: 'unknown/data.bin', sizeBytes: 50 },
      ],
      'vtk',
    );

    expect(report).toMatchObject({ totalBytes: 1_350, objectCount: 4, largestObjectBytes: 800 });
    expect(report.features.map(({ id, bytes, objectCount }) => ({ id, bytes, objectCount }))).toEqual([
      { id: 'expenses', bytes: 1_000, objectCount: 2 },
      { id: 'avatars', bytes: 300, objectCount: 1 },
      { id: 'other', bytes: 50, objectCount: 1 },
    ]);
    expect(storageFeatureForKey('forms/form-1/upload.pdf').id).toBe('forms');
    expect(storageFeatureForKey('theokot/contracten/model.pdf').id).toBe('rental-contracts');
    expect(storageFeatureForKey('images/event.jpg', 'event-images').id).toBe('event-images');
  });
});

describe('Immich storage inventory', () => {
  it('paginates album assets, requests size metadata and deduplicates shared assets per gallery', async () => {
    const searchBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/server/storage')) {
        return json({ diskSizeRaw: 10_000, diskUseRaw: 4_000, diskAvailableRaw: 6_000, diskUsagePercentage: 40 });
      }
      if (url.endsWith('/server/statistics')) {
        return json({ photos: 4, videos: 1, usage: 1_500, usagePhotos: 1_000, usageVideos: 500 });
      }
      if (url.endsWith('/albums')) {
        return json([
          { id: 'a', albumName: 'Album A', description: '[gallery]', assetCount: 3 },
          { id: 'b', albumName: 'Album B', description: '[gallery]', assetCount: 2 },
          { id: 'f', albumName: 'Fakbar', description: '[fakbar]', assetCount: 1 },
        ]);
      }
      if (url.endsWith('/search/metadata')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        searchBodies.push(body);
        const albumId = (body.albumIds as string[])[0];
        if (albumId === 'a' && body.page === 1) {
          return json({ assets: { items: [asset('shared', 100), asset('a-only', '200')], nextPage: '2' } });
        }
        if (albumId === 'a') return json({ assets: { items: [asset('a-page-2', 300)], nextPage: null } });
        if (albumId === 'b') {
          return json({ assets: { items: [asset('shared', 100), asset('b-only', 400)], nextPage: null } });
        }
        return json({ assets: { items: [asset('f-only', 50)], nextPage: null } });
      }
      return json({ message: 'unexpected URL' }, 500);
    });

    const report = await getImmichStorageReport();

    expect(report.disk).toEqual({
      available: true,
      data: { totalBytes: 10_000, usedBytes: 4_000, availableBytes: 6_000, usagePercentage: 40 },
    });
    expect(report.library).toMatchObject({ available: true, data: { originalBytes: 1_500 } });
    expect(report.albums).toMatchObject({
      available: true,
      data: {
        failedAlbumCount: 0,
        totals: {
          main: { albumCount: 2, uniqueAssetCount: 4, originalBytes: 1_000 },
          fakbar: { albumCount: 1, uniqueAssetCount: 1, originalBytes: 50 },
        },
      },
    });
    expect(searchBodies.every((body) => body.withExif === true)).toBe(true);
    expect(searchBodies.some((body) => body.page === 2 && (body.albumIds as string[])[0] === 'a')).toBe(true);
  });

  it('keeps the other sections available when one Immich permission is missing', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/server/storage')) return json({ message: 'forbidden' }, 403);
      if (url.endsWith('/server/statistics')) return json({ photos: 0, videos: 0, usage: 0 });
      if (url.endsWith('/albums')) return json([]);
      return json({ message: 'unexpected URL' }, 500);
    });

    const report = await getImmichStorageReport();

    expect(report.disk).toEqual({ available: false, reason: 'forbidden' });
    expect(report.library.available).toBe(true);
    expect(report.albums.available).toBe(true);
  });
});
