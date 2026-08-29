import "server-only";

import { createGalleryClient } from "@vtk/gallery";

/**
 * De fotogalerij van vtk.be.
 *
 * De Immich-laag zelf staat sinds de fakbar-galerij in `@vtk/gallery`: er zijn
 * nu twee galerijen op dezelfde Immich-installatie, en die deelden hier eerst
 * één module-level cache. Dit bestand is enkel nog de gevel voor de hoofdsite,
 * zodat de tien plaatsen die eruit importeren niets hoefden te wijzigen.
 *
 * **Welke albums hier verschijnen** hangt aan de merker `[gallery]` in de
 * albumbeschrijving. Albums van de fakbar dragen `[fakbar]` en komen hier dus
 * niet in; draagt een album beide merkers, dan verschijnt het nergens en zet
 * `listAmbiguousGalleryAlbums()` het in /admin/media in beeld. Zie
 * `packages/gallery/src/config.ts` voor waarom die scheiding hard is.
 */
const gallery = createGalleryClient({
  id: "main",
  downloadPath: (slug, assetId) =>
    `/api/immich-gallery/albums/${encodeURIComponent(slug)}/photos/${encodeURIComponent(assetId)}/download`,
});

export type {
  AmbiguousAlbum,
  GalleryAlbum,
  GalleryAlbumSummary,
  GalleryPhoto,
} from "@vtk/gallery";

export {
  deleteImmichAssets,
  downloadImmichOriginal,
  immichWebUrl,
  runImmichAssetJob,
  setImmichAlbumCover,
  uploadImmichAsset,
} from "@vtk/gallery";

export { galleryStatus as immichGalleryStatus } from "@vtk/gallery";
export { downloadFilenameFromResponse as downloadFilenameFromImmichResponse } from "@vtk/gallery";
export { sanitizeFilename as sanitizeImmichGalleryFilename } from "@vtk/gallery";

export const listImmichGalleryAlbums = gallery.listAlbums;
export const getImmichGalleryAlbum = gallery.getAlbum;
export const getImmichGalleryDownloadTarget = gallery.getDownloadTarget;
export const refreshImmichGallerySnapshot = gallery.refreshSnapshot;
export const createImmichGalleryAlbum = gallery.createAlbum;
export const addImmichAssetsToAlbum = gallery.addAssets;
export const listAmbiguousGalleryAlbums = gallery.listAmbiguousAlbums;
