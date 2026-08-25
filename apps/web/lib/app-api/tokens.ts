import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * De twee codes die de app in een QR zet.
 *
 * **De pas** is wat een student aan een balie toont: dezelfde code voor zijn
 * bonnetjes en voor zijn broodje. Hij leeft twee minuten en draagt zijn eigen
 * vervaltijd mee, ondertekend. Bewust geen rij in de databank: wat je niet
 * bewaart hoef je ook niet in te trekken, en een pas die je moet intrekken heb je
 * hoe dan ook te laat door.
 *
 * **De fakbar-code** is de omgekeerde richting: die hangt naast de kaartlezer en
 * de student scant hem. Die verloopt dus niet, want hij hangt daar maanden. Dat
 * is een echte beperking en geen detail: wie er een foto van neemt, heeft de code
 * voorgoed. De tegenmaatregel zit niet in het token maar in de check-in zelf, die
 * enkel telt wanneer 't ElixIr op dat moment ook open gemeten wordt en nog steeds
 * maar één keer per bardag. Zie `docs/design-decisions.md`.
 *
 * Zelfde vorm als de tokens in `lib/ticketing/crypto.ts`, met een eigen prefix
 * per soort zodat een code van het ene nooit als het andere kan lezen.
 */

const PASS_PREFIX = "vtkpas1";
const FAK_PREFIX = "vtkfak1";

/** Hoe lang een pas geldig is. Kort genoeg dat een screenshot niets meer doet. */
export const PASS_TTL_SECONDS = 120;

function appTokenSecret(): string {
  const secret = process.env.APP_TOKEN_SECRET?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!secret || secret.length < 24) {
      throw new Error("APP_TOKEN_SECRET must be set to a long random value in production");
    }
    return secret;
  }
  return secret || process.env.BETTER_AUTH_SECRET?.trim() || "vtk-local-app-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", appTokenSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// ── De pas van een student ───────────────────────────────────────────────────

export function createPassToken(userId: string, expiresAt: Date): string {
  const encodedId = Buffer.from(userId, "utf8").toString("base64url");
  const expires = Math.floor(expiresAt.getTime() / 1000).toString(36);
  const payload = `${PASS_PREFIX}.${encodedId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export type PassVerification =
  | { ok: true; userId: string }
  | { ok: false; reason: "PASS_INVALID" | "PASS_EXPIRED" };

/**
 * Onderscheidt bewust "vervalst" van "verlopen". Aan een toog is dat het verschil
 * tussen "vraag hem opnieuw te tonen" en "dit klopt niet"; een balie die beide
 * hetzelfde ziet, gaat de verkeerde vraag stellen.
 */
export function verifyPassToken(rawToken: string, now = new Date()): PassVerification {
  const token = rawToken.trim();
  const [prefix, encodedId, rawExpires, signature, ...rest] = token.split(".");
  if (prefix !== PASS_PREFIX || !encodedId || !rawExpires || !signature || rest.length > 0) {
    return { ok: false, reason: "PASS_INVALID" };
  }

  const payload = `${prefix}.${encodedId}.${rawExpires}`;
  if (!safeEqual(signature, sign(payload))) return { ok: false, reason: "PASS_INVALID" };

  try {
    const userId = Buffer.from(encodedId, "base64url").toString("utf8");
    const expiresAtSeconds = Number.parseInt(rawExpires, 36);
    if (!userId) return { ok: false, reason: "PASS_INVALID" };
    if (!Number.isSafeInteger(expiresAtSeconds)) return { ok: false, reason: "PASS_INVALID" };
    if (expiresAtSeconds * 1000 <= now.getTime()) return { ok: false, reason: "PASS_EXPIRED" };
    return { ok: true, userId };
  } catch {
    return { ok: false, reason: "PASS_INVALID" };
  }
}

// ── De code naast de kaartlezer ──────────────────────────────────────────────

/**
 * De plek draagt een naam zodat er later een tweede lezer bij kan zonder
 * migratie. Vandaag is er één, en die heet `toog`.
 */
export const DEFAULT_FAK_SPOT = "toog";

export function createFakCheckinToken(spot: string = DEFAULT_FAK_SPOT): string {
  const payload = `${FAK_PREFIX}.${encodeURIComponent(spot)}`;
  return `${payload}.${sign(payload)}`;
}

/** De plek uit een geldige code, of `null` bij een vervalste. */
export function verifyFakCheckinToken(rawToken: string): string | null {
  const [prefix, spot, signature, ...rest] = rawToken.trim().split(".");
  if (prefix !== FAK_PREFIX || !spot || !signature || rest.length > 0) return null;
  if (!safeEqual(signature, sign(`${prefix}.${spot}`))) return null;
  try {
    return decodeURIComponent(spot) || null;
  } catch {
    return null;
  }
}
