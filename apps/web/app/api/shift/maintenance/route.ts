import { timingSafeEqual } from "node:crypto";
import { processDueShiftReminders } from "@/lib/shift-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Worker-trigger: verstuurt de shift-herinneringen die aan de beurt zijn.
 * Bedoeld voor de `shift-worker` in docker-compose (elke vijf minuten) met
 * `Authorization: Bearer $SHIFT_MAINTENANCE_SECRET`. Geen secret = uit (401),
 * zoals bij de andere maintenance-routes.
 *
 * Een eigen worker en niet meeliftend op `ticket-worker`: een klemgelopen
 * mailserver mag de ticketbevestigingen niet meesleuren.
 */

function authorized(request: Request): boolean {
  const secret = process.env.SHIFT_MAINTENANCE_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await processDueShiftReminders();
  // 502 zodat de healthcheck van de worker het merkt wanneer de mailserver
  // structureel weigert: verzonden noch mislukt is dan onwaar.
  const status = result.failed > 0 && result.sent === 0 ? 502 : 200;
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
