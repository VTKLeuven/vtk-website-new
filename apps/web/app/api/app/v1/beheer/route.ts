import { corsPreflight } from "@/lib/cors";
import { appLocaleFrom } from "@/lib/app-api/contract";
import { adminDashboard, canUseAdmin } from "@/lib/app-api/admin";
import { requestOrigin } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De admin in de app (`AppAdminDashboard`): je tegels, de deurknop, wat je post
 * nog naar het BO moet brengen, en de onderdelen die je in de zijbalk van
 * /admin ziet. Enkel voor wie de link "Beheer" op de site ook krijgt.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    if (!canUseAdmin(session)) throw new Error("FORBIDDEN");
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    return appJson(request, await adminDashboard(session, locale, requestOrigin(request)));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
