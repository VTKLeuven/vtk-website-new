import { corsPreflight } from "@/lib/cors";
import { planningRoute } from "@/lib/burgieclan/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De planning van Burgieclan van het ingelogde lid (`AppPlanning`): het
 * lessenrooster, de deadlines en de VTK-evenementen die erin staan. Burgieclan
 * synchroniseert het lessenrooster eerst wanneer dat ouder is dan een uur.
 *
 * `DELETE` ontkoppelt het lessenrooster en vergeet de hele planning, zoals de
 * knop op Burgieclan; ook de deadlines en de VTK-evenementen erin gaan weg.
 */
export async function GET(request: Request) {
  return planningRoute(request, () => ({ kind: "get" }));
}

export async function DELETE(request: Request) {
  return planningRoute(request, () => ({ kind: "unsubscribe" }));
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, DELETE, OPTIONS");
}
