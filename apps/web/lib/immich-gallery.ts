import "server-only";

type ImmichAlbumSummary = {
  id: string;
  albumName?: string | null;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  updatedAt?: string | null;
  assetCount?: number | string | null;
  albumThumbnailAssetId?: string | null;
  assets?: ImmichAsset[];
};

type ImmichAsset = {
  id: string;
  type?: string | null;
  originalFileName?: string | null;
  originalMimeType?: string | null;
  fileCreatedAt?: string | null;
  localDateTime?: string | null;
  createdAt?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  exifInfo?: {
    dateTimeOriginal?: string | null;
    exifImageWidth?: number | string | null;
    exifImageHeight?: number | string | null;
    description?: string | null;
  } | null;
};

type ImmichSharedLink = {
  id: string;
  key: string;
  type?: string | null;
  albumId?: string | null;
  album?: { id?: string | null } | null;
  allowDownload?: boolean | null;
  showMetadata?: boolean | null;
  description?: string | null;
};

type ImmichSearchResponse = {
  assets?: {
    items?: ImmichAsset[];
    nextPage?: number | string | null;
  };
};

export type GalleryPhoto = {
  id: string;
  title: string;
  description: string;
  date: string | null;
  width: number;
  height: number;
  filename: string;
  mimeType: string;
  thumbnailUrl: string;
  previewUrl: string;
  originalUrl: string;
  downloadUrl: string;
};

export type GalleryAlbum = {
  id: string;
  slug: string;
  title: string;
  description: string;
  date: string | null;
  year: number | null;
  photoCount: number;
  coverPhoto: GalleryPhoto | null;
  photos: GalleryPhoto[];
  shareUrl: string;
  updatedAt: string | null;
};

export type GalleryAlbumSummary = Omit<GalleryAlbum, "photos" | "shareUrl">;

type GallerySnapshot = {
  generatedAt: string;
  albums: GalleryAlbum[];
  summaries: GalleryAlbumSummary[];
  bySlug: Map<string, GalleryAlbum>;
};

type DownloadTarget = {
  album: GalleryAlbum;
  photo: GalleryPhoto;
};

class ImmichGalleryError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, message: string, code = "immich_gallery_error", details?: unknown) {
    super(message);
    this.name = "ImmichGalleryError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type GalleryConfig = {
  apiUrl: string;
  apiKey: string;
  publicProxyUrl: string;
  albumMarker: string;
  cacheTtlSeconds: number;
};

type ImmichRequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | Array<unknown> | null;
  requiresAuth?: boolean;
};

type CachedSnapshot = {
  snapshot: GallerySnapshot;
  expiresAt: number;
};

let cache: CachedSnapshot | null = null;
let inflight: Promise<GallerySnapshot> | null = null;

function getConfig(): GalleryConfig {
  const apiUrl =
    process.env.GALLERY_IMMICH_API_URL ||
    process.env.IMMICH_API_URL ||
    "http://localhost:2283/api";
  const apiKey = process.env.GALLERY_IMMICH_API_KEY || process.env.IMMICH_API_KEY || "";
  const publicProxyUrl =
    process.env.GALLERY_PUBLIC_PROXY_URL ||
    process.env.IMMICH_PUBLIC_PROXY_URL ||
    "http://localhost:3000";
  const albumMarker = process.env.GALLERY_ALBUM_MARKER || process.env.IMMICH_ALBUM_MARKER || "[gallery]";
  const cacheTtlSeconds = Number(process.env.GALLERY_CACHE_TTL_SECONDS || "60");

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    apiKey,
    publicProxyUrl: publicProxyUrl.replace(/\/+$/, ""),
    albumMarker,
    cacheTtlSeconds: Number.isFinite(cacheTtlSeconds) && cacheTtlSeconds >= 0 ? cacheTtlSeconds : 60,
  };
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return "";

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === "string") return body || fallback;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    return String(record.message || record.error || fallback);
  }
  return fallback;
}

function isJsonBody(body: ImmichRequestOptions["body"]): body is Record<string, unknown> | Array<unknown> {
  return Boolean(
    body &&
      typeof body === "object" &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof ReadableStream),
  );
}

