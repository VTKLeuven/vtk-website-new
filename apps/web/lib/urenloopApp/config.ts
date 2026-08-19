import "server-only";

/**
 * De 24urenloop-desktopapp wordt gedeeld met andere kringen, en die mogen hem
 * niet zomaar kunnen downloaden: de repository is privé en de app hoort enkel
 * bij de kringen waarmee we ze delen. De poort staat hier op de website, niet
 * bij de objectopslag: Hetzner kent enkel "publiek" of "privé" en heeft geen
 * begrip van wie er aanklopt.
 *
 * De CI van 24urenloop-new schrijft na elke build naar deze vaste sleutels. Dat
 * de namen geen versie dragen is met opzet: elke build overschrijft de vorige,
 * dus de opslag groeit niet mee met het aantal releases en de sleutels blijven
 * geldig zonder dat iemand iets moet bijwerken.
 */

export const PREFIX = "24ul-app";

export type PlatformId = "windows" | "mac" | "linux";

export type PlatformFile = {
  id: PlatformId;
  /** Bestandsnaam zoals de browser hem opslaat, en meteen de laatste padsegment. */
  filename: string;
  contentType: string;
};

export const PLATFORM_FILES: Record<PlatformId, PlatformFile> = {
  windows: { id: "windows", filename: "24urenloop-Setup.exe", contentType: "application/octet-stream" },
  mac: { id: "mac", filename: "24urenloop-Mac.dmg", contentType: "application/octet-stream" },
  linux: { id: "linux", filename: "24urenloop-Linux.deb", contentType: "application/octet-stream" },
};

export function isPlatformId(value: string): value is PlatformId {
  return value === "windows" || value === "mac" || value === "linux";
}

/** Objectsleutel van een installatiebestand. */
export function platformKey(id: PlatformId): string {
  return `${PREFIX}/${PLATFORM_FILES[id].filename}`;
}

/** Wat de CI naast de bestanden schrijft, zodat de pagina de versie kan tonen. */
export const RELEASE_KEY = `${PREFIX}/release.json`;

export type ReleaseManifest = {
  version: string;
  commit: string;
  builtAt: string;
  files: { name: string; bytes: number }[];
};

/**
 * Bestanden die de Windows-updater ophaalt. Die kan nergens een code intikken,
 * dus draagt hij een apparaat-token dat de app één keer per computer ophaalt;
 * zie `devices.ts`. De lijst blijft kort met opzet: langs deze weg mogen de Mac-
 * en Linux-downloads niet te bereiken zijn.
 */
export const UPDATE_FILES = new Set([
  "latest.yml",
  "24urenloop-Setup.exe",
  "24urenloop-Setup.exe.blockmap",
]);

export function updateKey(filename: string): string | null {
  return UPDATE_FILES.has(filename) ? `${PREFIX}/${filename}` : null;
}

/** Hoe lang een gemailde code bruikbaar blijft. */
export const CODE_TTL_MINUTES = 60;

/** Zoveel foute pogingen en de code is verbrand; zes cijfers zijn anders uit te proberen. */
export const CODE_MAX_ATTEMPTS = 5;

/** Zoveel codes per adres per uur; voorkomt dat iemand een inbox volgooit. */
export const CODE_MAX_PER_HOUR = 5;

/**
 * Hoe lang je na het invoeren van de code mag downloaden. Ruimer dan de code
 * zelf: wie de app op drie computers zet, hoort niet drie keer een mail te
 * moeten aanvragen.
 */
export const ACCESS_TTL_HOURS = 24;

export const ACCESS_COOKIE = "vtk_24ul_dl";
