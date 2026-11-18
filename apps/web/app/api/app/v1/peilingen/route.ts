import { revalidatePath } from "next/cache";
import { pick } from "@vtk/i18n";
import { prisma } from "@vtk/db";

import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { pollFieldName } from "@/lib/pocPolls/core";
import { pollPanelData } from "@/lib/pocPolls/copy";
import { getViewerPocPolls, getViewerStudy } from "@/lib/pocPolls/read";
import { submitPollAnswers } from "@/lib/pocPolls/submit";
import { appLocaleFrom, type AppPolls } from "@/lib/app-api/contract";
import { appPollAnswerSchema } from "@/lib/app-api/schemas";
import { appError, appErrorResponse, appJson, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De peilingen van de RiVers voor deze student: wat op de homepage in de
 * POC-band staat, in gegevensvorm. Dezelfde `getViewerPocPolls` en dezelfde
 * zinnen (`pollPanelData`), zodat de app niets belooft wat de site niet zegt.
 *
 * **Anoniem**: deze route geeft enkel de eigen antwoorden terug, nooit een
 * tussenstand of een telling.
 */
export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));
    const now = new Date();

    const [polls, study] = await Promise.all([
      getViewerPocPolls(session.user.id),
      getViewerStudy(session.user.id),
    ]);
    const pocIds = [...new Set(polls.map((poll) => poll.pocId).filter((id): id is string => id !== null))];
    const pocs = pocIds.length
      ? await prisma.poc.findMany({ where: { id: { in: pocIds } }, select: { id: true, nameNl: true, nameEn: true } })
      : [];
    const pocName = new Map(pocs.map((poc) => [poc.id, pick(poc.nameNl, poc.nameEn, locale) ?? poc.nameNl]));

    const payload: AppPolls = {
      missingProgramme: study.programmes.length === 0,
      polls: polls.map((poll) => {
        const panel = pollPanelData(poll, locale, now);
        return {
          id: panel.id,
          title: panel.title,
          askedBy: poll.pocId ? (pocName.get(poll.pocId) ?? "POC") : "VTK Onderwijs",
          openUntil: panel.openUntil,
          lead: panel.lead,
          thanks: panel.thanks,
          anonymous: panel.anonymous,
          closesAt: new Date(poll.closesAt).toISOString(),
          answered: panel.answered,
          questions: panel.questions,
          answers: panel.answers,
        };
      }),
    };
    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/**
 * Antwoorden insturen. Dezelfde `submitPollAnswers` als het formulier op de
 * homepage; opnieuw insturen vervangt wat er stond.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    const { pollId, answers } = appPollAnswerSchema.parse(await readAppJson(request));

    const fields = new Map(Object.entries(answers).map(([questionId, value]) => [pollFieldName(questionId), value]));
    const code = await submitPollAnswers(session.user.id, pollId, (name) => fields.get(name));
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