async function immichRequest(path: string, options: ImmichRequestOptions = {}) {
  const config = getConfig();
  const requiresAuth = options.requiresAuth !== false;

  if (requiresAuth && !config.apiKey) {
    throw new ImmichGalleryError(
      503,
      "GALLERY_IMMICH_API_KEY is niet geconfigureerd.",
      "immich_api_key_missing",
    );
  }

  const headers = new Headers(options.headers);
  headers.set("Accept", headers.get("Accept") || "application/json");
  if (requiresAuth) headers.set("x-api-key", config.apiKey);

  let body: BodyInit | null | undefined;
  if (isJsonBody(options.body)) {
    headers.set("Content-Type", headers.get("Content-Type") || "application/json");
    body = JSON.stringify(options.body);
  } else {
    body = options.body as BodyInit | null | undefined;
  }

  return fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers,
    body,
    cache: "no-store",
  });
}

async function immichJson<T>(path: string, options: ImmichRequestOptions = {}) {
  const response = await immichRequest(path, options);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ImmichGalleryError(
      response.status,
      errorMessage(body, `Immich request failed with HTTP ${response.status}`),
      "immich_request_failed",
      body,
    );
  }

  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

function hasGalleryMarker(description = "", marker = "[gallery]") {
  if (!marker) return true;
  return String(description || "").includes(marker);
}

