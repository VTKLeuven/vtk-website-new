import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@vtk/db";

/**
 * Apparaat-tokens waarmee de Windows-app zijn updates ophaalt.
 *
 * Het ruwe token gaat één keer over de lijn, bij het koppelen, en wordt daarna
 * enkel als SHA-256 bewaard. Een kale hash volstaat hier: dit zijn 32
 * willekeurige bytes en geen code van zes cijfers, dus er valt niets terug te
 * rekenen. Opzoeken gebeurt op die hash, wat meteen de unieke index is.
 */

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("base64url");
}

export function newDeviceToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export type DeviceCheck =
  | { ok: true; email: string }
  | { ok: false; reason: "UNKNOWN" | "REVOKED" | "NOT_ALLOWED" };

/**
 * Controleert het token uit de `Authorization`-header.
 *
 * Twee vragen, niet één: bestaat het token nog, en staat het adres er nog op.
 * Zonder die tweede blijft een gekoppelde laptop updates halen nadat de kring
 * van de lijst gehaald is, en dan is intrekken een knop die niets doet.
 *
 * Werkt de controle het token bij met wat de app zegt te draaien, zodat de admin
 * ziet welke computers nog meedoen en op welke versie ze staan.
 */
export async function checkDeviceToken(
  raw: string,
  appVersion: string | null,
): Promise<DeviceCheck> {
  const device = await prisma.urenloopDeviceToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  });
  if (!device) return { ok: false, reason: "UNKNOWN" };
  if (device.revokedAt) return { ok: false, reason: "REVOKED" };

  const allowed = await prisma.urenloopDownloadEmail.findUnique({
    where: { email: device.email },
  });
  if (!allowed) return { ok: false, reason: "NOT_ALLOWED" };

  await prisma.urenloopDeviceToken.update({
    where: { id: device.id },
    data: { lastUsedAt: new Date(), appVersion: appVersion ?? device.appVersion },
  });
  return { ok: true, email: device.email };
}

/** Leest `Authorization: Bearer <token>`; null wanneer de header ontbreekt of anders is. */
export function bearerFrom(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
