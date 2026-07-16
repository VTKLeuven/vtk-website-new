import "server-only";

import crypto from "node:crypto";
import { Pool } from "pg";
import {
  deleteImmichAssets,
  getImmichGalleryAlbum,
  runImmichAssetJob,
  sanitizeImmichGalleryFilename,
  type GalleryAlbum,
  type GalleryPhoto,
  uploadImmichAsset,
} from "@/lib/immich-gallery";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

type FaceSearchConfig = {
  enabled: boolean;
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  maxUploadBytes: number;
  timeoutSeconds: number;
  pollIntervalMs: number;
  resultTtlSeconds: number;
  staleUploadTtlSeconds: number;
  maxJobs: number;
  maxDistance: number;
  maxResults: number;
  minFaceAreaRatio: number;
  dominantFaceAreaRatio: number;
  deviceId: string;
};

type FaceSearchStatus =
  | "processing"
  | "matched"
  | "no_match"
  | "no_indexed_faces"
  | "timeout"
  | "multiple_faces"
  | "failed";

type FaceSearchMatch = {
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
  album?: {
    id: string;
    slug: string;
    title: string;
    photoCount: number;
  };
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

type RankedFace = FaceRow & {
  area: number;
  areaRatio: number;
  centerDistance: number;
};

type MatchRow = {
  assetId: string;
  distance: number;
  matchedFaceCount: number;
};

class FaceSearchError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "face_search_error") {
    super(message);
    this.name = "FaceSearchError";
    this.status = status;
    this.code = code;
  }
}

const globalForFaceSearch = globalThis as typeof globalThis & {
  __vtkImmichFaceSearchJobs?: Map<string, FaceSearchJob>;
  __vtkImmichFaceSearchPool?: Pool | null;
  __vtkImmichFaceSearchPoolKey?: string;
};

const jobs = globalForFaceSearch.__vtkImmichFaceSearchJobs ?? new Map<string, FaceSearchJob>();
globalForFaceSearch.__vtkImmichFaceSearchJobs = jobs;

const DUPLICATE_FACE_IOU_THRESHOLD = 0.35;

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readConfig(): FaceSearchConfig {
  const maxDistance = Number(process.env.GALLERY_FACE_MATCH_MAX_DISTANCE);

  return {
    enabled: process.env.GALLERY_FACE_SEARCH_ENABLED !== "false",
    database: {
      host: process.env.GALLERY_DATABASE_HOST || "",
      port: parsePositiveInteger(process.env.GALLERY_DATABASE_PORT, 5432),
      database: process.env.GALLERY_DATABASE_NAME || "",
      user: process.env.GALLERY_DATABASE_USER || "",
      password: process.env.GALLERY_DATABASE_PASSWORD || "",
    },
    maxUploadBytes: parsePositiveInteger(process.env.GALLERY_FACE_SEARCH_MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
    timeoutSeconds: parsePositiveInteger(process.env.GALLERY_FACE_SEARCH_TIMEOUT_SECONDS, 240),
    pollIntervalMs: parsePositiveInteger(process.env.GALLERY_FACE_SEARCH_POLL_INTERVAL_MS, 2500),
    resultTtlSeconds: parsePositiveInteger(process.env.GALLERY_FACE_SEARCH_RESULT_TTL_SECONDS, 15 * 60),
    staleUploadTtlSeconds: parsePositiveInteger(process.env.GALLERY_FACE_SEARCH_STALE_UPLOAD_TTL_SECONDS, 60 * 60),
    maxJobs: parsePositiveInteger(process.env.GALLERY_FACE_SEARCH_MAX_JOBS, 50),
    maxDistance: Number.isFinite(maxDistance) ? maxDistance : 0.42,
    maxResults: parsePositiveInteger(process.env.GALLERY_FACE_MATCH_MAX_RESULTS, 80),
    minFaceAreaRatio: parsePositiveNumber(process.env.GALLERY_FACE_SEARCH_MIN_FACE_AREA_RATIO, 0.008),
    dominantFaceAreaRatio: parsePositiveNumber(process.env.GALLERY_FACE_SEARCH_DOMINANT_FACE_AREA_RATIO, 2.2),
    deviceId: process.env.GALLERY_FACE_SEARCH_DEVICE_ID || "vtk-gallery-face-search",
  };
}

function isDatabaseConfigured(config = readConfig()) {
  return Boolean(config.database.host && config.database.database && config.database.user);
}

function poolKey(config: FaceSearchConfig) {
  return [
    config.database.host,
    config.database.port,
    config.database.database,
    config.database.user,
  ].join(":");
}

function getPool(config = readConfig()) {
  if (!isDatabaseConfigured(config)) {
    throw new FaceSearchError(503, "Face search database access is not configured.", "face_search_db_missing");
  }

  const key = poolKey(config);
  if (globalForFaceSearch.__vtkImmichFaceSearchPool && globalForFaceSearch.__vtkImmichFaceSearchPoolKey === key) {
    return globalForFaceSearch.__vtkImmichFaceSearchPool;
  }

  void globalForFaceSearch.__vtkImmichFaceSearchPool?.end().catch(() => null);
  globalForFaceSearch.__vtkImmichFaceSearchPoolKey = key;
  globalForFaceSearch.__vtkImmichFaceSearchPool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: 4,
    idleTimeoutMillis: 30_000,
  });

  return globalForFaceSearch.__vtkImmichFaceSearchPool;
}

