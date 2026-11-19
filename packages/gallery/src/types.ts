import type { AlbumVisibility } from './config';

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

export type GallerySubAlbum = {
  id: string;
  slug: string;
  title: string;
  photoCount: number;
  coverPhoto: GalleryPhoto | null;
  photos: GalleryPhoto[];
  shareUrl: string;
};

export type GallerySubAlbumSummary = Omit<GallerySubAlbum, 'photos' | 'shareUrl'>;

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
  subAlbums?: GallerySubAlbum[];
  /**
   * Privé (`[gallery-private]`): gepubliceerd, maar enkel op zijn eigen adres.
   * `listAlbums()` laat zo'n album weg; zie `privateMarker` in config.ts.
   */
  unlisted?: boolean;
};

export type GalleryAlbumSummary = Omit<GalleryAlbum, 'photos' | 'shareUrl' | 'subAlbums'> & {
  subAlbums?: GallerySubAlbumSummary[];
};

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

/**
 * Een album zoals het beheerscherm het nodig heeft: recht uit Immich, zonder
 * groepering, zonder gedeelde link en buiten de momentopname om. Dit is de
 * enige manier om een album te zien dat van de site gehaald is, want dat valt
 * per definitie uit de momentopname.
 */
export type ManageableAlbum = {
  id: string;
  title: string;
  /** De ruwe beschrijving, merkers inbegrepen. */
  description: string;
  /** De beschrijving zonder merkers, zoals ze op de site zou staan. */
  publicDescription: string;
  photoCount: number;
  /** De stand van dit album, of `null` wanneer het niet bij deze galerij hoort. */
  visibility: AlbumVisibility | null;
  /** Staat het album niet op de site (`[gallery-uit]`)? */
  hidden: boolean;
  parent?: string;
  tab?: string;
};

/** Eén Immich-album binnen een album uit het beheer: het album zelf of een tab. */
export type AdminAlbumPart = {
  id: string;
  /** De naam van de tab zoals de site ze toont; de albumtitel als er geen tabs zijn. */
  name: string;
  photoCount: number;
  hidden: boolean;
};

/**
 * Een album zoals de lijst in het mediabeheer het toont: gegroepeerd zoals op de
 * site (een album met zijn tabs is één rij), maar met de verborgen albums erbij
 * en zonder foto's, gedeelde links of momentopname.
 */
export type AdminAlbum = {
  /** Het hoofdalbum in Immich. */
  id: string;
  /** Het adres op de site (`/media/<slug>`), zoals de momentopname het toekent. */
  slug: string;
  title: string;
  /** De beschrijving zonder merkers. */
  description: string;
  /** De vroegste datum van de foto's, uit Immich. */
  date: string | null;
  photoCount: number;
  /** Op de site, enkel via zijn adres, of verborgen; de stand van het hoofdalbum. */
  visibility: AlbumVisibility;
  /** Staat het album van de site af (`[gallery-uit]` op het hoofdalbum)? */
  hidden: boolean;
  /** De cover zoals Immich ze bijhoudt, om een duimnagel te tonen zonder gedeelde link. */
  coverAssetId: string | null;
  /** Eén deel wanneer het album geen tabs heeft; anders het hoofdalbum eerst. */
  parts: AdminAlbumPart[];
  /** Draagt het hoofdalbum een eigen `[tab:]`? Zonder heet zijn tab "Algemeen". */
  hasOwnTabName: boolean;
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
