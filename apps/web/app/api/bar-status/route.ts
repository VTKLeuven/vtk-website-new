import { readBarStatus } from "@/lib/elixir/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Publieke leeskant van de barstatus van 't ElixIr.
 *
 * Leest enkel de cache: dit endpoint raakt Munisense nooit, hoeveel bezoekers
 * er ook langskomen. De worker vult de cache (zie /api/elixir/maintenance).
 *
 * `available: false` betekent dat er nog nooit een meting was (integratie niet
 * geconfigureerd of net gedeployed); `stale: true` dat de laatste meting te oud
 * is om nog iets over "nu" te zeggen.
 */
export async function GET() {
  const status = await readBarStatus();
  const headers = { "Cache-Control": "no-store" };

  if (!status) {
    return Response.json({ available: false }, { headers });
  }

  return Response.json(
    {
      available: true,
      isOpen: status.isOpen,
      currentDecibels: status.currentDecibels,
      lastUpdated: status.lastUpdated,
      stale: status.stale,
    },
    { headers }
  );
}