async function query<T extends Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

async function getAssetFaceEmbeddings(assetId: string) {
  return query<FaceRow>(
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

async function countAlbumIndexedFaces(albumId: string) {
  const rows = await query<{ count: number }>(
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

async function findAlbumFaceMatches({
  albumId,
  embedding,
  maxDistance,
  limit,
}: {
  albumId: string;
  embedding: string;
  maxDistance: number;
  limit: number;
}) {
  return query<MatchRow>(
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

async function assetHasPreview(assetId: string) {
  const rows = await query<{ hasPreview: boolean }>(
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

async function findTemporaryFaceSearchAssets({ deviceId, olderThan }: { deviceId: string; olderThan: string }) {
  const rows = await query<{ id: string }>(
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scoreFromDistance(distance: number) {
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
  const areaRatio = imageArea > 0 ? area / imageArea : 0;
  const centerDistance =
    imageWidth > 0 && imageHeight > 0
      ? Math.hypot(
          (x1 + width / 2 - imageWidth / 2) / (imageWidth / 2),
          (y1 + height / 2 - imageHeight / 2) / (imageHeight / 2),
        )
      : Number.POSITIVE_INFINITY;

  return {
    ...face,
    area,
    areaRatio,
    centerDistance,
  };
}

function faceIntersectionOverUnion(a: RankedFace, b: RankedFace) {
  const ax1 = a.boundingBoxX1 || 0;
  const ay1 = a.boundingBoxY1 || 0;
  const ax2 = a.boundingBoxX2 || 0;
  const ay2 = a.boundingBoxY2 || 0;
  const bx1 = b.boundingBoxX1 || 0;
  const by1 = b.boundingBoxY1 || 0;
  const bx2 = b.boundingBoxX2 || 0;
  const by2 = b.boundingBoxY2 || 0;

  const intersectionWidth = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1));
  const intersectionHeight = Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
  const intersectionArea = intersectionWidth * intersectionHeight;
  const unionArea = a.area + b.area - intersectionArea;

  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

function dedupeOverlappingFaces(faces: RankedFace[]) {
  const selected: RankedFace[] = [];

  for (const face of faces) {
    if (
      selected.some((selectedFace) => faceIntersectionOverUnion(face, selectedFace) >= DUPLICATE_FACE_IOU_THRESHOLD)
    ) {
      continue;
    }

    selected.push(face);
  }

  return selected;
}

function selectProfileFace(faces: FaceRow[], config: FaceSearchConfig) {
  if (faces.length <= 1) return faces[0] || null;

  const ranked = faces
    .map(rankFace)
    .sort((a, b) => {
      if (b.area !== a.area) return b.area - a.area;
      return a.centerDistance - b.centerDistance;
    });
  const largeEnoughFaces = ranked.filter((face) => face.areaRatio >= config.minFaceAreaRatio);
  const candidates = dedupeOverlappingFaces(largeEnoughFaces.length > 0 ? largeEnoughFaces : ranked);

  if (candidates.length <= 1) return candidates[0] || null;

  const [largest, secondLargest] = candidates;
  if (secondLargest.area <= 0 || largest.area >= secondLargest.area * config.dominantFaceAreaRatio) {
    return largest;
  }

  const largestIsClearlyMoreCentral =
    largest.area >= secondLargest.area * 1.5 && largest.centerDistance + 0.2 < secondLargest.centerDistance;

  return largestIsClearlyMoreCentral ? largest : null;
}

function consentAccepted(value: FormDataEntryValue | boolean | null) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function acceptedImageFile(file: File) {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(extension));
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

function albumResult(album: GalleryAlbum) {
  return {
    id: album.id,
    slug: album.slug,
    title: album.title,
    photoCount: album.photoCount,
  };
}

function finish(job: FaceSearchJob, patch: Partial<FaceSearchJob>) {
  Object.assign(job, patch, {
    completedAt: new Date().toISOString(),
    expiresAt: Date.now() + readConfig().resultTtlSeconds * 1000,
  });
}

function cleanupExpiredJobs() {
  const now = Date.now();
  for (const [requestId, job] of jobs.entries()) {
    if (job.expiresAt < now) jobs.delete(requestId);
  }
}

async function cleanupStaleUploads() {
  const config = readConfig();
  if (!isDatabaseConfigured(config)) return;

  const olderThan = new Date(Date.now() - config.staleUploadTtlSeconds * 1000).toISOString();
  const assetIds = await findTemporaryFaceSearchAssets({
    deviceId: config.deviceId,
    olderThan,
  });

  if (assetIds.length > 0) await deleteImmichAssets(assetIds, { force: true });
}

async function uploadSelfie(file: File) {
  const config = readConfig();
  const safeOriginal = sanitizeImmichGalleryFilename(file.name, "profile-photo.jpg");
  const extension = safeOriginal.includes(".") ? safeOriginal.split(".").pop() : "jpg";
  const filename = `face-search-${Date.now()}.${extension}`;
  const timestamp = new Date().toISOString();

  const uploaded = await uploadImmichAsset({
    assetData: file,
    filename,
    mimeType: file.type || "image/jpeg",
    deviceAssetId: `${config.deviceId}-${crypto.randomUUID()}`,
    deviceId: config.deviceId,
    createdAt: timestamp,
    visibility: "archive",
  });

  if (!uploaded?.id) {
    throw new FaceSearchError(502, "Immich did not return an uploaded asset id.", "face_search_upload_failed");
  }

  if (uploaded.status === "duplicate") {
    throw new FaceSearchError(
      409,
      "This photo already exists in Immich. Upload a different clear selfie.",
      "face_search_duplicate_upload",
    );
  }

  return {
    id: uploaded.id,
    shouldDelete: true,
  };
}

async function waitForAssetPreview(assetId: string, deadline: number) {
  const config = readConfig();
  while (Date.now() < deadline) {
    if (await assetHasPreview(assetId)) return true;
    await sleep(config.pollIntervalMs);
  }

  return false;
}

async function waitForFaceEmbeddings(assetId: string, deadline: number) {
  const config = readConfig();
  while (Date.now() < deadline) {
    const faces = await getAssetFaceEmbeddings(assetId);
    if (faces.length > 0) return faces;
    await sleep(config.pollIntervalMs);
  }

  return null;
}

async function runJob(job: FaceSearchJob, { slug, file }: { slug: string; file: File }) {
  const config = readConfig();
  let uploadedAssetId: string | null = null;
  let shouldDeleteUploadedAsset = false;

  try {
    const album = await getImmichGalleryAlbum(slug);
    if (!album) {
      finish(job, {
        status: "failed",
        errorCode: "album_not_found",
        message: "This album does not exist or is not public.",
      });
      return;
    }

    const indexedFaceCount = await countAlbumIndexedFaces(album.id);
    if (indexedFaceCount === 0) {
      finish(job, {
        status: "no_indexed_faces",
        album: albumResult(album),
        matches: [],
        message: "This album does not have indexed faces in Immich yet.",
      });
      return;
    }

    const uploaded = await uploadSelfie(file);
    uploadedAssetId = uploaded.id;
    shouldDeleteUploadedAsset = uploaded.shouldDelete;
    const processingDeadline = Date.now() + config.timeoutSeconds * 1000;

    await runImmichAssetJob([uploadedAssetId], "regenerate-thumbnail").catch(() => null);
    const hasPreview = await waitForAssetPreview(uploadedAssetId, processingDeadline);
    if (!hasPreview) {
      finish(job, {
        status: "timeout",
        album: albumResult(album),
        matches: [],
        message: "Immich could not prepare the temporary photo in time.",
      });
      return;
    }

    await runImmichAssetJob([uploadedAssetId], "refresh-faces").catch(() => null);
    const faces = await waitForFaceEmbeddings(uploadedAssetId, processingDeadline);
    if (!faces) {
      finish(job, {
        status: "timeout",
        album: albumResult(album),
        matches: [],
        message: "Immich is still processing face recognition.",
      });
      return;
    }

    const selectedFace = selectProfileFace(faces, config);
    if (!selectedFace) {
      finish(job, {
        status: "multiple_faces",
        album: albumResult(album),
        matches: [],
        message: "The uploaded photo contains multiple clear faces.",
      });
      return;
    }

    const matches = await findAlbumFaceMatches({
      albumId: album.id,
      embedding: selectedFace.embedding,
      maxDistance: config.maxDistance,
      limit: config.maxResults,
    });
    const photosById = new Map(album.photos.map((photo) => [photo.id, photo]));
    const publicMatches = matches
      .map((match) => {
        const photo = photosById.get(match.assetId);
        if (!photo) return null;

        return {
          photo,
          distance: match.distance,
          score: scoreFromDistance(match.distance),
        };
      })
      .filter((match): match is FaceSearchMatch => Boolean(match));

    finish(job, {
      status: publicMatches.length > 0 ? "matched" : "no_match",
      album: albumResult(album),
      matches: publicMatches,
      message:
        publicMatches.length > 0
          ? `${publicMatches.length} possible ${publicMatches.length === 1 ? "match" : "matches"} found.`
          : "No match found in this album.",
    });
  } finally {
    if (uploadedAssetId && shouldDeleteUploadedAsset) {
      await deleteImmichAssets([uploadedAssetId], { force: true }).catch(() => null);
    }
  }
}

export function getImmichFaceSearchPublicConfig() {
  const config = readConfig();
  return {
    enabled: config.enabled,
    configured: isDatabaseConfigured(config),
    maxUploadBytes: config.maxUploadBytes,
    timeoutSeconds: config.timeoutSeconds,
    maxDistance: config.maxDistance,
  };
}

export async function startImmichFaceSearch({
  slug,
  file,
  consent,
}: {
  slug: string;
  file: File | null;
  consent: FormDataEntryValue | boolean | null;
}) {
  const config = readConfig();

  if (!config.enabled) throw new FaceSearchError(503, "Face search is disabled.", "face_search_disabled");
  if (!isDatabaseConfigured(config)) {
    throw new FaceSearchError(503, "Face search database access is not configured.", "face_search_db_missing");
  }
  if (!consentAccepted(consent)) {
    throw new FaceSearchError(400, "Consent is required for face search.", "face_search_consent_required");
  }
  if (!file) throw new FaceSearchError(400, "Upload a profile photo to start face search.", "face_search_file_missing");
  if (file.size > config.maxUploadBytes) {
    throw new FaceSearchError(413, "The uploaded profile photo is too large.", "face_search_file_too_large");
  }
  if (!acceptedImageFile(file)) {
    throw new FaceSearchError(415, "Upload a JPEG, PNG, WebP, HEIC, or HEIF image.", "face_search_file_type");
  }

  cleanupExpiredJobs();
  if (jobs.size >= config.maxJobs) {
    throw new FaceSearchError(429, "Too many face search requests are active.", "face_search_busy");
  }
  cleanupStaleUploads().catch(() => null);

  const now = Date.now();
  const job: FaceSearchJob = {
    requestId: crypto.randomUUID(),
    status: "processing",
    createdAt: new Date(now).toISOString(),
    expiresAt: now + config.resultTtlSeconds * 1000,
    message: "Your photo is being processed.",
  };

  jobs.set(job.requestId, job);
  runJob(job, { slug, file }).catch((error) => {
    finish(job, {
      status: "failed",
      errorCode: error instanceof FaceSearchError ? error.code : "face_search_failed",
      message: error instanceof Error ? error.message : "The face search failed.",
    });
  });

  return publicJob(job);
}

export function getImmichFaceSearch(requestId: string) {
  cleanupExpiredJobs();
  const job = jobs.get(requestId);
  if (!job) {
    throw new FaceSearchError(404, "Face search request not found.", "face_search_not_found");
  }

  return publicJob(job);
}

export function immichFaceSearchStatus(error: unknown) {
  if (error instanceof FaceSearchError) {
    return {
      status: error.status,
      message: error.message,
      code: error.code,
    };
  }

  return {
    status: 500,
    message: error instanceof Error ? error.message : "Unknown face search error.",
    code: "face_search_error",
  };
}
