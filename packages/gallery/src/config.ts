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

// -----------------------------------------------------------------------------
// Gezichtszoekfunctie
// -----------------------------------------------------------------------------

export type FaceSearchConfig = {
  /**
   * Biometrische verwerking staat per galerij apart aan en standaard uit.
   *
   * **Waarom per galerij en niet één vlag voor alles.** Een gezichtssjabloon is
   * een bijzonder persoonsgegeven (art. 9 AVG) en de audit van 2026-07-18 eist
   * per verwerking een DPIA, een grondslag, een kennisgeving aan wie in de
   * albums staat en een bezwaarroute. De galerij van vtk.be en die van 't ElixIr
   * zijn twee verschillende publieken met twee verschillende albums; de ene
   * aanzetten mag de andere daarom niet stilzwijgend openen.
   *
   * De waarde moet exact `true` zijn. Een ontbrekende, lege of anders gespelde
   * waarde houdt de functie uit.
   */
  enabled: boolean;
  database: { host: string; port: number; database: string; user: string; password: string };
  maxUploadBytes: number;
  timeoutSeconds: number;
  pollIntervalMs: number;
  resultTtlSeconds: number;
  staleUploadTtlSeconds: number;
  maxJobs: number;
  maxDistance: number;
  maxResults: number;
  minFaceAreaRatio: number;
  dominantFaceAreaRatio: number;
  /**
   * Waaronder de tijdelijke selfie in Immich terechtkomt. **Per galerij
   * verschillend en dat is geen cosmetica:** het opruimen van blijven hangende
   * uploads verwijdert alles van dit toestel-id dat ouder is dan de TTL. Deelden
   * twee galerijen dat id, dan zou het opruimen van de ene de selfie van de
   * andere onder een lopende zoekopdracht vandaan wissen.
   */
  deviceId: string;
};

const FACE_SEARCH_ENV: Record<GalleryId, { enabledEnv: string; deviceIdEnv: string; defaultDeviceId: string }> = {
  main: {
    enabledEnv: 'GALLERY_FACE_SEARCH_ENABLED',
    deviceIdEnv: 'GALLERY_FACE_SEARCH_DEVICE_ID',
    defaultDeviceId: 'vtk-gallery-face-search',
  },
  fakbar: {
    enabledEnv: 'GALLERY_FAKBAR_FACE_SEARCH_ENABLED',
    deviceIdEnv: 'GALLERY_FAKBAR_FACE_SEARCH_DEVICE_ID',
    defaultDeviceId: 'vtk-fakbar-face-search',
  },
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * De instellingen van de gezichtszoekfunctie voor één galerij.
 *
 * De verbinding met de Immich-databank en de afstelling (drempels, timeouts)
 * zijn gedeeld: het is dezelfde installatie en hetzelfde model. Enkel de
 * aan/uit-vlag en het toestel-id staan per galerij.
 */
export function faceSearchConfig(id: GalleryId): FaceSearchConfig {
  const names = FACE_SEARCH_ENV[id];

  return {
    enabled: process.env[names.enabledEnv] === 'true',
    database: {
      host: process.env.GALLERY_DATABASE_HOST || '',
      port: positiveInteger(process.env.GALLERY_DATABASE_PORT, 5432),
      database: process.env.GALLERY_DATABASE_NAME || '',
      user: process.env.GALLERY_DATABASE_USER || '',
      password: process.env.GALLERY_DATABASE_PASSWORD || '',
    },
    maxUploadBytes: positiveInteger(process.env.GALLERY_FACE_SEARCH_MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
    timeoutSeconds: positiveInteger(process.env.GALLERY_FACE_SEARCH_TIMEOUT_SECONDS, 240),
    pollIntervalMs: positiveInteger(process.env.GALLERY_FACE_SEARCH_POLL_INTERVAL_MS, 2500),
    resultTtlSeconds: positiveInteger(process.env.GALLERY_FACE_SEARCH_RESULT_TTL_SECONDS, 15 * 60),
    staleUploadTtlSeconds: positiveInteger(process.env.GALLERY_FACE_SEARCH_STALE_UPLOAD_TTL_SECONDS, 60 * 60),
    maxJobs: positiveInteger(process.env.GALLERY_FACE_SEARCH_MAX_JOBS, 50),
    // Een lege waarde geeft via Number("") een keurige 0, en die is eindig; de
    // eerdere `Number.isFinite`-controle liet dat door en zette de drempel dan
    // op 0, waarna geen enkele foto ooit nog matchte. Een afstand moet positief
    // zijn, dus dezelfde controle als de rest.
    maxDistance: positiveNumber(process.env.GALLERY_FACE_MATCH_MAX_DISTANCE, 0.42),
    maxResults: positiveInteger(process.env.GALLERY_FACE_MATCH_MAX_RESULTS, 80),
    minFaceAreaRatio: positiveNumber(process.env.GALLERY_FACE_SEARCH_MIN_FACE_AREA_RATIO, 0.008),
    dominantFaceAreaRatio: positiveNumber(process.env.GALLERY_FACE_SEARCH_DOMINANT_FACE_AREA_RATIO, 2.2),
    deviceId: process.env[names.deviceIdEnv] || names.defaultDeviceId,
  };
}
