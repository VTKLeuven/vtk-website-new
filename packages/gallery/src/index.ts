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
  foreignMarkers,
  immichConfig,
  immichWebUrl,
  type GalleryId,
} from './config';

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

export { createGalleryClient, type GalleryClient } from './client';
