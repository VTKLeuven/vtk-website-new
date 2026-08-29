import crypto from 'node:crypto';
import { Pool } from 'pg';
import { faceSearchConfig, type FaceSearchConfig, type GalleryId } from './config';
import { deleteImmichAssets, runImmichAssetJob, uploadImmichAsset } from './immich';
import { sanitizeFilename } from './format';
import type { GalleryAlbum, GalleryPhoto } from './types';

/**
 * Gezichtszoeken binnen één album: een bezoeker uploadt een selfie en krijgt de
 * foto's terug waar hij op staat.
 *
 * **Dit stond eerder alleen in `apps/web`.** Het is hierheen gehaald zodat de
 * galerij van vtk.be en die van 't ElixIr dezelfde implementatie draaien in
 * plaats van twee kopieën die uit elkaar groeien; `apps/web/lib/immich-face-search.ts`
 * is nu een dunne gevel hierop.
 *
 * **De zoekopdracht blijft binnen één album.** Elke query filtert op
 * `album_asset."albumId"`, dus een fakbaralbum kan niet opduiken in een
 * zoekopdracht op vtk.be en omgekeerd. Dat is dezelfde grens als die van de
 * merkers in `config.ts`, en ze moet hier apart blijven kloppen: de albumindex
 * komt uit de Immich-databank en niet uit de galerijclient.
 *
 * De verwerking zelf is biometrisch en staat per galerij achter een eigen vlag
 * die standaard uit staat; zie `faceSearchConfig`.
 */

const ACCEPTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ACCEPTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

/** Twee kaders die elkaar zo sterk overlappen, zijn hetzelfde gezicht. */
const DUPLICATE_FACE_IOU_THRESHOLD = 0.35;

export type FaceSearchStatus =
  | 'processing'
  | 'matched'
  | 'no_match'
  | 'no_indexed_faces'
  | 'timeout'
  | 'multiple_faces'
  | 'failed';

export type FaceSearchMatch = {
  photo: GalleryPhoto;
  distance: number;
  score: number;
};

type FaceSearchJob = {
  requestId: string;
  status: FaceSearchStatus;
  createdAt: string;
  expiresAt: number;
  completedAt?: string;
  message: string;
  errorCode?: string;
  album?: { id: string; slug: string; title: string; photoCount: number };
  matches?: FaceSearchMatch[];
};

type FaceRow = {
  faceId: string;
  assetId: string;
  personId: string | null;
  embedding: string;
  imageWidth: number | null;
  imageHeight: number | null;
  boundingBoxX1: number | null;
  boundingBoxY1: number | null;
  boundingBoxX2: number | null;
  boundingBoxY2: number | null;
};

type RankedFace = FaceRow & { area: number; areaRatio: number; centerDistance: number };

type MatchRow = { assetId: string; distance: number; matchedFaceCount: number };

export class FaceSearchError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'face_search_error') {
    super(message);
    this.name = 'FaceSearchError';
    this.status = status;
    this.code = code;
  }
}

/**
 * De verbindingspoel naar de Immich-databank hangt aan `globalThis` zodat een
 * herlaadbeurt in dev er geen tweede naast zet. Hij is gedeeld over de
 * galerijen: het is dezelfde databank, en de sleutel bevat de
 * verbindingsgegevens zodat een wijziging daarvan de poel vervangt.
 */
const globalForFaceSearch = globalThis as typeof globalThis & {
  __vtkFaceSearchJobs?: Map<string, Map<string, FaceSearchJob>>;
  __vtkFaceSearchPool?: Pool | null;
  __vtkFaceSearchPoolKey?: string;
};

const jobsByGallery = globalForFaceSearch.__vtkFaceSearchJobs ?? new Map<string, Map<string, FaceSearchJob>>();
globalForFaceSearch.__vtkFaceSearchJobs = jobsByGallery;

function jobsFor(id: GalleryId): Map<string, FaceSearchJob> {
  const existing = jobsByGallery.get(id);
  if (existing) return existing;
  const created = new Map<string, FaceSearchJob>();
  jobsByGallery.set(id, created);
  return created;
}

function isDatabaseConfigured(config: FaceSearchConfig): boolean {
  return Boolean(config.database.host && config.database.database && config.database.user);
}

function poolKey(config: FaceSearchConfig): string {
  return [config.database.host, config.database.port, config.database.database, config.database.user].join(':');
}

