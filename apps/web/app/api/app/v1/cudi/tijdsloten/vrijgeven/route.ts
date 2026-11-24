import { corsPreflight } from "@/lib/cors";
import { releaseTimeslotRoute } from "@/lib/cudi/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een eigen tijdslotreservatie vrijgeven (`{ registrationId }`). */
export function POST(request: Request) {
  return releaseTimeslotRoute(request);
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
