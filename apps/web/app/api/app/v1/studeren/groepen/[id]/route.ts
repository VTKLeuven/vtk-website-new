import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appStudyGroupUpdateSchema } from "@/lib/app-api/schemas";
import {
  StudyGroupError,
  leaveStudyGroup,
  studyOverview,
  updateStudyGroup,
} from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hernoemen of het groepsdoel zetten. Enkel wie de groep maakte. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const changes = appStudyGroupUpdateSchema.parse(await readAppJson(request));
    await updateStudyGroup(session.user.id, id, changes);
    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    if (error instanceof StudyGroupError) {
      return appError(request, error.code, error.code === "NOT_FOUND" ? 404 : 403);
    }
    return appErrorResponse(request, error);
  }
}

/**
 * Zelf vertrekken, of iemand eruit zetten met `?lid=<userId>`.
 *
 * Dat tweede kan enkel wie de groep maakte, en het staat er omdat een code die
 * rondgaat vroeg of laat bij iemand belandt voor wie ze niet bedoeld was. De
 * eigenaar die zelf vertrekt geeft de groep door aan wie er het langst in zit;
 * vertrekt de laatste, dan verdwijnt de groep.
 */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await context.params;
    const target = new URL(request.url).searchParams.get("lid");
    await leaveStudyGroup(session.user.id, id, target ?? undefined);
    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    if (error instanceof StudyGroupError) {
      return appError(request, error.code, error.code === "NOT_FOUND" ? 404 : 403);
    }
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "PATCH, DELETE, OPTIONS");
}