function getPool(config: FaceSearchConfig): Pool {
  if (!isDatabaseConfigured(config)) {
    throw new FaceSearchError(503, 'Face search database access is not configured.', 'face_search_db_missing');
  }

  const key = poolKey(config);
  if (globalForFaceSearch.__vtkFaceSearchPool && globalForFaceSearch.__vtkFaceSearchPoolKey === key) {
    return globalForFaceSearch.__vtkFaceSearchPool;
  }

  void globalForFaceSearch.__vtkFaceSearchPool?.end().catch(() => null);
  globalForFaceSearch.__vtkFaceSearchPoolKey = key;
  globalForFaceSearch.__vtkFaceSearchPool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: 4,
    idleTimeoutMillis: 30_000,
  });

  return globalForFaceSearch.__vtkFaceSearchPool;
}

async function query<T extends Record<string, unknown>>(
  config: FaceSearchConfig,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool(config).query<T>(sql, params);
  return result.rows;
}

// -----------------------------------------------------------------------------
// Vragen aan de Immich-databank
// -----------------------------------------------------------------------------

function assetFaceEmbeddings(config: FaceSearchConfig, assetId: string) {
  return query<FaceRow>(
    config,
    `
      select
        af.id as "faceId",
        af."assetId",
        af."personId",
        af."imageWidth",
        af."imageHeight",
        af."boundingBoxX1",
        af."boundingBoxY1",
        af."boundingBoxX2",
        af."boundingBoxY2",
        fs.embedding::text as embedding
      from asset_face af
      join face_search fs on fs."faceId" = af.id
      where af."assetId" = $1
        and af."deletedAt" is null
        and af."isVisible" is true
      order by af."updatedAt" desc
    `,
    [assetId],
  );
}

async function countAlbumIndexedFaces(config: FaceSearchConfig, albumId: string): Promise<number> {
  const rows = await query<{ count: number }>(
    config,
    `
      select count(*)::int as count
      from album_asset aa
      join asset a on a.id = aa."assetId"
      join asset_face af on af."assetId" = a.id
      join face_search fs on fs."faceId" = af.id
      where aa."albumId" = $1
        and a."deletedAt" is null
        and a.status = 'active'
        and af."deletedAt" is null
        and af."isVisible" is true
    `,
    [albumId],
  );

  return rows[0]?.count || 0;
}

function findAlbumFaceMatches(
  config: FaceSearchConfig,
  { albumId, embedding, maxDistance, limit }: { albumId: string; embedding: string; maxDistance: number; limit: number },
) {
  return query<MatchRow>(
    config,
    `
      with face_matches as (
        select
          af."assetId",
          min(fs.embedding <=> $2::vector) as distance,
          count(*)::int as "matchedFaceCount"
        from album_asset aa
        join asset a on a.id = aa."assetId"
        join asset_face af on af."assetId" = a.id
        join face_search fs on fs."faceId" = af.id
        where aa."albumId" = $1
          and a."deletedAt" is null
          and a.status = 'active'
          and af."deletedAt" is null
          and af."isVisible" is true
        group by af."assetId"
      )
      select
        "assetId",
        distance::float8 as distance,
        "matchedFaceCount"
      from face_matches
      where distance <= $3
      order by distance asc
      limit $4
    `,
    [albumId, embedding, maxDistance, limit],
  );
}

async function assetHasPreview(config: FaceSearchConfig, assetId: string): Promise<boolean> {
  const rows = await query<{ hasPreview: boolean }>(
    config,
    `
      select exists(
        select 1
        from asset_file
        where "assetId" = $1
          and type = 'preview'
      ) as "hasPreview"
    `,
    [assetId],
  );

  return Boolean(rows[0]?.hasPreview);
}

async function findTemporaryUploads(
  config: FaceSearchConfig,
  { deviceId, olderThan }: { deviceId: string; olderThan: string },
): Promise<string[]> {
  const rows = await query<{ id: string }>(
    config,
    `
      select id
      from asset
      where "deviceId" = $1
        and "createdAt" < $2
        and "deletedAt" is null
      limit 200
    `,
    [deviceId, olderThan],
  );

  return rows.map((row) => row.id);
}

// -----------------------------------------------------------------------------
// Welk gezicht op de selfie is de bezoeker zelf
// -----------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scoreFromDistance(distance: number): number {
  return Math.round(Math.max(0, Math.min(1, 1 - distance)) * 100);
}

