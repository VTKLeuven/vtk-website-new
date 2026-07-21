"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { logDoorAccess, requestDoorOpen } from "@/lib/door-server";
import {
  createDoorShortcutToken,
  doorShortcutExpiry,
  hashDoorShortcutToken,
  MAX_ACTIVE_DOOR_SHORTCUT_TOKENS,
} from "@/lib/door-shortcut";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Revalidatie van de deur-adminpagina in beide locales na een grant-wijziging. */
function revalidateDoorAdmin() {
  revalidatePath("/admin/deur");
  revalidatePath("/en/admin/deur");
}

/**
 * Opent de deur op afstand vanaf het dashboard. De server roept de listener van de
 * Raspberry Pi rechtstreeks aan over Tailscale (near-instant, geen polling), met
 * het gedeelde device-secret als Bearer, en logt de opening. Enkel voor houders
 * van `door.remoteOpen`.
 *
 * Foutcodes (`not_configured` / `unreachable` / `pi_error`) worden clientside op
 * een vertaalde melding gemapt.
 */
export async function openDoorRemoteAction(): Promise<ActionResult> {
  const session = await requirePermission("door.remoteOpen");

  const result = await requestDoorOpen();
  if (!result.ok) return result;

  await logDoorAccess({ method: "REMOTE", result: "ALLOWED", userId: session.user.id });
  return { ok: true };
}

export type CreateDoorShortcutTokenResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; error: "invalid_label" | "too_many_tokens" };

/** Maakt een persoonlijk Shortcut-token; de ruwe waarde verlaat deze action exact één keer. */
export async function createDoorShortcutTokenAction(
  formData: FormData,
): Promise<CreateDoorShortcutTokenResult> {
  const session = await requirePermission("door.remoteOpen");
  const label = String(formData.get("label") ?? "").trim().replace(/\s+/g, " ");
  if (label.length < 1 || label.length > 80) return { ok: false, error: "invalid_label" };

  const now = new Date();
  const activeCount = await prisma.doorShortcutToken.count({
    where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: now } },
  });
  if (activeCount >= MAX_ACTIVE_DOOR_SHORTCUT_TOKENS) {
    return { ok: false, error: "too_many_tokens" };
  }

  const token = createDoorShortcutToken();
  const expiresAt = doorShortcutExpiry(now);
  await prisma.doorShortcutToken.create({
    data: {
      userId: session.user.id,
      label,
      tokenHash: hashDoorShortcutToken(token),
      expiresAt,
    },
  });

  revalidatePath("/account");
  revalidatePath("/en/account");
  return { ok: true, token, expiresAt: expiresAt.toISOString() };
}

/** Trekt alleen een token van de ingelogde gebruiker in. */
export async function revokeDoorShortcutTokenAction(formData: FormData): Promise<void> {
  const session = await requirePermission("door.remoteOpen");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await prisma.doorShortcutToken.updateMany({
    where: { id, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/account");
  revalidatePath("/en/account");
}

/**
 * Kent tijdelijke deurtoegang toe (venster start/eind). Voor houders van
 * `door.manage`. Verwachte invoerfouten komen als `saveError(code)` terug (rode
 * toast), niet als throw.
 */
export async function grantDoorAccessAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const session = await requirePermission("door.manage");

  const userId = String(formData.get("userId") ?? "").trim();
  const startsRaw = String(formData.get("startsAt") ?? "").trim();
  const endsRaw = String(formData.get("endsAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!userId) return saveError("no_user");

  // datetime-local-waarden worden als lokale tijd (Europe/Brussels van de beheerder)
  // geinterpreteerd door de browser; new Date(...) leest ze in de servertijdzone.
  const startsAt = startsRaw ? new Date(startsRaw) : new Date();
  const endsAt = endsRaw ? new Date(endsRaw) : new Date(NaN);
  if (Number.isNaN(endsAt.getTime())) return saveError("bad_dates");
  if (endsAt <= startsAt) return saveError("bad_dates");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return saveError("no_user");

  await prisma.doorAccessGrant.create({
    data: { userId, startsAt, endsAt, note: note || null, createdById: session.user.id },
  });

  revalidateDoorAdmin();
  return saveOk();
}

/** Trekt een tijdelijke deurtoegang in. Plain action voor DeleteIconButton. */
export async function revokeDoorGrantAction(formData: FormData): Promise<void> {
  await requirePermission("door.manage");
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  await prisma.doorAccessGrant.deleteMany({ where: { id } });
  revalidateDoorAdmin();
}
