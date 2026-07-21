import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const DOOR_SHORTCUT_TOKEN_PREFIX = "vtk_door_";
export const DOOR_SHORTCUT_TOKEN_DAYS = 90;
export const DOOR_SHORTCUT_COOLDOWN_SECONDS = 5;
export const MAX_ACTIVE_DOOR_SHORTCUT_TOKENS = 5;

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^vtk_door_[A-Za-z0-9_-]{43}$/;

/** Genereert 256 bits entropy; de volledige waarde wordt slechts één keer getoond. */
export function createDoorShortcutToken(): string {
  return `${DOOR_SHORTCUT_TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
}

/** Deterministische lookup-hash. Een random token van 256 bits heeft geen extra salt nodig. */
export function hashDoorShortcutToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Leest uitsluitend ons vaste Bearer-formaat; cookies en queryparameters tellen niet. */
export function doorShortcutTokenFromAuthorization(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function doorShortcutExpiry(now = new Date()): Date {
  return new Date(now.getTime() + DOOR_SHORTCUT_TOKEN_DAYS * 86_400_000);
}

export function doorShortcutCooldownCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DOOR_SHORTCUT_COOLDOWN_SECONDS * 1_000);
}