function rankFace(face: FaceRow): RankedFace {
  const imageWidth = face.imageWidth || 0;
  const imageHeight = face.imageHeight || 0;
  const x1 = face.boundingBoxX1 || 0;
  const y1 = face.boundingBoxY1 || 0;
  const x2 = face.boundingBoxX2 || 0;
  const y2 = face.boundingBoxY2 || 0;
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  const area = width * height;
  const imageArea = imageWidth * imageHeight;

  return {
    ...face,
    area,
    areaRatio: imageArea > 0 ? area / imageArea : 0,
    centerDistance:
      imageWidth > 0 && imageHeight > 0
        ? Math.hypot(
            (x1 + width / 2 - imageWidth / 2) / (imageWidth / 2),
            (y1 + height / 2 - imageHeight / 2) / (imageHeight / 2),
          )
        : Number.POSITIVE_INFINITY,
  };
}

function faceIntersectionOverUnion(a: RankedFace, b: RankedFace): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(a.boundingBoxX2 || 0, b.boundingBoxX2 || 0) - Math.max(a.boundingBoxX1 || 0, b.boundingBoxX1 || 0),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(a.boundingBoxY2 || 0, b.boundingBoxY2 || 0) - Math.max(a.boundingBoxY1 || 0, b.boundingBoxY1 || 0),
  );
  const intersectionArea = intersectionWidth * intersectionHeight;
  const unionArea = a.area + b.area - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

function dedupeOverlappingFaces(faces: RankedFace[]): RankedFace[] {
  const selected: RankedFace[] = [];
  for (const face of faces) {
    if (selected.some((other) => faceIntersectionOverUnion(face, other) >= DUPLICATE_FACE_IOU_THRESHOLD)) continue;
    selected.push(face);
  }
  return selected;
}

/**
 * Het gezicht van wie zoekt, of `null` wanneer dat niet uit te maken valt.
 *
 * Staat er iemand anders even groot op de foto, dan weigeren we liever dan te
 * gokken: met het verkeerde gezicht zoeken levert de foto's van een ander op.
 */
function selectProfileFace(faces: FaceRow[], config: FaceSearchConfig): RankedFace | FaceRow | null {
  if (faces.length <= 1) return faces[0] || null;

  const ranked = faces.map(rankFace).sort((a, b) => {
    if (b.area !== a.area) return b.area - a.area;
    return a.centerDistance - b.centerDistance;
  });
  const largeEnough = ranked.filter((face) => face.areaRatio >= config.minFaceAreaRatio);
  const candidates = dedupeOverlappingFaces(largeEnough.length > 0 ? largeEnough : ranked);

  if (candidates.length <= 1) return candidates[0] || null;

  const [largest, secondLargest] = candidates;
  if (secondLargest.area <= 0 || largest.area >= secondLargest.area * config.dominantFaceAreaRatio) {
    return largest;
  }

  const clearlyMoreCentral =
    largest.area >= secondLargest.area * 1.5 && largest.centerDistance + 0.2 < secondLargest.centerDistance;

  return clearlyMoreCentral ? largest : null;
}

