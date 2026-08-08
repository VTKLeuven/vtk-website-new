import { timingSafeEqual } from "node:crypto";
import { elixirMaintenanceSecret } from "@/lib/elixir/config";
import { refreshBarStatus } from "@/lib/elixir/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Worker-trigger: haalt één verse geluidsmeting op bij Munisense en werkt de
 * cache bij. Bedoeld voor de `elixir-worker` in docker-compose (elke 3 minuten)
 * met `Authorization: Bearer $ELIXIR_MAINTENANCE_SECRET`. Geen secret =
 * integratie uit (401), zoals bij de andere maintenance-routes.
 *
 * Geeft bewust enkel tellers terug en niet de status zelf: dit is de
 * schrijfkant, /api/bar-status is de leeskant.
 */

function authorized(request: Request): boolean {
  const secret = elixirMaintenanceSecret();
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await refreshBarStatus();
  if (!result.ok) {
    // 502 zodat de healthcheck van de worker het merkt wanneer Munisense
    // structureel weigert.
    return Response.json(result, { status: result.error === "NOT_CONFIGURED" ? 503 : 502 });
  }
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
