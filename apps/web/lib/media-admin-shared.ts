/**
 * Wat zowel de server als de clientcomponenten van het mediabeheer nodig
 * hebben. Geen databank en geen Immich hier: dit bestand belandt in de browser.
 */

/** Zo lang blijft iets in de prullenmand van het mediabeheer terug te zetten. */
export const TRASH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Alles wat vóór dit moment in de prullenmand ging, is voorbij zijn termijn. */
export function trashCutoff(now: Date): Date {
  return new Date(now.getTime() - TRASH_DAYS * DAY_MS);
}

/** Hoeveel volle dagen er nog over zijn om iets terug te zetten; nooit minder dan 0. */
export function trashDaysLeft(trashedAt: Date, now: Date): number {
  const left = TRASH_DAYS - Math.floor((now.getTime() - trashedAt.getTime()) / DAY_MS);
  return Math.max(0, Math.min(TRASH_DAYS, left));
}

/**
 * De duimnagel van een foto in het beheer. Loopt met de API-sleutel via de
 * server, zodat ook een verborgen foto of een foto in een verborgen album er
 * een heeft; zie de route zelf.
 */
export function adminThumbnailUrl(assetId: string): string {
  return `/api/admin/immich-gallery/assets/${encodeURIComponent(assetId)}/thumbnail`;
}

/** Hoeveel foto's het albumscherm in één keer toont, en per klik op "meer". */
export const PHOTO_PAGE_SIZE = 96;
