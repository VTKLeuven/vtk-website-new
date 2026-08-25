import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { studyOverview } from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Het studeerscherm in één antwoord: je sessie, je cijfers en je groepen.
 *
 * De app haalt dit ook op terwijl er niets verandert, want de zaal moet leven:
 * wie er nu zit en hoelang al. Dat is de reden dat alles in één vorm zit; twee
 * aanvragen zouden betekenen dat de helft van het scherm ververst terwijl de
 * andere helft achterloopt.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
