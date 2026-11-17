import { createHash, randomBytes } from "node:crypto";

/**
 * Het geheim van een privélink naar een album. Apart van `media-share.ts`, dat
 * `server-only` is, zodat ook het testdatascript links kan maken; niet in
 * `media-share-shared.ts`, want dat belandt in de browser.
 *
 * 256 bits, net als de agendafeed: de link komt in chats, mails en
 * browsergeschiedenis terecht en mag niet te raden zijn. Base64url geeft altijd
 * 43 tekens, zie `isShareToken`.
 */
export function createShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Deterministische opzoeksleutel; een willekeurig token van 256 bits heeft geen salt nodig. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
