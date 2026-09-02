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

export type GalleryAlbumSummary = Omit<GalleryAlbum, 'photos' | 'shareUrl'>;

/**
 * Een album dat de merker van meer dan één galerij draagt. Het verschijnt
 * nergens, want we kunnen niet weten waar het hoort; het beheer toont deze
 * lijst zodat dat opvalt in plaats van dat de foto's stil wegblijven.
 */
export type AmbiguousAlbum = {
  id: string;
  title: string;
  markers: string[];
};

export type ImmichAsset = {
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
    fileSizeInByte?: number | string | null;
    description?: string | null;
  } | null;
};

export type ImmichAlbumSummary = {
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

export type ImmichSharedLink = {
  id: string;
  key: string;
  type?: string | null;
  albumId?: string | null;
  album?: { id?: string | null } | null;
  allowDownload?: boolean | null;
  showMetadata?: boolean | null;
  description?: string | null;
};

export type ImmichSearchResponse = {
  assets?: {
    items?: ImmichAsset[];
    nextPage?: number | string | null;
  };
};

export type DownloadTarget = {
  album: GalleryAlbum;
  photo: GalleryPhoto;
};
