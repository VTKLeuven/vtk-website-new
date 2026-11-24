import { corsPreflight } from "@/lib/cors";
import { appError, appErrorResponse, appJson } from "@/lib/app-api/respond";
import { logDoorAccess, requestDoorOpen } from "@/lib/door-server";
import { requirePermission } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De voordeur op afstand openen, zoals de knop op het dashboard
 * (`openDoorRemoteAction`): `door.remoteOpen`, en elke opening komt in het
 * deurlogboek. Een fout draagt dezelfde code als op de site als `error`
 * (`AppDoorErrorCode`).
 */
export async function POST(request: Request) {
  try {
    const session = await requirePermission("door.remoteOpen");
    const result = await requestDoorOpen();
    if (!result.ok) {
      return appError(request, result.error, 502, { message: "De deur ging niet open." });
    }
    await logDoorAccess({ method: "REMOTE", result: "ALLOWED", userId: session.user.id });
    return appJson(request, { ok: true });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
