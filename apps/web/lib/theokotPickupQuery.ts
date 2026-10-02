/**
 * Wat een shifter in het veld van de afhaalbalie tikt, als het geen kaart en
 * geen pas is: een r-nummer of een (stuk van een) naam.
 *
 * Puur, zodat het zonder database te testen is; de opzoeking zelf staat in
 * `lib/theokot-pickup.ts`.
 */

/**
 * Een volledig r-nummer (of u-nummer) in de vorm waarin we het bewaren, of null.
 * Aan de balie tikt iemand al eens "R0123456", "r 0123456" of enkel de zeven
 * cijfers; dat is allemaal hetzelfde nummer.
 */
export function normalizeRNumber(raw: string): string | null {
  const compact = raw.replace(/\s+/g, "").toLowerCase();
  if (/^[ru]\d{7}$/.test(compact)) return compact;
  if (/^\d{7}$/.test(compact)) return `r${compact}`;
  return null;
}

/** Hoeveel woorden een zoekopdracht hoogstens telt; de rest wordt genegeerd. */
const MAX_TERMS = 5;

/**
 * De woorden van een naamzoekopdracht. Elk woord moet ergens in de naam of het
 * r-nummer voorkomen, dus "jan pee" vindt Jan Peeters en "peeters jan" ook.
 */
export function pickupSearchTerms(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS);
}
