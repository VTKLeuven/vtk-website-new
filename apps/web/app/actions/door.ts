"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { requirePermission } from "@/lib/session";
import { getDoorConfig } from "@/lib/door-config";
import { logDoorAccess } from "@/lib/door-server";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

export type ActionResult = { ok: true } | { ok: false; error: string };

const PI_TIMEOUT_MS = 5000;

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

  const cfg = await getDoorConfig();
  if (!cfg.piUrl || !cfg.deviceSecret) {
    return { ok: false, error: "not_configured" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PI_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.piUrl}/open`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.deviceSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ unlockSeconds: cfg.unlockSeconds }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: "pi_error" };
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }

  await logDoorAccess({ method: "REMOTE", result: "ALLOWED", userId: session.user.id });
  return { ok: true };
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
