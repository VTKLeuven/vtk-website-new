import "server-only";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { DoorLogResult, DoorMethod } from "@prisma/client";
import { getDoorConfig } from "./door-config";

/**
 * Server-only deurlogica: wie mag de deur openen, en het wegschrijven + samenvatten
 * van de toegangslog. De device-API (`/api/door/*`) en de admin-tab (`/admin/deur`)
 * leunen hierop. Kaartverificatie zelf gebeurt in {@link ./kul-card}.
 */

/**
 * Bepaalt of een gebruiker (op userId, dus zonder sessie) een permissie heeft voor
 * het huidige werkingsjaar. Spiegelt de resolutie uit
 * `packages/auth/src/server/session.ts`: direct toegewezen rollen plus rollen die
 * een post toekent (DEFAULT voor elk lid, LEADER enkel voor de lead). Superadmin
 * short-circuit't naar true.
 */
export async function resolveUserHasPermission(userId: string, code: string): Promise<boolean> {
  const year = currentWorkingYear();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
      active: true,
      roles: {
        where: { year },
        select: {
          role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
        },
      },
      memberships: {
        where: { year },
        select: {
          role: true,
          group: {
            select: {
              roleGrants: {
                select: {
                  kind: true,
                  role: { select: { permissions: { select: { permission: { select: { code: true } } } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!user || !user.active) return false;
  if (user.isSuperAdmin) return true;

  for (const userRole of user.roles) {
    for (const rp of userRole.role.permissions) if (rp.permission.code === code) return true;
  }
  for (const membership of user.memberships) {
    for (const grant of membership.group.roleGrants) {
      if (grant.kind === "LEADER" && membership.role !== "LEAD") continue;
      for (const rp of grant.role.permissions) if (rp.permission.code === code) return true;
    }
  }
  return false;
}

/** Heeft de gebruiker een lopende tijdelijke deurtoegang (venster rond `now`)? */
export async function hasActiveDoorGrant(userId: string, now: Date = new Date()): Promise<boolean> {
  const grant = await prisma.doorAccessGrant.findFirst({
    where: { userId, startsAt: { lte: now }, endsAt: { gt: now } },
    select: { id: true },
  });
  return Boolean(grant);
}

/** De deur openen mag met het `door.open`-recht OF een lopende tijdelijke grant. */
export async function userMayOpenDoor(userId: string, now: Date = new Date()): Promise<boolean> {
  if (await resolveUserHasPermission(userId, "door.open")) return true;
  return hasActiveDoorGrant(userId, now);
}

/** Schrijft één deurgebeurtenis naar de log (kaartscan of remote-open). */
export async function logDoorAccess(entry: {
  method: DoorMethod;
  result: DoorLogResult;
  userId?: string | null;
  rNumber?: string | null;
  cardName?: string | null;
  reason?: string | null;
  offline?: boolean;
  at?: Date;
}): Promise<void> {
  await prisma.doorAccessLog.create({
    data: {
      method: entry.method,
      result: entry.result,
      userId: entry.userId ?? null,
      rNumber: entry.rNumber ?? null,
      cardName: entry.cardName ?? null,
      reason: entry.reason ?? null,
      offline: entry.offline ?? false,
      ...(entry.at ? { at: entry.at } : {}),
    },
  });
}

export type DoorStatWindow = { days: number; card: number; remote: number; total: number };

export type DoorOpenResult =
  | { ok: true }
  | { ok: false; error: "not_configured" | "unreachable" | "pi_error" };

const PI_TIMEOUT_MS = 5000;

/**
 * Stuurt één open-opdracht naar de Pi. Dashboard en Shortcut-API gebruiken
 * bewust dezelfde netwerkcode en foutsemantiek. De Pi antwoordt meteen met 202
 * en houdt daarna zelf de GPIO gedurende `unlockSeconds` actief.
 */
export async function requestDoorOpen(): Promise<DoorOpenResult> {
  const cfg = await getDoorConfig();
  if (!cfg.piUrl || !cfg.deviceSecret) return { ok: false, error: "not_configured" };

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
    return res.ok ? { ok: true } : { ok: false, error: "pi_error" };
  } catch {
    return { ok: false, error: "unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

/** Aantal geslaagde openingen (kaart vs remote) over 1, 7 en 30 dagen. */
export async function getDoorStats(now: Date = new Date()): Promise<DoorStatWindow[]> {
  return Promise.all(
    [1, 7, 30].map(async (days) => {
      const since = new Date(now.getTime() - days * 86_400_000);
      const [card, remote] = await Promise.all([
        prisma.doorAccessLog.count({ where: { result: "ALLOWED", method: "CARD", at: { gte: since } } }),
        prisma.doorAccessLog.count({ where: { result: "ALLOWED", method: "REMOTE", at: { gte: since } } }),
      ]);
      return { days, card, remote, total: card + remote };
    }),
  );
}
