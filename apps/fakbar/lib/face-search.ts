import 'server-only';

import { createFaceSearchClient } from '@vtk/gallery';
import { fakbarGallery } from '@/lib/gallery';

/**
 * Gezichtszoeken in de fotogalerij van 't ElixIr.
 *
 * Dezelfde motor als op vtk.be (`@vtk/gallery`), met twee harde grenzen:
 *
 * 1. `getAlbum` komt van `fakbarGallery`, dus een slug kan hier enkel een album
 *    met de merker `[fakbar]` opleveren. Een album van de hoofdsite is via deze
 *    route niet te doorzoeken, net zoals een fakbaralbum daar niet opduikt.
 * 2. De aan/uit-vlag is `GALLERY_FAKBAR_FACE_SEARCH_ENABLED` en staat los van
 *    die van vtk.be. Beide staan standaard uit; ze moeten exact `true` zijn.
 *    Biometrische sjablonen zijn bijzondere persoonsgegevens, en de audit van
 *    2026-07-18 eist per verwerking een goedgekeurde DPIA, een grondslag, een
 *    kennisgeving aan wie in de albums staat en een bezwaarroute. Dat is voor
 *    de fakbar een ander publiek en een andere reeks albums dan voor vtk.be.
 */
export const fakbarFaceSearch = createFaceSearchClient({
  id: 'fakbar',
  getAlbum: (slug) => fakbarGallery.getAlbum(slug),
});