function stripGalleryMarker(description = "", marker = "[gallery]") {
  const raw = String(description || "");
  if (!marker) return raw.trim();

  return raw
    .split(marker)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function slugify(value: string) {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "album";
}

function createSlugAllocator() {
  const counts = new Map<string, number>();

  return (title: string) => {
    const base = slugify(title);
    const count = counts.get(base) || 0;
    counts.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}

function sanitizeFilename(filename: string | null | undefined, fallback = "photo.jpg") {
  const base = String(filename || fallback)
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim();

  return base || fallback;
}

export function sanitizeImmichGalleryFilename(filename: string | null | undefined, fallback = "photo.jpg") {
  return sanitizeFilename(filename, fallback);
}

function filenameFromHeader(value: string | null, fallback: string) {
  if (!value) return fallback;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) return sanitizeFilename(decodeURIComponent(utf8[1]), fallback);
  const quoted = value.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return sanitizeFilename(quoted[1], fallback);
  const plain = value.match(/filename=([^;]+)/i);
  return sanitizeFilename(plain?.[1], fallback);
}

function buildPhotoUrls(publicProxyUrl: string, shareKey: string, assetId: string) {
  const key = encodeURIComponent(shareKey);
  const id = encodeURIComponent(assetId);

  return {
    thumbnail: `${publicProxyUrl}/share/photo/${key}/${id}/thumbnail`,
    preview: `${publicProxyUrl}/share/photo/${key}/${id}/preview`,
    original: `${publicProxyUrl}/share/photo/${key}/${id}/original`,
  };
}

function dateValue(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? 0 : time;
}

function photoDate(asset: ImmichAsset) {
  return (
    asset.fileCreatedAt ||
    asset.localDateTime ||
    asset.exifInfo?.dateTimeOriginal ||
    asset.createdAt ||
    null
  );
}

function assetDimensions(asset: ImmichAsset) {
  const width = Number(asset.width || asset.exifInfo?.exifImageWidth || 1600);
  const height = Number(asset.height || asset.exifInfo?.exifImageHeight || 1067);

  return {
    width: Number.isFinite(width) && width > 0 ? width : 1600,
    height: Number.isFinite(height) && height > 0 ? height : 1067,
  };
}

function fileTitle(filename: string) {
  return sanitizeFilename(filename, "foto.jpg")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortAlbumsByDateDesc(left: ImmichAlbumSummary, right: ImmichAlbumSummary) {
  return dateValue(right.startDate) - dateValue(left.startDate);
}

function findAlbumSharedLink(links: ImmichSharedLink[], albumId: string) {
  return links.find((link) => {
    if (link.type !== "ALBUM") return false;
    return link.album?.id === albumId || link.albumId === albumId;
  });
}

async function listAlbumAssets(albumId: string, { size = 1000 } = {}) {
  const assets: ImmichAsset[] = [];
  const seenPages = new Set<string>();
  let page: number | string | null = 1;

  while (page) {
    const pageKey = String(page);
    if (seenPages.has(pageKey)) {
      throw new ImmichGalleryError(502, "Immich album asset pagination loop detected.", "immich_pagination_loop");
    }
    seenPages.add(pageKey);

    const result: ImmichSearchResponse = await immichJson<ImmichSearchResponse>("/search/metadata", {
      method: "POST",
      body: {
        albumIds: [albumId],
        page,
        size,
      },
    });
    const pageAssets = result?.assets?.items || [];
    assets.push(...pageAssets);
    page = result?.assets?.nextPage || null;
  }

  return assets;
}

async function getAlbum(albumId: string) {
  const album = await immichJson<ImmichAlbumSummary>(`/albums/${encodeURIComponent(albumId)}`);
  const assetCount = Number(album?.assetCount || 0);

  if (Array.isArray(album?.assets) || assetCount === 0) return album;

  return {
    ...album,
    assets: await listAlbumAssets(albumId),
  };
}

async function ensureAlbumSharedLink(album: ImmichAlbumSummary, publicDescription: string) {
  const links = await immichJson<ImmichSharedLink[]>(`/shared-links?albumId=${encodeURIComponent(album.id)}`);
  const existing = findAlbumSharedLink(links || [], album.id);

  if (!existing) {
    return immichJson<ImmichSharedLink>("/shared-links", {
      method: "POST",
      body: {
        type: "ALBUM",
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
  if ((existing.description || "") !== publicDescription) patch.description = publicDescription;

  if (Object.keys(patch).length === 0) return existing;

  return immichJson<ImmichSharedLink>(`/shared-links/${encodeURIComponent(existing.id)}`, {
    method: "PATCH",
    body: patch,
  });
}

function mapAlbumDetail({
  album,
  slug,
  shareKey,
  marker,
  publicProxyUrl,
}: {
  album: ImmichAlbumSummary;
  slug: string;
  shareKey: string;
  marker: string;
  publicProxyUrl: string;
}): GalleryAlbum {
  const description = stripGalleryMarker(album.description || "", marker);
  const sortedAssets = [...(album.assets || [])]
    .filter((asset) => asset.type === "IMAGE")
    .sort((left, right) => dateValue(photoDate(left)) - dateValue(photoDate(right)));
  const coverAsset =
    sortedAssets.find((asset) => asset.id === album.albumThumbnailAssetId) || sortedAssets[0] || null;

  const photos = sortedAssets.map((asset, index): GalleryPhoto => {
    const dimensions = assetDimensions(asset);
    const filename = sanitizeFilename(asset.originalFileName, `${slug}-${index + 1}.jpg`);
    const urls = buildPhotoUrls(publicProxyUrl, shareKey, asset.id);

    return {
      id: asset.id,
      title: fileTitle(filename),
      description: asset.exifInfo?.description || "",
      date: photoDate(asset),
      width: dimensions.width,
      height: dimensions.height,
      filename,
      mimeType: asset.originalMimeType || "image/jpeg",
      thumbnailUrl: urls.thumbnail,
      previewUrl: urls.preview,
      originalUrl: urls.original,
      downloadUrl: `/api/immich-gallery/albums/${encodeURIComponent(slug)}/photos/${encodeURIComponent(asset.id)}/download`,
    };
  });

  const coverPhoto = coverAsset ? photos.find((photo) => photo.id === coverAsset.id) || photos[0] : null;
  const date = album.startDate || album.endDate || photos[0]?.date || null;
  const year = date ? new Date(date).getUTCFullYear() : null;

  return {
    id: album.id,
    slug,
    title: album.albumName || "Naamloos album",
    description,
    date,
    year: Number.isFinite(year) ? year : null,
    photoCount: Number(album.assetCount || photos.length),
    coverPhoto,
    photos,
    shareUrl: `${publicProxyUrl}/share/${encodeURIComponent(shareKey)}`,
    updatedAt: album.updatedAt || null,
  };
}

function mapAlbumSummary(album: GalleryAlbum): GalleryAlbumSummary {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    description: album.description,
    date: album.date,
    year: album.year,
    photoCount: album.photoCount,
    coverPhoto: album.coverPhoto,
    updatedAt: album.updatedAt,
  };
}

async function loadSnapshot() {
  const config = getConfig();
  const summaries = await immichJson<ImmichAlbumSummary[]>("/albums");
  const details = await Promise.all((summaries || []).map((album) => getAlbum(album.id)));
  const markedAlbums = details
    .filter((album) => hasGalleryMarker(album.description || "", config.albumMarker))
    .sort(sortAlbumsByDateDesc);
  const allocateSlug = createSlugAllocator();
  const albums: GalleryAlbum[] = [];

  for (const album of markedAlbums) {
    const publicDescription = stripGalleryMarker(album.description || "", config.albumMarker);
    const sharedLink = await ensureAlbumSharedLink(album, publicDescription);
    const slug = allocateSlug(album.albumName || "album");

    albums.push(
      mapAlbumDetail({
        album,
        slug,
        shareKey: sharedLink.key,
        marker: config.albumMarker,
        publicProxyUrl: config.publicProxyUrl,
      }),
    );
  }

  return {
    generatedAt: new Date().toISOString(),
    albums,
    summaries: albums.map(mapAlbumSummary),
    bySlug: new Map(albums.map((album) => [album.slug, album])),
  };
}

async function getSnapshot({ force = false } = {}) {
  const now = Date.now();
  const config = getConfig();

  if (!force && cache && cache.expiresAt > now) return cache.snapshot;
  if (!force && inflight) return inflight;

  inflight = loadSnapshot()
    .then((snapshot) => {
      cache = {
        snapshot,
        expiresAt: now + config.cacheTtlSeconds * 1000,
      };
      return snapshot;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function listImmichGalleryAlbums() {
  const snapshot = await getSnapshot();
  return {
    generatedAt: snapshot.generatedAt,
    albums: snapshot.summaries,
  };
}

export async function getImmichGalleryAlbum(slug: string) {
  const snapshot = await getSnapshot();
  return snapshot.bySlug.get(slug) || null;
}

export async function getImmichGalleryDownloadTarget(slug: string, assetId: string): Promise<DownloadTarget> {
  const album = await getImmichGalleryAlbum(slug);
  if (!album) {
    throw new ImmichGalleryError(404, "Album not found.", "album_not_found");
  }

  const photo = album.photos.find((item) => item.id === assetId);
  if (!photo) {
    throw new ImmichGalleryError(404, "Photo not found in this gallery album.", "photo_not_found");
  }

  return {
    album,
    photo: {
      ...photo,
      filename: sanitizeFilename(photo.filename, `${album.slug}.jpg`),
    },
  };
}

export async function downloadImmichOriginal(assetId: string) {
  const response = await immichRequest(`/assets/${encodeURIComponent(assetId)}/original`, {
    headers: {
      Accept: "*/*",
    },
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new ImmichGalleryError(
      response.status,
      errorMessage(body, `Immich download failed with HTTP ${response.status}`),
      "immich_download_failed",
      body,
    );
  }

  return response;
}

export async function uploadImmichAsset({
  assetData,
  filename,
  mimeType,
  deviceAssetId,
  deviceId,
  createdAt,
  visibility = "archive",
}: {
  assetData: Blob;
  filename: string;
  mimeType: string;
  deviceAssetId: string;
  deviceId: string;
  createdAt?: string;
  visibility?: string;
}) {
  const timestamp = createdAt || new Date().toISOString();
  const form = new FormData();
  const uploadBlob = assetData.type ? assetData : new Blob([assetData], { type: mimeType });

  form.set("assetData", uploadBlob, filename);
  form.set("deviceAssetId", deviceAssetId);
  form.set("deviceId", deviceId);
  form.set("filename", filename);
  form.set("fileCreatedAt", timestamp);
  form.set("fileModifiedAt", timestamp);
  form.set("isFavorite", "false");
  form.set("visibility", visibility);

  return immichJson<{ id?: string; status?: string }>("/assets", {
    method: "POST",
    body: form,
  });
}

export async function deleteImmichAssets(assetIds: string[], { force = true } = {}) {
  if (assetIds.length === 0) return null;

  return immichJson<unknown>("/assets", {
    method: "DELETE",
    body: {
      ids: assetIds,
      force,
    },
  });
}

export async function runImmichAssetJob(assetIds: string[], name: string) {
  if (assetIds.length === 0) return null;

  return immichJson<unknown>("/assets/jobs", {
    method: "POST",
    body: {
      assetIds,
      name,
    },
  });
}

export function immichGalleryStatus(error: unknown) {
  if (error instanceof ImmichGalleryError) {
    return {
      status: error.status,
      message: error.message,
      code: error.code,
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : "Unknown Immich gallery error.",
    code: "immich_gallery_error",
  };
}

export function downloadFilenameFromImmichResponse(response: Response, fallback: string) {
  return filenameFromHeader(response.headers.get("content-disposition"), fallback);
}
