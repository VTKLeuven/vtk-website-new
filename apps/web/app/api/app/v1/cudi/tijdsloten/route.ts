import { corsPreflight } from "@/lib/cors";
import { reserveTimeslotRoute, timeslotsRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Je tijdsloten bij de cursusdienst en de komende per dag (`GET`), of een reserveren (`POST { timeslotId }`). */
export function GET(request: Request) {
  return timeslotsRoute(request);
}

export function POST(request: Request) {
  return reserveTimeslotRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, POST, OPTIONS");
}
