import "server-only";

/**
 * Drie goedkope drempels tegen bots op een publiek formulier, in de lijn van
 * het contactformulier: een honeypot, een limiet per IP en een minimale
 * invultijd. Bewust geen captcha, want die kost elke echte bezoeker moeite en
 * zet vaak een derde partij op de pagina.
 *
 * De teller staat in het geheugen van het proces en begint na een herstart
 * opnieuw. Dat is bewust: dit hoeft geen boekhouding te zijn, enkel een
 * drempel, en het scheelt een tabel en een opkuistaak.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 10;
/** Wie een formulier in minder dan dit invult, is geen mens. */
export const MIN_FILL_SECONDS = 3;

type Bucket = { count: number; resetAt: number };

declare global {
  var __formRateLimit: Map<string, Bucket> | undefined;
}

function buckets(): Map<string, Bucket> {
  globalThis.__formRateLimit ??= new Map();
  return globalThis.__formRateLimit;
}

/** Geeft terug of deze inzending nog binnen de limiet valt, en telt ze mee. */
export function withinRateLimit(key: string, now = Date.now()): boolean {
  const store = buckets();

  // Meteen opkuisen wat verlopen is; zonder dit groeit de map met elk IP dat
  // ooit langskwam.
  for (const [existing, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(existing);
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_PER_WINDOW) return false;
  bucket.count += 1;
  return true;
}

/**
 * Het verborgen veld. Een bot vult alles in wat hij tegenkomt; een mens ziet
 * dit veld niet. Bij een treffer doen we alsof het gelukt is: een bot die een
 * foutmelding krijgt, weet dat hij ontdekt is en past zijn volgende poging aan.
 */
export function trippedHoneypot(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function filledTooFast(startedAt: unknown, now = Date.now()): boolean {
  const started = typeof startedAt === "number" ? startedAt : Number(startedAt);
  if (!Number.isFinite(started) || started <= 0) return false;
  return now - started < MIN_FILL_SECONDS * 1000;
}

/** Enkel voor de teller hierboven; nooit opgeslagen naast de inzending. */
export function rateLimitKey(formId: string, ipAddress: string | null): string {
  return `${formId}:${ipAddress ?? "onbekend"}`;
}
