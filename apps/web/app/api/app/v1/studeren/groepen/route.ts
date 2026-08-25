import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appStudyGroupCreateSchema } from "@/lib/app-api/schemas";
import { StudyGroupError, createStudyGroup, studyOverview } from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Een groep maken. Je krijgt meteen de code terug, want dat is het enige wat je
 * daarna nog moet doen: ze doorsturen.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { name } = appStudyGroupCreateSchema.parse(await readAppJson(request));
    const groupId = await createStudyGroup(session.user.id, name);
    return appJson(request, {
      groupId,
      overview: await studyOverview(request, session.user.id),
    });
  } catch (error) {
    if (error instanceof StudyGroupError) return appError(request, error.code, 400);
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
