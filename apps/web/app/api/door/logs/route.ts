import { prisma } from "@vtk/db";
import type { DoorLogResult, DoorMethod } from "@prisma/client";
import { isDoorDeviceRequest } from "@/lib/door-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Naflushen van deurgebeurtenissen die de Pi tijdens een outage (site/DB
 * onbereikbaar) lokaal bufferde: scans die op de offline-cache beslist werden of
 * die niet beoordeeld konden worden. De Pi POST't `{ entries: [...] }` met het
 * device-secret als Bearer; wij bewaren ze met `offline: true` en `at` uit de
 * gebufferde gebeurtenis, en koppelen indien mogelijk het r-nummer aan een
 * gebruiker. `/api/door/scan` blijft de bron voor de live (online) logging.
 */

const MAX_ENTRIES = 500;
const RESULTS: DoorLogResult[] = ["ALLOWED", "DENIED", "UNKNOWN_CARD", "ERROR"];
const METHODS: DoorMethod[] = ["CARD", "REMOTE"];

type IncomingEntry = {
  result?: unknown;
  method?: unknown;
  rNumber?: unknown;
  cardName?: unknown;
  reason?: unknown;
  at?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function POST(request: Request) {
  if (!(await isDoorDeviceRequest(request))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let entries: IncomingEntry[] = [];
  try {
    const body = (await request.json()) as { entries?: unknown };
    if (Array.isArray(body.entries)) entries = body.entries.slice(0, MAX_ENTRIES) as IncomingEntry[];
  } catch {
    return Response.json({ error: "BAD_BODY" }, { status: 400 });
  }

  // r-nummers in één keer naar gebruikers vertalen i.p.v. per rij te queryen.
  const rNumbers = [
    ...new Set(entries.map((e) => str(e.rNumber)?.toLowerCase()).filter((r): r is string => Boolean(r))),
  ];
  const users = rNumbers.length
    ? await prisma.user.findMany({ where: { rNumber: { in: rNumbers } }, select: { id: true, rNumber: true } })
    : [];
  const userByRNumber = new Map(users.map((u) => [u.rNumber, u.id] as const));

  const rows = entries
    .map((e) => {
      const result = str(e.result)?.toUpperCase();
      if (!result || !RESULTS.includes(result as DoorLogResult)) return null;
      const method = str(e.method)?.toUpperCase();
      const rNumber = str(e.rNumber)?.toLowerCase() ?? null;
      const atRaw = str(e.at);
      const at = atRaw ? new Date(atRaw) : new Date();
      return {
        method: (method && METHODS.includes(method as DoorMethod) ? method : "CARD") as DoorMethod,
        result: result as DoorLogResult,
        rNumber,
        cardName: str(e.cardName),
        reason: str(e.reason),
        userId: rNumber ? userByRNumber.get(rNumber) ?? null : null,
        at: Number.isNaN(at.getTime()) ? new Date() : at,
        offline: true,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length > 0) await prisma.doorAccessLog.createMany({ data: rows });

  return Response.json({ stored: rows.length });
}
