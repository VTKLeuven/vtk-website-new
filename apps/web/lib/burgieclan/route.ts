import "server-only";

import { appLocaleFrom } from "@/lib/app-api/contract";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { requireSession } from "@/lib/session";
import { planningErrorResponse, runPlanning, type PlanningCall } from "./planning";

/**
 * Wat elke route onder `/api/app/v1/planning` doet: de sessie nakijken, de
 * aanvraag doorgeven aan Burgieclan, en de planning of de fout teruggeven.
 * `build` mag gooien (een `ZodError` wordt een 400).
 */
export async function planningRoute(
  request: Request,
  build: () => PlanningCall | Promise<PlanningCall>,
): Promise<Response> {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const planning = await runPlanning(session.user.id, locale, await build());
    return appJson(request, planning);
  } catch (error) {
    return planningErrorResponse(request, error) ?? appErrorResponse(request, error);
  }
}
