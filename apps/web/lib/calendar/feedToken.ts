import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const CALENDAR_FEED_TOKEN_PREFIX = "vtk_cal_";
export const MAX_ACTIVE_CALENDAR_FEED_TOKENS = 5;

/**
 * Een agenda-client stuurt geen cookies mee, dus het geheim zit in de URL zelf.
 * Daarom 256 bits: de URL komt in agenda-instellingen, back-ups en soms in
 * server-logs terecht, en moet niet te raden zijn.
 */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^vtk_cal_[A-Za-z0-9_-]{43}$/;

export function createCalendarFeedToken(): string {
  return `${CALENDAR_FEED_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

/** Deterministische lookup-hash; een random token van 256 bits heeft geen salt nodig. */
export function hashCalendarFeedToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Valideert het formaat voor we de database raadplegen. Zonder deze check zou elk
 * pad onder /feed/me/ een query kosten.
 */
export function isCalendarFeedToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * `lastUsedAt` hoeft niet bij elke poll geschreven te worden: elke geabonneerde
 * client haalt de feed elk uur op, en het veld dient enkel om te zien of een
 * token nog gebruikt wordt. Eén schrijfactie per uur volstaat ruim.
 */
const LAST_USED_THROTTLE_MS = 60 * 60 * 1000;

export function shouldTouchLastUsed(lastUsedAt: Date | null, now = new Date()): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() - lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;
}
