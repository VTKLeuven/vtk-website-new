import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appPushRegisterSchema } from "@/lib/app-api/contract";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";

/**
 * De app meldt haar pushtoken aan.
 *
 * Gebeurt bij elke start, want een token kan door het besturingssysteem
 * vervangen worden zonder dat de app dat merkt. Vandaar de upsert op het token
 * en niet op de gebruiker: één lid heeft soms twee toestellen, en na een
 * herinstallatie hoort hetzelfde toestel bij een nieuw token.
 *
 * Registreert het token op de gebruiker die nu ingelogd is, ook wanneer het
 * eerder bij iemand anders stond. Dat is het geval van een gedeelde of
 * doorgegeven telefoon, en dan horen de berichten bij wie er nu op zit.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = appPushRegisterSchema.parse(await readAppJson(request));

    await prisma.appPushDevice.upsert({
      where: { token: input.token },
      create: {
        userId: session.user.id,
        token: input.token,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
      },
      update: {
        userId: session.user.id,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        lastSeenAt: new Date(),
      },
    });

    return appJson(request, { ok: true });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, OPTIONS");
}
