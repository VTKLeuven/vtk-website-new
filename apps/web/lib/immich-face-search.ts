import "server-only";

import { createFaceSearchClient, faceSearchStatus } from "@vtk/gallery";
import { getImmichGalleryAlbum } from "@/lib/immich-gallery";

/**
 * Gezichtszoeken in de galerij van vtk.be.
 *
 * De implementatie zelf staat in `@vtk/gallery`, zodat deze galerij en die van
 * 't ElixIr dezelfde code draaien in plaats van twee kopieën. Dit bestand is
 * enkel nog de gevel: dezelfde functienamen als voorheen, zodat de routes en de
 * albumpagina niet hoefden te wijzigen.
 *
 * De vlag blijft `GALLERY_FACE_SEARCH_ENABLED` en staat los van die van de
 * fakbar; zie `faceSearchConfig` in het pakket voor waarom die niet gedeeld is.
 */
const client = createFaceSearchClient({
  id: "main",
  getAlbum: (slug) => getImmichGalleryAlbum(slug),
});

export function getImmichFaceSearchPublicConfig() {
  return client.publicConfig();
}

export function startImmichFaceSearch(input: {
  slug: string;
  file: File | null;
  consent: FormDataEntryValue | boolean | null;
}) {
  return client.start(input);
}

export function getImmichFaceSearch(requestId: string) {
  return client.get(requestId);
}

export function immichFaceSearchStatus(error: unknown) {
  return faceSearchStatus(error);
}
