import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ticketTokenSecret } from "./config";

const ORDER_PREFIX = "vtko2";
const TICKET_PREFIX = "vtkt1";
const INVITE_PREFIX = "vtks1";

function sign(value: string): string {
  return createHmac("sha256", ticketTokenSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createOrderAccessToken(orderId: string, expiresAt: Date): string {
  const encodedId = Buffer.from(orderId, "utf8").toString("base64url");
  const expires = Math.floor(expiresAt.getTime() / 1000).toString(36);
  const payload = `${ORDER_PREFIX}.${encodedId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyOrderAccessToken(
  token: string,
  expectedOrderId?: string,
  now = new Date()
): string | null {
  const [prefix, encodedId, rawExpires, signature, ...rest] = token.split(".");
  if (prefix !== ORDER_PREFIX || !encodedId || !rawExpires || !signature || rest.length > 0) {
    return null;
  }
  const payload = `${prefix}.${encodedId}.${rawExpires}`;
  const expected = sign(payload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const orderId = Buffer.from(encodedId, "base64url").toString("utf8");
    const expiresAtSeconds = Number.parseInt(rawExpires, 36);
    if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds * 1000 <= now.getTime()) {
      return null;
    }
    if (!orderId || (expectedOrderId && orderId !== expectedOrderId)) return null;
    return orderId;
  } catch {
    return null;
  }
}

/**
 * De uitnodiging waarmee iemand aan de deur scanrechten krijgt.
 *
 * Zelfde vorm als het order-token hierboven, met een eigen prefix: de vervaltijd
 * zit in de payload en wordt mee ondertekend. Bewust géén rij in de databank; dit
 * token leeft enkele tellen, en wat je niet bewaart hoef je ook niet in te
 * trekken.
 *
 * **Rollend.** Het paneel dat de QR toont, haalt om de twintig seconden een nieuw
 * token op. Daardoor is een screenshot of een foto in een groepschat vrijwel
 * altijd al dood. Wees eerlijk over de grens: wie de code binnen die seconden
 * doorstuurt, geraakt er wel mee binnen. Dat geldt voor elke code die je aan een
 * zaal toont.
 */
export function createScannerInviteToken(eventId: string, expiresAt: Date): string {
  const encodedId = Buffer.from(eventId, "utf8").toString("base64url");
  const expires = Math.floor(expiresAt.getTime() / 1000).toString(36);
  const payload = `${INVITE_PREFIX}.${encodedId}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Het event uit een uitnodiging, of `null` bij een verlopen of vervalst token. */
export function verifyScannerInviteToken(token: string, now = new Date()): string | null {
  const [prefix, encodedId, rawExpires, signature, ...rest] = token.split(".");
  if (prefix !== INVITE_PREFIX || !encodedId || !rawExpires || !signature || rest.length > 0) {
    return null;
  }
  const payload = `${prefix}.${encodedId}.${rawExpires}`;
  if (!safeEqual(signature, sign(payload))) return null;

  try {
    const eventId = Buffer.from(encodedId, "base64url").toString("utf8");
    const expiresAtSeconds = Number.parseInt(rawExpires, 36);
    if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds * 1000 <= now.getTime()) {
      return null;
    }
    return eventId || null;
  } catch {
    return null;
  }
}

export function createTicketCredential(publicId: string, version: number): string {
  const payload = `${TICKET_PREFIX}.${publicId}.${version}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyTicketCredential(
  rawCredential: string
): { publicId: string; version: number } | null {
  const credential = extractTicketCredential(rawCredential);
  const [prefix, publicId, rawVersion, signature, ...rest] = credential.split(".");
  if (prefix !== TICKET_PREFIX || !publicId || !rawVersion || !signature || rest.length > 0) {
    return null;
  }
  const version = Number.parseInt(rawVersion, 10);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  const payload = `${prefix}.${publicId}.${version}`;
  if (!safeEqual(signature, sign(payload))) return null;
  return { publicId, version };
}

export function extractTicketCredential(value: string): string {
  const trimmed = value.trim();
  const index = trimmed.indexOf(`${TICKET_PREFIX}.`);
  if (index < 0) return trimmed;
  return trimmed.slice(index).split(/[?#\s]/, 1)[0] ?? trimmed;
}

export function credentialFingerprint(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 24);
}

export function secureTokenHash(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex");
}

export function createRequestFingerprint(ipAddress: string): string {
  return createHmac("sha256", ticketTokenSecret())
    .update(ipAddress.trim())
    .digest("hex");
}

export function createPublicTicketId(): string {
  return randomBytes(12).toString("base64url");
}

export function createOrderNumber(now = new Date()): string {
  const year = now.getUTCFullYear().toString().slice(-2);
  const random = randomBytes(5).toString("hex").toUpperCase();
  return `VTK-${year}-${random}`;
}
