import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { sendStudyGroupStartPush } from "@/lib/app-api/notifications";
import { appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";
import { appStudyActionSchema, appStudyStartSchema } from "@/lib/app-api/schemas";
import { startStudySession, stopStudySession, updateStudySession } from "@/lib/app-api/study";
import { studyOverview } from "@/lib/app-api/studyGroups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gaan zitten, pauzeren, opstaan.
 *
 * Elk van de drie geeft het **volledige overzicht** terug en niet enkel wat er
 * veranderde. Dat scheelt de app een tweede aanvraag op precies het moment dat ze
 * iets moet tonen, en het houdt de zaal meteen actueel: wie start, ziet zichzelf
 * er staan.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const input = appStudyStartSchema.parse(await readAppJson(request));
    const { started } = await startStudySession(session.user.id, input);

    // Het bericht aan de groep hangt aan het starten en niet aan een achtergrondtaak:
    // "de eerste is begonnen" is enkel iets waard op het moment zelf. Het mag de
    // sessie nooit tegenhouden, dus een mislukte verzending blijft binnen.
    if (started) {
      try {
        await sendStudyGroupStartPush(session.user.id);
      } catch (error) {
        console.error("Studiegroep-startbericht mislukt", error);
      }
    }

    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const input = appStudyActionSchema.parse(await readAppJson(request));
    await updateStudySession(session.user.id, input);
    return appJson(request, await studyOverview(request, session.user.id));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSession();
    const finished = await stopStudySession(session.user.id);
    return appJson(request, {
      finishedSeconds: finished?.seconds ?? 0,
      subject: finished?.subject ?? null,
      overview: await studyOverview(request, session.user.id),
    });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "POST, PATCH, DELETE, OPTIONS");
}
