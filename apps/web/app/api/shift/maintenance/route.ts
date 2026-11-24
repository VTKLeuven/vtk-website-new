import { timingSafeEqual } from "node:crypto";
import { processDueShiftReminders } from "@/lib/shift/reminders";
import { processDueAfwasMails, type AfwasMailRun } from "@/lib/theokotAfwas-server";

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
 *
 * De mails van de Theokot-afwas (herinnering de dag ervoor, en "Theokot is die
 * dag dicht") lopen hier mee: hetzelfde ritme en dezelfde aard van bericht. Ze
 * komen na de shiftherinneringen en in een eigen vangnet, zodat een fout daar
 * de herinneringen van wie een shift doet niet tegenhoudt.
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

  const shifts = await processDueShiftReminders();
  let afwas: AfwasMailRun | { error: string };
  try {
    afwas = await processDueAfwasMails();
  } catch (error) {
    console.error("[afwas] mails van de Theokot-afwas mislukt", error);
    afwas = { error: error instanceof Error ? error.message : String(error) };
  }
  const sent = shifts.sent + ("sent" in afwas ? afwas.sent : 0);
  const failed = shifts.failed + ("failed" in afwas ? afwas.failed : 0) + ("error" in afwas ? 1 : 0);
  const result = { ...shifts, sent, failed, afwas };
  // 503 wanneer er geen mailserver is (zelfde signaal als de andere
  // maintenance-routes bij een ontbrekende configuratie), 502 wanneer de
  // verzending structureel weigert. In beide gevallen ziet de healthcheck van de
  // worker dat er iets scheelt in plaats van stil niets te doen.
  const status =
    shifts.skipped === "geen-smtp" ? 503 : failed > 0 && sent === 0 ? 502 : 200;
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}
