import 'server-only';

import { createGalleryClient } from '@vtk/gallery';

/**
 * De fotogalerij van 't ElixIr.
 *
 * **Waarom dit een aparte galerij is en geen filter op die van vtk.be.** VTK wil
 * op de hoofdsite enkel geselecteerd, kwalitatief werk; de fakbar wil na elke
 * avond gewoon alles kunnen posten. Dat zijn twee verschillende redacties met
 * twee verschillende lat, en dat lost geen instelling per album op: het moet
 * onmogelijk zijn dat een fakbaralbum per ongeluk op de hoofdsite belandt.
 *
 * Dezelfde Immich-installatie, dezelfde API-sleutel, andere merker. Albums van
 * deze galerij dragen `[fakbar]` in hun beschrijving, die van vtk.be `[gallery]`,
 * en `@vtk/gallery` sluit elkaars albums wederzijds uit. De merker komt hier uit
 * de client en nooit uit een formulier, zodat een upload vanuit deze app niet
 * naar de andere galerij kan schrijven.
 */
export const fakbarGallery = createGalleryClient({
  id: 'fakbar',
  downloadPath: (slug, assetId) =>
    `/api/gallery/albums/${encodeURIComponent(slug)}/photos/${encodeURIComponent(assetId)}/download`,
});
