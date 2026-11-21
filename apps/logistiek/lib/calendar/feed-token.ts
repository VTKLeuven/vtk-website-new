import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/**
 * De sleutel van een agendafeed op de transportplanning (A1).
 *
 * Dezelfde opzet als `apps/web/lib/calendar/feedToken.ts`, en om dezelfde reden:
 * een agenda-client stuurt geen cookies mee, dus het geheim zit in de URL zelf.
 * Die URL komt in agenda-instellingen, back-ups en soms in server-logs terecht,
 * dus 256 bits: niet te raden, ook niet met veel pogingen.
 *
 * Een eigen prefix (`vtk_log_`) zodat je aan een token dat ergens opduikt kan
 * zien waar het bij hoort, en zodat een token van de hoofdsite hier nooit per
 * ongeluk werkt.
 */

export const FEED_TOKEN_PREFIX = 'vtk_log_';

/** Meer dan genoeg: één per toestel plus een reserve. Belet een volle tabel. */
export const MAX_ACTIVE_FEED_TOKENS = 5;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^vtk_log_[A-Za-z0-9_-]{43}$/;

export function createFeedToken(): string {
  return `${FEED_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`;
}

/** Deterministische lookup-hash; een random token van 256 bits heeft geen salt nodig. */
export function hashFeedToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Valideert het formaat vóór we de databank raadplegen. Zonder deze check kost
 * elk willekeurig pad onder de feed-route een query.
 */
export function isFeedToken(value: string): boolean {
  return TOKEN_PATTERN.test(value);
}

/**
 * `lastUsedAt` hoeft niet bij elke poll geschreven te worden: een geabonneerde
 * client haalt de feed elk uur op, en het veld dient enkel om te zien of een
 * abonnement nog leeft. Eén schrijfactie per uur volstaat ruim.
 */
const LAST_USED_THROTTLE_MS = 60 * 60 * 1000;

export function shouldTouchLastUsed(lastUsedAt: Date | null, now = new Date()): boolean {
  if (!lastUsedAt) return true;
  return now.getTime() - lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;
}

/**
 * Een abonnement dat zo lang niemand ophaalde, staat in geen enkele agenda
 * meer: een geabonneerde client haalt de feed om de paar uur op. Het token
 * blijft dan nog jaren geldig in een oude back-up of een vergeten toestel, met
 * namen, adressen en telefoonnummers erachter. Dus vervalt het vanzelf.
 */
export const FEED_IDLE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Nooit opgehaald telt vanaf het aanmaken. */
export function isFeedTokenExpired(
  token: { lastUsedAt: Date | null; createdAt: Date },
  now = new Date()
): boolean {
  const last = token.lastUsedAt ?? token.createdAt;
  return now.getTime() - last.getTime() > FEED_IDLE_DAYS * DAY_MS;
}

/**
 * Dezelfde regel als `isFeedTokenExpired`, als `where` voor de databank: de
 * abonnementen die nog tellen voor het maximum per persoon. Een vervallen
 * token neemt geen plaats meer in.
 */
export function liveFeedTokenWhere(now = new Date()): Prisma.UitleenFeedTokenWhereInput {
  const cutoff = new Date(now.getTime() - FEED_IDLE_DAYS * DAY_MS);
  return {
    revokedAt: null,
    OR: [{ lastUsedAt: { gte: cutoff } }, { lastUsedAt: null, createdAt: { gte: cutoff } }],
  };
}
