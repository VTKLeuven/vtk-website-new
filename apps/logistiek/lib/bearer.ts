import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Klopt de `Authorization`-header met `Bearer <secret>`? (S7 uit de audit van
 * november 2026.)
 *
 * In vaste tijd: met `!==` stopt de vergelijking bij het eerste verschillende
 * teken, en dat verschil in antwoordtijd verraadt hoe ver een gok klopte. Beide
 * kanten eerst hashen geeft twee buffers van dezelfde lengte, zodat ook de lengte
 * van het geheim niet uitlekt en `timingSafeEqual` nooit gooit.
 */
export function bearerMatches(header: string | null, secret: string): boolean {
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  const actual = createHash('sha256').update(header ?? '').digest();
  return timingSafeEqual(expected, actual);
}
