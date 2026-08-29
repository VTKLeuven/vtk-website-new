/**
 * Welke fotogalerijen er zijn, en hoe je ze in Immich uit elkaar houdt.
 *
 * Er is één Immich-installatie met één API-sleutel. Een album hoort bij een
 * galerij doordat er een **merker** in zijn beschrijving staat: `[gallery]`
 * voor de galerij op vtk.be, `[fakbar]` voor die van 't ElixIr.
 *
 * **De scheiding is exclusief, niet naamgebaseerd.** Een album hoort bij een
 * galerij wanneer het haar merker draagt én die van geen enkele andere galerij.
 * Zonder die tweede voorwaarde zou één album met beide merkers in beide
 * galerijen opduiken, en dan staan de foto's van de fakbar alsnog op de
 * hoofdsite. Dat is precies wat niet mag: VTK wil enkel geselecteerd werk op
 * vtk.be, de fakbar wil alles kunnen posten. Een album met twee merkers is dus
 * dubbelzinnig en verschijnt nergens; `ambiguousAlbums()` zet het in het beheer
 * in beeld, zodat het niet stil verdwijnt.
 */

export type GalleryId = 'main' | 'fakbar';

export const GALLERY_IDS: readonly GalleryId[] = ['main', 'fakbar'] as const;

type GalleryDefinition = {
  id: GalleryId;
  /** Env-variabele waarmee de merker te overschrijven is. */
  markerEnv: string;
  defaultMarker: string;
  /** Naam voor in beheerschermen. */
  label: string;
};

const DEFINITIONS: Record<GalleryId, GalleryDefinition> = {
  main: {
    id: 'main',
    markerEnv: 'GALLERY_ALBUM_MARKER',
    defaultMarker: '[gallery]',
    label: 'vtk.be',
  },
  fakbar: {
    id: 'fakbar',
    markerEnv: 'GALLERY_FAKBAR_ALBUM_MARKER',
    defaultMarker: '[fakbar]',
    label: "'t ElixIr",
  },
};

export function galleryLabel(id: GalleryId): string {
  return DEFINITIONS[id].label;
}

/**
 * De merker van een galerij. De oude `IMMICH_ALBUM_MARKER` blijft voor de
 * hoofdgalerij aanvaard: die staat in bestaande .env-bestanden.
 */
export function galleryMarker(id: GalleryId): string {
  const definition = DEFINITIONS[id];
  const explicit = process.env[definition.markerEnv]?.trim();
  if (explicit) return explicit;
  if (id === 'main') {
    const legacy = process.env.IMMICH_ALBUM_MARKER?.trim();
    if (legacy) return legacy;
  }
  return definition.defaultMarker;
}

/** De merkers van alle andere galerijen, voor de uitsluiting hierboven. */
export function foreignMarkers(id: GalleryId): string[] {
  return GALLERY_IDS.filter((other) => other !== id)
    .map(galleryMarker)
    .filter((marker) => marker && marker !== galleryMarker(id));
}

export type ImmichConfig = {
  apiUrl: string;
  apiKey: string;
  publicProxyUrl: string;
  cacheTtlSeconds: number;
};

/**
 * De Immich-verbinding zelf. Die is voor alle galerijen dezelfde: één server,
 * één sleutel, één publieke proxy. Enkel de merker verschilt.
 */
export function immichConfig(): ImmichConfig {
  const apiUrl = process.env.GALLERY_IMMICH_API_URL || process.env.IMMICH_API_URL || 'http://localhost:2283/api';
  const apiKey = process.env.GALLERY_IMMICH_API_KEY || process.env.IMMICH_API_KEY || '';
  const publicProxyUrl =
    process.env.GALLERY_PUBLIC_PROXY_URL || process.env.IMMICH_PUBLIC_PROXY_URL || 'http://localhost:3000';
  const ttl = Number(process.env.GALLERY_CACHE_TTL_SECONDS || '60');

  return {
    apiUrl: apiUrl.replace(/\/+$/, ''),
    apiKey,
    publicProxyUrl: publicProxyUrl.replace(/\/+$/, ''),
    cacheTtlSeconds: Number.isFinite(ttl) && ttl >= 0 ? ttl : 60,
  };
}

/** Basis-URL van de Immich-webinterface, voor "open in Immich"-links. */
export function immichWebUrl(): string {
  const explicit = process.env.GALLERY_IMMICH_WEB_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return 'https://immich.vtk.be';
}
