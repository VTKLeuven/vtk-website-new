import { foreignMarkers, galleryMarker, hiddenMarker, immichConfig, type GalleryId } from './config';
import {
  GalleryError,
  addImmichAssetsToAlbum,
  immichJson,
  listImmichAlbumAssets,
  type ImmichBulkIdResult,
} from './immich';
import {
  assetDimensions,
  createSlugAllocator,
  dateValue,
  fileTitle,
  parseAlbumMarkers,
  photoDate,
  sanitizeFilename,
  stripMarkers,
} from './format';
import { groupAlbums, type MappedAlbumEntry } from './grouping';
import type {
  AmbiguousAlbum,
  DownloadTarget,
  GalleryAlbum,
  GalleryAlbumSummary,
  AdminAlbum,
  ImmichAlbumSummary,
  ImmichSharedLink,
  ManageableAlbum,
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
  hiddenMarker: () => string;
  /**
   * Alle albums van deze galerij recht uit Immich, ook die van de site gehaald
   * zijn. Loopt niet via de momentopname; zie `ManageableAlbum`.
   */
  listManageableAlbums: () => Promise<ManageableAlbum[]>;
  /** Eén album uit die lijst, op Immich-id. */
  getManageableAlbum: (albumId: string) => Promise<ManageableAlbum | null>;
  listAlbums: () => Promise<{ generatedAt: string; albums: GalleryAlbumSummary[] }>;
  getAlbum: (slug: string) => Promise<GalleryAlbum | null>;
  getDownloadTarget: (slug: string, assetId: string) => Promise<DownloadTarget>;
  /** Albums die de merker van meer dan één galerij dragen; zie config.ts. */
  listAmbiguousAlbums: () => Promise<AmbiguousAlbum[]>;
  refreshSnapshot: () => Promise<void>;
  /**
   * De albums voor het mediabeheer: zichtbaar en verborgen samen, gegroepeerd
   * zoals op de site. Loopt niet via de momentopname; zie `AdminAlbum`.
   */
  listAdminAlbums: () => Promise<AdminAlbum[]>;
  /** `hidden`: meteen met de uit-merker, dus niet op de site tot iemand het aanzet. */
  createAlbum: (input: { title: string; description?: string; hidden?: boolean }) => Promise<{ id: string }>;
  addAssets: (albumId: string, assetIds: string[]) => Promise<ImmichBulkIdResult[]>;
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

  async function getFullAlbum(albumId: string): Promise<ImmichAlbumSummary> {
    const album = await immichJson<ImmichAlbumSummary>(`/albums/${encodeURIComponent(albumId)}`);
    const assetCount = Number(album?.assetCount || 0);
    if (Array.isArray(album?.assets) || assetCount === 0) return album;
    return { ...album, assets: await listImmichAlbumAssets(albumId) };
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

    const ambiguous: AmbiguousAlbum[] = [];
    const wanted: ImmichAlbumSummary[] = [];

    // De merker staat al in de albumlijst, dus we filteren voor we de foto's
    // ophalen. Anders haalt elke galerij ook de volledige inhoud binnen van de
    // albums van de andere, om ze daarna weg te gooien.
    for (const album of summaries || []) {
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
      wanted.push(album);
    }

    const settled = await Promise.allSettled(wanted.map((album) => getFullAlbum(album.id)));
    const mine: ImmichAlbumSummary[] = [];

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        mine.push(result.value);
        return;
      }
      // Eén album dat niet laadt mag de galerij niet leegmaken. Dit liep via
      // Promise.all, en toen één album op een paginatiefout viel verdween de
      // volledige lijst van de site in plaats van dat ene album.
      console.warn(
        `[gallery:${id}] album ${wanted[index]?.albumName || wanted[index]?.id} overgeslagen:`,
        result.reason,
      );
    });

    mine.sort((left, right) => dateValue(right.startDate) - dateValue(left.startDate));

    // De gedeelde links naast elkaar, net als de albums hierboven. Dit liep per
    // album na elkaar, en met een GET plus soms een POST of PATCH per album was
    // dat het grootste deel van de twee seconden die het opbouwen van de
    // momentopname kostte. De volgorde van `mine` blijft leidend, zodat het
    // toekennen van de slugs hieronder onveranderd deterministisch is.
    const sharedLinks = await Promise.allSettled(
      mine.map((album) => ensureAlbumSharedLink(album, stripMarkers(album.description || '', allMarkers))),
    );

    const allocateSlug = createSlugAllocator();
    const mappedEntries: MappedAlbumEntry[] = [];

    for (const [index, album] of mine.entries()) {
      const result = sharedLinks[index];

      // Om dezelfde reden als hierboven: een album zonder werkende gedeelde
      // link heeft geen foto-URL's en valt weg, maar neemt de rest niet mee.
      if (result.status === 'rejected') {
        console.warn(
          `[gallery:${id}] geen gedeelde link voor ${album.albumName || album.id}:`,
          result.reason,
        );
        continue;
      }
      const sharedLink = result.value;

      const slug = allocateSlug(album.albumName || 'album');
      const mapped = mapAlbumDetail({
        album,
        slug,
        shareKey: sharedLink.key,
        markers: allMarkers,
        publicProxyUrl: config.publicProxyUrl,
      });

      mappedEntries.push({
        album: mapped,
        markers: parseAlbumMarkers(album.description, album.albumName || ''),
        rawTitle: album.albumName || '',
        rawDescription: album.description || '',
      });
    }

    const albums = groupAlbums(mappedEntries, downloadPath);

    const bySlug = new Map<string, GalleryAlbum>();
    for (const album of albums) {
      bySlug.set(album.slug, album);
    }
    for (const entry of mappedEntries) {
      if (!bySlug.has(entry.album.slug)) {
        const parent = albums.find((a) => a.subAlbums?.some((sub) => sub.id === entry.album.id));
        if (parent) {
          bySlug.set(entry.album.slug, parent);
        }
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      albums,
      summaries: albums.map(
        ({ photos: _photos, shareUrl: _shareUrl, subAlbums, ...summary }): GalleryAlbumSummary => ({
          ...summary,
          subAlbums: subAlbums?.map(
            ({ photos: _subPhotos, shareUrl: _subShareUrl, ...subSummary }) => subSummary,
          ),
        }),
      ),
      bySlug,
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

  function toManageableAlbum(album: ImmichAlbumSummary, ownMarker: string, offMarker: string): ManageableAlbum {
    const description = String(album.description || '');
    const markers = parseAlbumMarkers(description, album.albumName || '');

    return {
      id: album.id,
      title: album.albumName || 'Naamloos album',
      description,
      publicDescription: stripMarkers(description, [ownMarker, offMarker, ...foreignMarkers(id)]),
      photoCount: Number(album.assetCount || 0),
      hidden: description.includes(offMarker) && !description.includes(ownMarker),
      parent: markers.parent,
      tab: markers.tab,
    };
  }

  return {
    id,
    marker: () => galleryMarker(id),
    hiddenMarker: () => hiddenMarker(id),

    /**
     * Eén `GET /albums`, geen assets en geen gedeelde links: dit voedt een
     * beheerlijst, niet de site. De verborgen albums horen er wel in, want
     * anders is een album dat van de site is, nergens meer terug te vinden.
     */
    async listManageableAlbums() {
      const ownMarker = galleryMarker(id);
      const offMarker = hiddenMarker(id);
      if (!ownMarker) return [];

      const summaries = await immichJson<ImmichAlbumSummary[]>('/albums');
      const rows: ManageableAlbum[] = [];

      for (const album of summaries || []) {
        const description = String(album.description || '');
        const own = description.includes(ownMarker);
        const off = description.includes(offMarker);
        if (!own && !off) continue;
        // Een dubbelzinnig album (twee galerijmerkers) hoort nergens; het staat
        // al apart in `listAmbiguousAlbums`.
        if (own && foreignMarkers(id).some((marker) => description.includes(marker))) continue;
        rows.push(toManageableAlbum(album, ownMarker, offMarker));
      }

      return rows;
    },

    async getManageableAlbum(albumId: string) {
      const album = await immichJson<ImmichAlbumSummary>(`/albums/${encodeURIComponent(albumId)}`).catch(() => null);
      if (!album?.id) return null;
      return toManageableAlbum(album, galleryMarker(id), hiddenMarker(id));
    },

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

      const photo =
        album.photos.find((item) => item.id === assetId) ||
        album.subAlbums?.flatMap((sub) => sub.photos).find((item) => item.id === assetId);
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
     * Eén `GET /albums`, net als `listManageableAlbums`, maar gegroepeerd met
     * dezelfde `groupAlbums` als de site: een album met tabs is één rij.
     *
     * De slugs worden toegekend zoals de momentopname dat doet: de zichtbare
     * albums eerst, nieuwste bovenaan, en pas daarna de verborgen. Zo wijst
     * `[parent: <slug>]` van een nieuwe tab naar hetzelfde album als op de site,
     * ook bij twee albums met dezelfde titel (`schuimfuif`, `schuimfuif-2`).
     */
    async listAdminAlbums() {
      const ownMarker = galleryMarker(id);
      const offMarker = hiddenMarker(id);
      if (!ownMarker) return [];

      const summaries = await immichJson<ImmichAlbumSummary[]>('/albums');
      const visible: ImmichAlbumSummary[] = [];
      const hidden: ImmichAlbumSummary[] = [];
      for (const album of summaries || []) {
        const description = String(album.description || '');
        const own = description.includes(ownMarker);
        const off = !own && description.includes(offMarker);
        if (!own && !off) continue;
        // Dubbelzinnig (twee galerijmerkers): hoort nergens, zie `listAmbiguousAlbums`.
        if (foreignMarkers(id).some((marker) => description.includes(marker))) continue;
        (own ? visible : hidden).push(album);
      }
      const newestFirst = (left: ImmichAlbumSummary, right: ImmichAlbumSummary) =>
        dateValue(right.startDate) - dateValue(left.startDate);
      visible.sort(newestFirst);
      hidden.sort(newestFirst);

      const hiddenIds = new Set(hidden.map((album) => album.id));
      const allocateSlug = createSlugAllocator();
      const markers = [ownMarker, offMarker, ...foreignMarkers(id)];
      const own = new Map<string, { cover: string | null; hasTab: boolean }>();

      const entries: MappedAlbumEntry[] = [...visible, ...hidden].map((album) => {
        const title = album.albumName || 'Naamloos album';
        const parsed = parseAlbumMarkers(album.description, album.albumName || '');
        const date = album.startDate || album.endDate || null;
        const year = date ? new Date(date).getUTCFullYear() : null;
        own.set(album.id, { cover: album.albumThumbnailAssetId || null, hasTab: Boolean(parsed.tab) });
        return {
          album: {
            id: album.id,
            slug: allocateSlug(title),
            title,
            description: stripMarkers(album.description || '', markers),
            date,
            year: Number.isFinite(year) ? year : null,
            photoCount: Number(album.assetCount || 0),
            coverPhoto: null,
            photos: [],
            shareUrl: '',
            updatedAt: album.updatedAt || null,
          },
          markers: parsed,
          rawTitle: album.albumName || '',
          rawDescription: album.description || '',
        };
      });

      return groupAlbums(entries)
        .map((album): AdminAlbum => {
          const tabs = album.subAlbums && album.subAlbums.length > 1 ? album.subAlbums : null;
          return {
            id: album.id,
            slug: album.slug,
            title: album.title,
            description: album.description,
            date: album.date,
            photoCount: album.photoCount,
            hidden: hiddenIds.has(album.id),
            coverAssetId: own.get(album.id)?.cover ?? null,
            parts: tabs
              ? tabs.map((tab) => ({
                  id: tab.id,
                  name: tab.title,
                  photoCount: tab.photoCount,
                  hidden: hiddenIds.has(tab.id),
                }))
              : [{ id: album.id, name: album.title, photoCount: album.photoCount, hidden: hiddenIds.has(album.id) }],
            hasOwnTabName: own.get(album.id)?.hasTab ?? false,
          };
        })
        .sort((left, right) => dateValue(right.date) - dateValue(left.date));
    },

    /**
     * Maakt een album met de merker van **deze** galerij. Daardoor kan een
     * upload vanuit de fakbar-app niet per ongeluk op vtk.be belanden: de
     * merker komt van de client, niet van het formulier.
     */
    async createAlbum({ title, description, hidden = false }) {
      const publicDescription = (description || '').trim();
      const marker = hidden ? hiddenMarker(id) : galleryMarker(id);
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
