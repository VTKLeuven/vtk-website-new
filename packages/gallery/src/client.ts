import { foreignMarkers, galleryMarker, immichConfig, type GalleryId } from './config';
import {
  GalleryError,
  addImmichAssetsToAlbum,
  immichJson,
} from './immich';
import {
  assetDimensions,
  createSlugAllocator,
  dateValue,
  fileTitle,
  photoDate,
  sanitizeFilename,
  stripMarkers,
} from './format';
import type {
  AmbiguousAlbum,
  DownloadTarget,
  GalleryAlbum,
  GalleryAlbumSummary,
  ImmichAlbumSummary,
  ImmichAsset,
  ImmichSearchResponse,
  ImmichSharedLink,
} from './types';

type Snapshot = {
  generatedAt: string;
  albums: GalleryAlbum[];
  summaries: GalleryAlbumSummary[];
  bySlug: Map<string, GalleryAlbum>;
  ambiguous: AmbiguousAlbum[];
};

export type GalleryClient = {
  id: GalleryId;
  marker: () => string;
  listAlbums: () => Promise<{ generatedAt: string; albums: GalleryAlbumSummary[] }>;
  getAlbum: (slug: string) => Promise<GalleryAlbum | null>;
  getDownloadTarget: (slug: string, assetId: string) => Promise<DownloadTarget>;
  /** Albums die de merker van meer dan één galerij dragen; zie config.ts. */
  listAmbiguousAlbums: () => Promise<AmbiguousAlbum[]>;
  refreshSnapshot: () => Promise<void>;
  createAlbum: (input: { title: string; description?: string }) => Promise<{ id: string }>;
  addAssets: (albumId: string, assetIds: string[]) => Promise<unknown>;
};

/**
 * Bouwt de client voor één galerij.
 *
 * Elke client heeft een **eigen momentopname en eigen cache**. Dat is geen
 * detail: de vorige versie hield die op moduleniveau bij, en twee galerijen in
 * hetzelfde proces zouden dan elkaars albums serveren.
 *
 * `downloadPath` verschilt per app, want de downloadroute is app-relatief: de
 * hoofdsite draait op vtk.be, de fakbar-app op haar eigen host.
 */
