import { immichConfig } from './config';

/** Fout van de Immich-laag, met de HTTP-status die de route moet teruggeven. */
export class GalleryError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, message: string, code = 'immich_gallery_error', details?: unknown) {
    super(message);
    this.name = 'ImmichGalleryError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: BodyInit | Record<string, unknown> | Array<unknown> | null;
  requiresAuth?: boolean;
};

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '');
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string') return body || fallback;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    return String(record.message || record.error || fallback);
  }
  return fallback;
}

function isJsonBody(body: RequestOptions['body']): body is Record<string, unknown> | Array<unknown> {
  return Boolean(
    body &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof ReadableStream),
  );
}

export async function immichRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const config = immichConfig();
  const requiresAuth = options.requiresAuth !== false;

  if (requiresAuth && !config.apiKey) {
    throw new GalleryError(503, 'GALLERY_IMMICH_API_KEY is niet geconfigureerd.', 'immich_api_key_missing');
  }

  const headers = new Headers(options.headers);
  headers.set('Accept', headers.get('Accept') || 'application/json');
  if (requiresAuth) headers.set('x-api-key', config.apiKey);

  let body: BodyInit | null | undefined;
  if (isJsonBody(options.body)) {
    headers.set('Content-Type', headers.get('Content-Type') || 'application/json');
    body = JSON.stringify(options.body);
  } else {
    body = options.body as BodyInit | null | undefined;
  }

  return fetch(`${config.apiUrl}${path}`, { ...options, headers, body, cache: 'no-store' });
}

export async function immichJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await immichRequest(path, options);
  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new GalleryError(
      response.status,
      errorMessage(body, `Immich request failed with HTTP ${response.status}`),
      'immich_request_failed',
      body,
    );
  }
  if (response.status === 204) return null as T;
  return response.json() as Promise<T>;
}

/** Vertaalt een fout naar de status en code die een route mag teruggeven. */
export function galleryStatus(error: unknown): { status: number; message: string; code: string } {
  if (error instanceof GalleryError) {
    return { status: error.status, message: error.message, code: error.code };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : 'Unknown Immich gallery error.',
    code: 'immich_gallery_error',
  };
}

// -----------------------------------------------------------------------------
// Bewerkingen die niet aan één galerij hangen
// -----------------------------------------------------------------------------

export async function uploadImmichAsset({
  assetData,
  filename,
  mimeType,
  deviceAssetId,
  deviceId,
  createdAt,
  visibility = 'archive',
}: {
  assetData: Blob;
  filename: string;
  mimeType: string;
  deviceAssetId: string;
  deviceId: string;
  createdAt?: string;
  /**
   * `archive` houdt de upload uit de gewone Immich-tijdlijn: hij hoort bij een
   * album, niet bij de bibliotheek van wie de API-sleutel bezit.
   */
  visibility?: string;
}): Promise<{ id?: string; status?: string }> {
  const timestamp = createdAt || new Date().toISOString();
  const form = new FormData();
  const uploadBlob = assetData.type ? assetData : new Blob([assetData], { type: mimeType });

  form.set('assetData', uploadBlob, filename);
  form.set('deviceAssetId', deviceAssetId);
  form.set('deviceId', deviceId);
  form.set('filename', filename);
  form.set('fileCreatedAt', timestamp);
  form.set('fileModifiedAt', timestamp);
  form.set('isFavorite', 'false');
  form.set('visibility', visibility);

  return immichJson<{ id?: string; status?: string }>('/assets', { method: 'POST', body: form });
}

export async function downloadImmichOriginal(assetId: string): Promise<Response> {
  const response = await immichRequest(`/assets/${encodeURIComponent(assetId)}/original`, {
    headers: { Accept: '*/*' },
  });

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new GalleryError(
      response.status,
      errorMessage(body, `Immich download failed with HTTP ${response.status}`),
      'immich_download_failed',
      body,
    );
  }

  return response;
}

export async function deleteImmichAssets(assetIds: string[], { force = true } = {}): Promise<unknown> {
  if (assetIds.length === 0) return null;
  return immichJson<unknown>('/assets', { method: 'DELETE', body: { ids: assetIds, force } });
}

export async function runImmichAssetJob(assetIds: string[], name: string): Promise<unknown> {
  if (assetIds.length === 0) return null;
  return immichJson<unknown>('/assets/jobs', { method: 'POST', body: { assetIds, name } });
}

/**
 * Het antwoord van Immich op een bulkbewerking met assets.
 *
 * **Let op: dit is een HTTP 200 met een resultaat per asset.** Eén asset die
 * niet toegevoegd of verwijderd raakt, gooit dus geen fout; wie dat niet
 * nakijkt, denkt dat alles gelukt is. Bij verplaatsen is dat het verschil
 * tussen een foto die in twee albums staat en een foto die nergens meer staat.
 */
