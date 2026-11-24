import { corsPreflight } from "@/lib/cors";
import { appLocaleFrom } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { canSeeTransport, transportWeek, weekStartFor } from "@/lib/app-api/transport";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De transportplanning van Logistiek voor één week (`?week=YYYY-MM-DD`, een
 * dag in die week; standaard deze week), `AppTransportWeek`. Enkel voor het
 * praesidium, werkgroepen, jaarwerkingen en het team; zie `canSeeTransport`.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (!canSeeTransport(session)) throw new Error("FORBIDDEN");
    const params = new URL(request.url).searchParams;
    const locale = appLocaleFrom(params.get("locale"));
    return appJson(request, await transportWeek(session, weekStartFor(params.get("week")), locale));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
