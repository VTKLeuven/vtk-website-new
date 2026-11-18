import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { releaseOrder } from "@/lib/theokot-orders";
import { appTheokotReleaseSchema } from "@/lib/app-api/schemas";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { orderErrorResponse } from "@/lib/app-api/theokotErrors";

export const runtime = "nodejs";

/**
 * Laat annuleren: na de deadline geeft de student zijn broodjes vrij voor
 * overname. Dezelfde `releaseOrder` als op /theokot, dus ook hier geldt: niet
 * voor de doos van een grocomeet, enkel tot het einde van de afhaal, en wat dan
 * niet overgenomen is, telt als no-show.
 *
 * Zonder `lines` gaat alles vrij; met `lines` enkel die aantallen.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { orderId, lines } = appTheokotReleaseSchema.parse(await readAppJson(request));

    await releaseOrder(session.user.id, orderId, new Date(), lines);
    return appJson(request, { ok: true });
  } catch (error) {
    return orderErrorResponse(request, error) ?? appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
