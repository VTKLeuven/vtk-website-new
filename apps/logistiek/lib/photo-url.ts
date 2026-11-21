/**
 * Waar een foto van de catalogus te laden is, op volle grootte of als
 * thumbnail (P2 uit de audit van november 2026).
 *
 * De catalogus laadde elke foto als JPEG van 1200 px, allemaal tegelijk: een
 * gevulde catalogus haalde bij het openen elk beeld volledig binnen. Naast elke
 * opgeladen foto staat nu een thumbnail van 400 px (`thumbKey`), die het
 * rooster laadt, lui en met vaste afmetingen.
 *
 * Een afgeleide key, en geen eigen kolom: `uitleen/` staat niet in de opruiming
 * van de bucket (`CLEANUP_PREFIXES` in apps/web), dus een key die enkel in de
 * code bestaat, verdwijnt daar niet. Een foto van vóór de thumbnails krijgt zijn
 * thumbnail bij de eerste vraag (`app/api/media/[...key]/route.ts`).
 */

/** De breedte van een thumbnail; het rooster toont hoogstens 400 px per kaart. */
export const THUMB_WIDTH = 400;

const THUMB_SUFFIX = '.thumb.jpg';

/** De thumbnail van een opgeladen foto, of `null` voor iets wat er geen heeft (een pdf). */
export function thumbKey(key: string): string | null {
  if (!key.startsWith('uitleen/') || !key.endsWith('.jpg') || key.endsWith(THUMB_SUFFIX)) return null;
  return `${key.slice(0, -'.jpg'.length)}${THUMB_SUFFIX}`;
}

/** De foto waarvan dit de thumbnail is, of `null` voor een gewone key. */
export function originalOfThumb(key: string): string | null {
  if (!key.startsWith('uitleen/') || !key.endsWith(THUMB_SUFFIX)) return null;
  return `${key.slice(0, -THUMB_SUFFIX.length)}.jpg`;
}

export function mediaUrl(key: string): string {
  return `/api/media/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** De thumbnail als die er kan zijn, anders de foto zelf. */
export function thumbUrl(key: string): string {
  return mediaUrl(thumbKey(key) ?? key);
}