export function createGalleryClient({
  id,
  downloadPath,
}: {
  id: GalleryId;
  downloadPath: (slug: string, assetId: string) => string;
}): GalleryClient {
  let cache: { snapshot: Snapshot; expiresAt: number } | null = null;
  let inflight: Promise<Snapshot> | null = null;

  async function listAlbumAssets(albumId: string, { size = 1000 } = {}): Promise<ImmichAsset[]> {
    const assets: ImmichAsset[] = [];
    const seenPages = new Set<string>();
    let page: number | string | null = 1;

    while (page) {
      const pageKey = String(page);
      if (seenPages.has(pageKey)) {
        throw new GalleryError(502, 'Immich album asset pagination loop detected.', 'immich_pagination_loop');
      }
      seenPages.add(pageKey);

      const result: ImmichSearchResponse = await immichJson<ImmichSearchResponse>('/search/metadata', {
        method: 'POST',
        body: { albumIds: [albumId], page, size },
      });
      assets.push(...(result?.assets?.items || []));
      page = result?.assets?.nextPage || null;
    }

    return assets;
  }

  async function getFullAlbum(albumId: string): Promise<ImmichAlbumSummary> {
    const album = await immichJson<ImmichAlbumSummary>(`/albums/${encodeURIComponent(albumId)}`);
    const assetCount = Number(album?.assetCount || 0);
    if (Array.isArray(album?.assets) || assetCount === 0) return album;
    return { ...album, assets: await listAlbumAssets(albumId) };
  }

  function findAlbumSharedLink(links: ImmichSharedLink[], albumId: string) {
    return links.find((link) => {
      if (link.type !== 'ALBUM') return false;
      return link.album?.id === albumId || link.albumId === albumId;
    });
  }

  /**
   * De publieke foto-URL's lopen via een gedeelde link van Immich, niet via de
   * API-sleutel. Bestaat die link nog niet, dan maken we ze aan; bestaat ze wel,
   * dan zetten we downloaden en metadata aan als dat nog niet zo stond.
   */
  async function ensureAlbumSharedLink(
    album: ImmichAlbumSummary,
    publicDescription: string,
  ): Promise<ImmichSharedLink> {
    const links = await immichJson<ImmichSharedLink[]>(`/shared-links?albumId=${encodeURIComponent(album.id)}`);
    const existing = findAlbumSharedLink(links || [], album.id);

    if (!existing) {
      return immichJson<ImmichSharedLink>('/shared-links', {
        method: 'POST',
        body: {
          type: 'ALBUM',
          albumId: album.id,
          allowDownload: true,
          showMetadata: true,
          description: publicDescription,
        },
      });
    }

    const patch: Record<string, unknown> = {};
    if (existing.allowDownload !== true) patch.allowDownload = true;
    if (existing.showMetadata !== true) patch.showMetadata = true;
    if ((existing.description || '') !== publicDescription) patch.description = publicDescription;
    if (Object.keys(patch).length === 0) return existing;

    return immichJson<ImmichSharedLink>(`/shared-links/${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      body: patch,
    });
  }

  function buildPhotoUrls(publicProxyUrl: string, shareKey: string, assetId: string) {
    const key = encodeURIComponent(shareKey);
    const assetKey = encodeURIComponent(assetId);
    return {
      thumbnail: `${publicProxyUrl}/share/photo/${key}/${assetKey}/thumbnail`,
      preview: `${publicProxyUrl}/share/photo/${key}/${assetKey}/preview`,
      original: `${publicProxyUrl}/share/photo/${key}/${assetKey}/original`,
    };
  }

  function mapAlbumDetail({
    album,
    slug,
    shareKey,
    markers,
    publicProxyUrl,
  }: {
    album: ImmichAlbumSummary;
    slug: string;
    shareKey: string;
    markers: string[];
    publicProxyUrl: string;
  }): GalleryAlbum {
    const description = stripMarkers(album.description || '', markers);
    const sortedAssets = [...(album.assets || [])]
      .filter((asset) => asset.type === 'IMAGE')
      .sort((left, right) => dateValue(photoDate(left)) - dateValue(photoDate(right)));
    const coverAsset =
      sortedAssets.find((asset) => asset.id === album.albumThumbnailAssetId) || sortedAssets[0] || null;

    const photos = sortedAssets.map((asset, index) => {
      const dimensions = assetDimensions(asset);
      const filename = sanitizeFilename(asset.originalFileName, `${slug}-${index + 1}.jpg`);
      const urls = buildPhotoUrls(publicProxyUrl, shareKey, asset.id);

      return {
        id: asset.id,
        title: fileTitle(filename),
        description: asset.exifInfo?.description || '',
        date: photoDate(asset),
        width: dimensions.width,
        height: dimensions.height,
        filename,
        mimeType: asset.originalMimeType || 'image/jpeg',
        thumbnailUrl: urls.thumbnail,
        previewUrl: urls.preview,
        originalUrl: urls.original,
        downloadUrl: downloadPath(slug, asset.id),
      };
    });

    const coverPhoto = coverAsset ? photos.find((photo) => photo.id === coverAsset.id) || photos[0] : null;
    const date = album.startDate || album.endDate || photos[0]?.date || null;
    const year = date ? new Date(date).getUTCFullYear() : null;

    return {
      id: album.id,
      slug,
      title: album.albumName || 'Naamloos album',
      description,
      date,
      year: Number.isFinite(year) ? year : null,
      photoCount: Number(album.assetCount || photos.length),
      coverPhoto: coverPhoto ?? null,
      photos,
      shareUrl: `${publicProxyUrl}/share/${encodeURIComponent(shareKey)}`,
      updatedAt: album.updatedAt || null,
    };
  }

  async function loadSnapshot(): Promise<Snapshot> {
    const config = immichConfig();
    const ownMarker = galleryMarker(id);
    const otherMarkers = foreignMarkers(id);
    const allMarkers = [ownMarker, ...otherMarkers];

    const summaries = await immichJson<ImmichAlbumSummary[]>('/albums');
    const details = await Promise.all((summaries || []).map((album) => getFullAlbum(album.id)));

    const ambiguous: AmbiguousAlbum[] = [];
    const mine: ImmichAlbumSummary[] = [];

    for (const album of details) {
      const description = String(album.description || '');
      // Een lege merker zou elk album opeisen; dat mag nooit, want dan slorpt
      // deze galerij ook die van de andere op.
      if (!ownMarker) continue;
      if (!description.includes(ownMarker)) continue;

      const foreign = otherMarkers.filter((marker) => description.includes(marker));
      if (foreign.length > 0) {
        ambiguous.push({
          id: album.id,
          title: album.albumName || 'Naamloos album',
          markers: [ownMarker, ...foreign],
        });
        continue;
      }
      mine.push(album);
    }

    mine.sort((left, right) => dateValue(right.startDate) - dateValue(left.startDate));

    const allocateSlug = createSlugAllocator();
    const albums: GalleryAlbum[] = [];

    for (const album of mine) {
      const publicDescription = stripMarkers(album.description || '', allMarkers);
      const sharedLink = await ensureAlbumSharedLink(album, publicDescription);
      const slug = allocateSlug(album.albumName || 'album');
      albums.push(
        mapAlbumDetail({
          album,
          slug,
          shareKey: sharedLink.key,
          markers: allMarkers,
          publicProxyUrl: config.publicProxyUrl,
        }),
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      albums,
      summaries: albums.map(
        ({ photos: _photos, shareUrl: _shareUrl, ...summary }): GalleryAlbumSummary => summary,
      ),
      bySlug: new Map(albums.map((album) => [album.slug, album])),
      ambiguous,
    };
  }

  async function getSnapshot({ force = false } = {}): Promise<Snapshot> {
    const now = Date.now();
    const config = immichConfig();

    if (!force && cache && cache.expiresAt > now) return cache.snapshot;
    if (!force && inflight) return inflight;

    inflight = loadSnapshot()
      .then((snapshot) => {
        cache = { snapshot, expiresAt: now + config.cacheTtlSeconds * 1000 };
        return snapshot;
      })
      .finally(() => {
        inflight = null;
      });

    return inflight;
  }

  return {
    id,
    marker: () => galleryMarker(id),

    async listAlbums() {
      const snapshot = await getSnapshot();
      return { generatedAt: snapshot.generatedAt, albums: snapshot.summaries };
    },

    async getAlbum(slug: string) {
      const snapshot = await getSnapshot();
      return snapshot.bySlug.get(slug) || null;
    },

    async getDownloadTarget(slug: string, assetId: string) {
      const snapshot = await getSnapshot();
      const album = snapshot.bySlug.get(slug);
      if (!album) throw new GalleryError(404, 'Album not found.', 'album_not_found');

      const photo = album.photos.find((item) => item.id === assetId);
      if (!photo) throw new GalleryError(404, 'Photo not found in this gallery album.', 'photo_not_found');

      return { album, photo: { ...photo, filename: sanitizeFilename(photo.filename, `${album.slug}.jpg`) } };
    },

    async listAmbiguousAlbums() {
      const snapshot = await getSnapshot();
      return snapshot.ambiguous;
    },

    async refreshSnapshot() {
      try {
        await getSnapshot({ force: true });
      } catch {
        // Best effort: de TTL pikt de wijziging sowieso op. Een mislukte
        // verversing mag het uploaden niet doen falen.
      }
    },

    /**
     * Maakt een album met de merker van **deze** galerij. Daardoor kan een
     * upload vanuit de fakbar-app niet per ongeluk op vtk.be belanden: de
     * merker komt van de client, niet van het formulier.
     */
    async createAlbum({ title, description }) {
      const publicDescription = (description || '').trim();
      const marker = galleryMarker(id);
      const fullDescription = publicDescription ? `${publicDescription}\n\n${marker}` : marker;

      const album = await immichJson<{ id: string }>('/albums', {
        method: 'POST',
        body: { albumName: title, description: fullDescription },
      });
      if (!album?.id) {
        throw new GalleryError(502, 'Immich did not return an album id.', 'immich_album_create_failed');
      }
      return { id: album.id };
    },

    addAssets: addImmichAssetsToAlbum,
  };
}
