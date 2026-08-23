import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appPushUnregisterSchema } from "@/lib/app-api/contract";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";

/**
 * De app zet pushberichten uit, of logt uit.
 *
 * Wist enkel het token van de ingelogde gebruiker: zonder die voorwaarde zou
 * iemand met een gegokt token andermans toestel kunnen afmelden. Een token dat
 * niet bestaat of niet van jou is, geeft gewoon `ok`; er valt niets uit af te
 * leiden en er is niets om te herstellen.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { token } = appPushUnregisterSchema.parse(await readAppJson(request));

    await prisma.appPushDevice.deleteMany({ where: { token, userId: session.user.id } });

    return appJson(request, { ok: true });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
