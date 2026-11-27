import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appStudySubjectsSchema } from "@/lib/app-api/schemas";
import { setStudySubjects } from "@/lib/app-api/study";
import { studyOverview } from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De vakken onder "Waaraan werk je?", zoals je ze in de app beheert: de hele
 * lijst in één keer, in de volgorde waarin ze moet staan. Een lege lijst mag; dan
 * staan er geen voorstellen meer tot je een nieuw vak intikt.
 */
export async function PUT(request: Request) {
  try {
    const session = await requireSession();
    const { subjects } = appStudySubjectsSchema.parse(await readAppJson(request));
    await setStudySubjects(session.user.id, subjects);
    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "PUT, OPTIONS");
}
