import { prisma } from "@vtk/db";
import {
  doorShortcutCooldownCutoff,
  doorShortcutTokenFromAuthorization,
  hashDoorShortcutToken,
  DOOR_SHORTCUT_COOLDOWN_SECONDS,
} from "@/lib/door-shortcut";
import {
  logDoorAccess,
  requestDoorOpen,
  resolveUserHasPermission,
} from "@/lib/door-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function json(body: Record<string, unknown>, status = 200, headers?: HeadersInit) {
  return Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

/**
 * Publieke machine-endpoint voor een persoonlijke Apple Shortcut.
 *
 * Authenticatie gebeurt uitsluitend met een persoonlijk, gehasht en intrekbaar
 * Bearer-token. Na tokenvalidatie controleren we live `door.remoteOpen`, zodat
 * een rollenwijziging onmiddellijk geldt zonder elk token apart in te trekken.
 */
export async function POST(request: Request) {
  const rawToken = doorShortcutTokenFromAuthorization(request.headers.get("authorization"));
  if (!rawToken) return json({ ok: false, error: "unauthorized" }, 401);

  const token = await prisma.doorShortcutToken.findUnique({
    where: { tokenHash: hashDoorShortcutToken(rawToken) },
    select: {
      id: true,
      userId: true,
      label: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  const now = new Date();
  if (!token || token.revokedAt || token.expiresAt <= now) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  if (!(await resolveUserHasPermission(token.userId, "door.remoteOpen"))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  // Eén atomaire claim voorkomt dat twee bijna gelijktijdige Shortcut-runs
  // allebei de Pi aanroepen. Ook mislukte Pi-calls tellen voor de cooldown om
  // retry-stormen te vermijden.
  const claimed = await prisma.doorShortcutToken.updateMany({
    where: {
      id: token.id,
      revokedAt: null,
      expiresAt: { gt: now },
      OR: [
        { lastUsedAt: null },
        { lastUsedAt: { lte: doorShortcutCooldownCutoff(now) } },
      ],
    },
    data: { lastUsedAt: now },
  });
  if (claimed.count !== 1) {
    return json(
      { ok: false, error: "rate_limited" },
      429,
      { "Retry-After": String(DOOR_SHORTCUT_COOLDOWN_SECONDS) },
    );
  }

  const opened = await requestDoorOpen();
  if (!opened.ok) {
    return json({ ok: false, error: opened.error }, 503);
  }

  await logDoorAccess({
    method: "REMOTE",
    result: "ALLOWED",
    userId: token.userId,
    reason: `shortcut:${token.label}`,
  });
  return json({ ok: true });
}
