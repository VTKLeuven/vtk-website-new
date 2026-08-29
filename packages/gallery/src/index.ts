export type {
  AmbiguousAlbum,
  DownloadTarget,
  GalleryAlbum,
  GalleryAlbumSummary,
  GalleryPhoto,
} from './types';

export {
  GALLERY_IDS,
  galleryLabel,
  galleryMarker,
  faceSearchConfig,
  foreignMarkers,
  immichConfig,
  immichWebUrl,
  type FaceSearchConfig,
  type GalleryId,
} from './config';

export {
  FaceSearchError,
  createFaceSearchClient,
  faceSearchStatus,
  type FaceSearchClient,
  type FaceSearchMatch,
  type FaceSearchStatus,
  type PublicFaceSearchJob,
} from './face-search';

export {
  GalleryError,
  addImmichAssetsToAlbum,
  deleteImmichAssets,
  downloadImmichOriginal,
  galleryStatus,
  immichJson,
  immichRequest,
  runImmichAssetJob,
  setImmichAlbumCover,
  uploadImmichAsset,
} from './immich';

export { downloadFilenameFromResponse, sanitizeFilename, slugify } from './format';

export {
  TAKEDOWN_LIMITS,
  TAKEDOWN_RATE_LIMIT,
  TAKEDOWN_REASONS,
  TakedownRateLimiter,
  isTakedownReason,
  isValidTakedownEmail,
  parseTakedownSubmission,
  takedownClientKey,
  takedownMailBody,
  takedownReasonLabel,
  withinTakedownWindow,
  type RawTakedownInput,
  type TakedownErrorCode,
  type TakedownParseResult,
  type TakedownReason,
  type TakedownSubmission,
} from './takedown';

export { createGalleryClient, type GalleryClient } from './client';
