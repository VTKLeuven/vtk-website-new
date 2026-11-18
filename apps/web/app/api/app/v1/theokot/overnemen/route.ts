import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { takeOverSandwich } from "@/lib/theokot-orders";
import { appTheokotTakeoverSchema } from "@/lib/app-api/schemas";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { orderErrorResponse } from "@/lib/app-api/theokotErrors";

export const runtime = "nodejs";

/**
 * Eén vrijgegeven broodje overnemen. Dezelfde `takeOverSandwich` als op
 * /theokot: een eigen vrijgegeven broodje eerst, anders dat van wie het langst
 * vrijgaf, met dezelfde limieten en ban als bij bestellen.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { sessionItemId } = appTheokotTakeoverSchema.parse(await readAppJson(request));

    const order = await takeOverSandwich(session.user.id, sessionItemId);
    return appJson(request, order, 201);
  } catch (error) {
    return orderErrorResponse(request, error) ?? appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
