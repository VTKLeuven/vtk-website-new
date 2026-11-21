import { revalidatePath } from "next/cache";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appPollsFor, submitAppPollAnswers } from "@/lib/pocPolls/appPolls";
import { appLocaleFrom } from "@/lib/app-api/contract";
import { appPollAnswerSchema } from "@/lib/app-api/schemas";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De peilingen van de RiVers voor deze student: wat op de homepage in de
 * POC-band staat, in gegevensvorm (`appPollsFor`, dezelfde als voor Burgieclan).
 *
 * **Anoniem**: deze route geeft enkel de eigen antwoorden terug, nooit een
 * tussenstand of een telling.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    return appJson(request, await appPollsFor(session.user.id, locale));
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/**
 * Antwoorden insturen. Dezelfde `submitPollAnswers` als het formulier op de
 * homepage (via `submitAppPollAnswers`); opnieuw insturen vervangt wat er stond.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { pollId, answers } = appPollAnswerSchema.parse(await readAppJson(request));

    const code = await submitAppPollAnswers(session.user.id, pollId, answers);
    if (code) return appError(request, code, code === "POLL_CLOSED" ? 409 : 422);

    // De strook op de site hoort meteen te verdwijnen, ook voor wie in de app antwoordde.
    revalidatePath("/", "layout");
    return appJson(request, { ok: true });
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, POST, OPTIONS");
}
