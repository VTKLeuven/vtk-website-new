export type {
  AmbiguousAlbum,
  DownloadTarget,
  GalleryAlbum,
  GalleryAlbumSummary,
  GalleryPhoto,
  GallerySubAlbum,
  GallerySubAlbumSummary,
  ManageableAlbum,
} from './types';

export {
  GALLERY_IDS,
  galleryLabel,
  galleryMarker,
  hiddenMarker,
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
  deleteImmichAlbum,
  deleteImmichAssets,
  downloadImmichOriginal,
  galleryStatus,
  getImmichAssetThumbnail,
  immichJson,
  immichRequest,
  removeImmichAssetsFromAlbum,
  runImmichAssetJob,
  succeededAssetIds,
  setImmichAlbumCover,
  updateImmichAlbum,
  uploadImmichAsset,
  type ImmichBulkIdResult,
} from './immich';

export {
  downloadFilenameFromResponse,
  parseAlbumMarkers,
  sanitizeFilename,
  setMarker,
  slugify,
  stripMarkers,
  swapMarker,
  type AlbumMarkerName,
  type ParsedAlbumMarkers,
} from './format';
export { groupAlbums, type MappedAlbumEntry } from './grouping';

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

export {
  classifyImmichAlbum,
  getImmichStorageReport,
  type ImmichAlbumKind,
  type ImmichAlbumUsage,
  type ImmichDiskUsage,
  type ImmichGalleryUsage,
  type ImmichLibraryUsage,
  type ImmichSource,
  type ImmichSourceFailure,
  type ImmichStorageReport,
} from './storage';
