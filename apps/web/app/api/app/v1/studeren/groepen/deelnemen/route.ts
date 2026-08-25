import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appStudyGroupJoinSchema } from "@/lib/app-api/schemas";
import { StudyGroupError, joinStudyGroup, studyOverview } from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Deelnemen met een code.
 *
 * Een code die niet bestaat geeft `NOT_FOUND`, en dat is precies hetzelfde
 * antwoord als een code die je verkeerd overtikte. Er wordt bewust niet gegokt
 * welk teken je bedoelde: stilletjes in de verkeerde groep belanden is erger dan
 * opnieuw moeten typen.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { code } = appStudyGroupJoinSchema.parse(await readAppJson(request));
    const groupId = await joinStudyGroup(session.user.id, code);
    return appJson(request, {
      groupId,
      overview: await studyOverview(request, session.user.id),
    });
  } catch (error) {
    if (error instanceof StudyGroupError) {
      return appError(request, error.code, error.code === "NOT_FOUND" ? 404 : 400);
    }
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
