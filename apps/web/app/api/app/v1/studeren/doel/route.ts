import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appStudyGoalSchema } from "@/lib/app-api/schemas";
import { setDailyGoal } from "@/lib/app-api/study";
import { studyOverview } from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Je dagdoel. Bepaalt wat de reeks telt en wanneer de dag "gehaald" is. */
export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const { dailyGoalMinutes } = appStudyGoalSchema.parse(await readAppJson(request));
    await setDailyGoal(session.user.id, dailyGoalMinutes);
    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "PATCH, OPTIONS");
}