function consentAccepted(value: FormDataEntryValue | boolean | null): boolean {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function acceptedImageFile(file: File): boolean {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return Boolean(extension && ACCEPTED_EXTENSIONS.includes(extension));
}

function publicJob(job: FaceSearchJob) {
  return {
    requestId: job.requestId,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt || null,
    expiresAt: new Date(job.expiresAt).toISOString(),
    message: job.message,
    errorCode: job.errorCode || null,
    album: job.album || null,
    matches: job.matches || [],
  };
}

export type PublicFaceSearchJob = ReturnType<typeof publicJob>;

/** Vertaalt een fout naar de status en code die een route mag teruggeven. */
export function faceSearchStatus(error: unknown): { status: number; message: string; code: string } {
  if (error instanceof FaceSearchError) {
    return { status: error.status, message: error.message, code: error.code };
  }
  return {
    status: 500,
    message: error instanceof Error ? error.message : 'Unknown face search error.',
    code: 'face_search_error',
  };
}

export type FaceSearchClient = {
  id: GalleryId;
  publicConfig: () => { enabled: boolean; configured: boolean; maxUploadBytes: number; timeoutSeconds: number; maxDistance: number };
  start: (input: { slug: string; file: File | null; consent: FormDataEntryValue | boolean | null }) => Promise<PublicFaceSearchJob>;
  get: (requestId: string) => PublicFaceSearchJob;
};

/**
 * Bouwt de zoekfunctie voor één galerij. `getAlbum` komt van de galerijclient,
 * zodat een slug hier nooit een album van een andere galerij kan opleveren.
 */
export function createFaceSearchClient({
  id,
  getAlbum,
}: {
  id: GalleryId;
  getAlbum: (slug: string) => Promise<GalleryAlbum | null>;
}): FaceSearchClient {
  const jobs = jobsFor(id);

  function finish(job: FaceSearchJob, patch: Partial<FaceSearchJob>): void {
    Object.assign(job, patch, {
      completedAt: new Date().toISOString(),
      expiresAt: Date.now() + faceSearchConfig(id).resultTtlSeconds * 1000,
    });
  }

  function cleanupExpiredJobs(): void {
    const now = Date.now();
    for (const [requestId, job] of jobs.entries()) {
      if (job.expiresAt < now) jobs.delete(requestId);
    }
  }

  /** Uploads die aan een afgebroken zoekopdracht bleven hangen. */
  async function cleanupStaleUploads(): Promise<void> {
    const config = faceSearchConfig(id);
    if (!isDatabaseConfigured(config)) return;

    const olderThan = new Date(Date.now() - config.staleUploadTtlSeconds * 1000).toISOString();
    const assetIds = await findTemporaryUploads(config, { deviceId: config.deviceId, olderThan });
    if (assetIds.length > 0) await deleteImmichAssets(assetIds, { force: true });
  }

  async function uploadSelfie(file: File): Promise<{ id: string; shouldDelete: boolean }> {
    const config = faceSearchConfig(id);
    const safeOriginal = sanitizeFilename(file.name, 'profile-photo.jpg');
    const extension = safeOriginal.includes('.') ? safeOriginal.split('.').pop() : 'jpg';
    const timestamp = new Date().toISOString();

    const uploaded = await uploadImmichAsset({
      assetData: file,
      filename: `${config.deviceId}-${Date.now()}.${extension}`,
      mimeType: file.type || 'image/jpeg',
      deviceAssetId: `${config.deviceId}-${crypto.randomUUID()}`,
      deviceId: config.deviceId,
      createdAt: timestamp,
      visibility: 'archive',
    });

    if (!uploaded?.id) {
      throw new FaceSearchError(502, 'Immich did not return an uploaded asset id.', 'face_search_upload_failed');
    }
    if (uploaded.status === 'duplicate') {
      throw new FaceSearchError(
        409,
        'This photo already exists in Immich. Upload a different clear selfie.',
        'face_search_duplicate_upload',
      );
    }

    return { id: uploaded.id, shouldDelete: true };
  }

  async function waitForPreview(assetId: string, deadline: number): Promise<boolean> {
    const config = faceSearchConfig(id);
    while (Date.now() < deadline) {
      if (await assetHasPreview(config, assetId)) return true;
      await sleep(config.pollIntervalMs);
    }
    return false;
  }

  async function waitForEmbeddings(assetId: string, deadline: number): Promise<FaceRow[] | null> {
    const config = faceSearchConfig(id);
    while (Date.now() < deadline) {
      const faces = await assetFaceEmbeddings(config, assetId);
      if (faces.length > 0) return faces;
      await sleep(config.pollIntervalMs);
    }
    return null;
  }

  async function runJob(job: FaceSearchJob, { slug, file }: { slug: string; file: File }): Promise<void> {
    const config = faceSearchConfig(id);
    let uploadedAssetId: string | null = null;
    let shouldDeleteUploadedAsset = false;

    try {
      const album = await getAlbum(slug);
      if (!album) {
        finish(job, {
          status: 'failed',
          errorCode: 'album_not_found',
          message: 'This album does not exist or is not public.',
        });
        return;
      }

      const albumResult = { id: album.id, slug: album.slug, title: album.title, photoCount: album.photoCount };

      const indexedFaceCount = await countAlbumIndexedFaces(config, album.id);
      if (indexedFaceCount === 0) {
        finish(job, {
          status: 'no_indexed_faces',
          album: albumResult,
          matches: [],
          message: 'This album does not have indexed faces in Immich yet.',
        });
        return;
      }

      const uploaded = await uploadSelfie(file);
      uploadedAssetId = uploaded.id;
      shouldDeleteUploadedAsset = uploaded.shouldDelete;
      const deadline = Date.now() + config.timeoutSeconds * 1000;

      await runImmichAssetJob([uploadedAssetId], 'regenerate-thumbnail').catch(() => null);
      if (!(await waitForPreview(uploadedAssetId, deadline))) {
        finish(job, {
          status: 'timeout',
          album: albumResult,
          matches: [],
          message: 'Immich could not prepare the temporary photo in time.',
        });
        return;
      }

      await runImmichAssetJob([uploadedAssetId], 'refresh-faces').catch(() => null);
      const faces = await waitForEmbeddings(uploadedAssetId, deadline);
      if (!faces) {
        finish(job, {
          status: 'timeout',
          album: albumResult,
          matches: [],
          message: 'Immich is still processing face recognition.',
        });
        return;
      }

      const selectedFace = selectProfileFace(faces, config);
      if (!selectedFace) {
        finish(job, {
          status: 'multiple_faces',
          album: albumResult,
          matches: [],
          message: 'The uploaded photo contains multiple clear faces.',
        });
        return;
      }

      const matches = await findAlbumFaceMatches(config, {
        albumId: album.id,
        embedding: selectedFace.embedding,
        maxDistance: config.maxDistance,
        limit: config.maxResults,
      });

      const photosById = new Map(album.photos.map((photo) => [photo.id, photo]));
      const publicMatches = matches.flatMap((match) => {
        const photo = photosById.get(match.assetId);
        if (!photo) return [];
        return [{ photo, distance: match.distance, score: scoreFromDistance(match.distance) }];
      });

      finish(job, {
        status: publicMatches.length > 0 ? 'matched' : 'no_match',
        album: albumResult,
        matches: publicMatches,
        message:
          publicMatches.length > 0
            ? `${publicMatches.length} possible ${publicMatches.length === 1 ? 'match' : 'matches'} found.`
            : 'No match found in this album.',
      });
    } finally {
      // De selfie is enkel een middel om de sjabloon te maken; ze verdwijnt hoe
      // de zoekopdracht ook afloopt.
      if (uploadedAssetId && shouldDeleteUploadedAsset) {
        await deleteImmichAssets([uploadedAssetId], { force: true }).catch(() => null);
      }
    }
  }

  return {
    id,

    publicConfig() {
      const config = faceSearchConfig(id);
      return {
        enabled: config.enabled,
        configured: isDatabaseConfigured(config),
        maxUploadBytes: config.maxUploadBytes,
        timeoutSeconds: config.timeoutSeconds,
        maxDistance: config.maxDistance,
      };
    },

    async start({ slug, file, consent }) {
      const config = faceSearchConfig(id);

      if (!config.enabled) throw new FaceSearchError(503, 'Face search is disabled.', 'face_search_disabled');
      if (!isDatabaseConfigured(config)) {
        throw new FaceSearchError(503, 'Face search database access is not configured.', 'face_search_db_missing');
      }
      if (!consentAccepted(consent)) {
        throw new FaceSearchError(400, 'Consent is required for face search.', 'face_search_consent_required');
      }
      if (!file) {
        throw new FaceSearchError(400, 'Upload a profile photo to start face search.', 'face_search_file_missing');
      }
      if (file.size > config.maxUploadBytes) {
        throw new FaceSearchError(413, 'The uploaded profile photo is too large.', 'face_search_file_too_large');
      }
      if (!acceptedImageFile(file)) {
        throw new FaceSearchError(415, 'Upload a JPEG, PNG, WebP, HEIC, or HEIF image.', 'face_search_file_type');
      }

      cleanupExpiredJobs();
      if (jobs.size >= config.maxJobs) {
        throw new FaceSearchError(429, 'Too many face search requests are active.', 'face_search_busy');
      }
      cleanupStaleUploads().catch(() => null);

      const now = Date.now();
      const job: FaceSearchJob = {
        requestId: crypto.randomUUID(),
        status: 'processing',
        createdAt: new Date(now).toISOString(),
        expiresAt: now + config.resultTtlSeconds * 1000,
        message: 'Your photo is being processed.',
      };

      jobs.set(job.requestId, job);
      runJob(job, { slug, file }).catch((error) => {
        finish(job, {
          status: 'failed',
          errorCode: error instanceof FaceSearchError ? error.code : 'face_search_failed',
          message: error instanceof Error ? error.message : 'The face search failed.',
        });
      });

      return publicJob(job);
    },

    get(requestId) {
      cleanupExpiredJobs();
      const job = jobs.get(requestId);
      if (!job) throw new FaceSearchError(404, 'Face search request not found.', 'face_search_not_found');
      return publicJob(job);
    },
  };
}