export type ImmichBulkIdResult = {
  id: string;
  success: boolean;
  /** 'duplicate' | 'no_permission' | 'not_found' | 'unknown' | 'validation' */
  error?: string;
};

/**
 * De assets die de bewerking overleefd hebben.
 *
 * `duplicate` telt als gelukt: bij toevoegen betekent het dat de foto al in het
 * album zit, en dat is precies de gewenste eindtoestand.
 */
export function succeededAssetIds(results: ImmichBulkIdResult[] | null | undefined): string[] {
  if (!Array.isArray(results)) return [];
  return results.filter((row) => row.success || row.error === 'duplicate').map((row) => row.id);
}

/** Voegt eerder geüploade assets aan een album toe. */
export async function addImmichAssetsToAlbum(
  albumId: string,
  assetIds: string[],
): Promise<ImmichBulkIdResult[]> {
  if (assetIds.length === 0) return [];
  const result = await immichJson<ImmichBulkIdResult[]>(`/albums/${encodeURIComponent(albumId)}/assets`, {
    method: 'PUT',
    body: { ids: assetIds },
  });
  return Array.isArray(result) ? result : [];
}

/**
 * Haalt assets uit een album zonder ze te verwijderen: ze blijven in Immich
 * staan en in elk ander album waar ze in zitten.
 */
export async function removeImmichAssetsFromAlbum(
  albumId: string,
  assetIds: string[],
): Promise<ImmichBulkIdResult[]> {
  if (assetIds.length === 0) return [];
  const result = await immichJson<ImmichBulkIdResult[]>(`/albums/${encodeURIComponent(albumId)}/assets`, {
    method: 'DELETE',
    body: { ids: assetIds },
  });
  return Array.isArray(result) ? result : [];
}

/**
 * Zet de cover in Immich zelf (`albumThumbnailAssetId`), zodat de keuze ook in
 * de Immich-interface klopt en niet enkel op de site.
 */
export async function setImmichAlbumCover(albumId: string, assetId: string): Promise<unknown> {
  return immichJson<unknown>(`/albums/${encodeURIComponent(albumId)}`, {
    method: 'PATCH',
    body: { albumThumbnailAssetId: assetId },
  });
}

/**
 * Titel en/of beschrijving van een album wijzigen.
 *
 * De beschrijving draagt de merkers (`[gallery]`, `[parent:]`, `[tab:]`), dus
 * wie ze hier overschrijft moet ze eerst uitlezen en opnieuw meegeven; zie
 * `setMarker` in `format.ts`.
 */
export async function updateImmichAlbum(
  albumId: string,
  patch: { albumName?: string; description?: string },
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (patch.albumName !== undefined) body.albumName = patch.albumName;
  if (patch.description !== undefined) body.description = patch.description;
  if (Object.keys(body).length === 0) return null;

  return immichJson<unknown>(`/albums/${encodeURIComponent(albumId)}`, { method: 'PATCH', body });
}

/**
 * Verwijdert het album zelf.
 *
 * **De foto's blijven bestaan.** Immich verwijdert enkel de map; de assets
 * blijven in de bibliotheek staan en in elk ander album waar ze in zitten. Wie
 * ze ook weg wil, roept daarnaast `deleteImmichAssets` aan.
 */
export async function deleteImmichAlbum(albumId: string): Promise<unknown> {
  return immichJson<unknown>(`/albums/${encodeURIComponent(albumId)}`, { method: 'DELETE' });
}

/**
 * De thumbnail van één asset, met de API-sleutel in plaats van via een gedeelde
 * link. Nodig voor foto's die in geen enkel album meer zitten: de publieke
 * foto-URL's hangen aan de gedeelde link van een álbum, en die hebben ze niet
 * meer. Zie de beheerroute in `apps/web/app/api/admin/immich-gallery`.
 */
export async function getImmichAssetThumbnail(
  assetId: string,
  size: 'thumbnail' | 'preview' = 'thumbnail',
): Promise<Response> {
  const response = await immichRequest(
    `/assets/${encodeURIComponent(assetId)}/thumbnail?size=${encodeURIComponent(size)}`,
    { headers: { Accept: 'image/*' } },
  );

  if (!response.ok) {
    const body = await readErrorBody(response);
    throw new GalleryError(
      response.status,
      errorMessage(body, `Immich thumbnail failed with HTTP ${response.status}`),
      'immich_thumbnail_failed',
      body,
    );
  }

  return response;
}
