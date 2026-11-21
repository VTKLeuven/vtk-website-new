import "server-only";
import { pick } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import type { AppLocale, AppPolls } from "@/lib/app-api/contract";
import { pollFieldName } from "./core";
import { pollPanelData } from "./copy";
import { getViewerPocPolls, getViewerStudy } from "./read";
import { submitPollAnswers, type SubmitPollCode } from "./submit";

/**
 * De peilingen van één student in gegevensvorm, voor wie ze niet op de homepage
 * leest: de app (`/api/app/v1/peilingen`) en Burgieclan
 * (`/api/burgieclan/v1/polls`). Dezelfde `getViewerPocPolls` en dezelfde zinnen
 * (`pollPanelData`) als de POC-band, zodat niemand iets belooft wat de site niet
 * zegt.
 *
 * **Anoniem**: enkel de eigen antwoorden, nooit een tussenstand of een telling.
 */
export async function appPollsFor(userId: string, locale: AppLocale, now = new Date()): Promise<AppPolls> {
  const [polls, study] = await Promise.all([getViewerPocPolls(userId), getViewerStudy(userId)]);
  const pocIds = [...new Set(polls.map((poll) => poll.pocId).filter((id): id is string => id !== null))];
  const pocs = pocIds.length
    ? await prisma.poc.findMany({ where: { id: { in: pocIds } }, select: { id: true, nameNl: true, nameEn: true } })
    : [];
  const pocName = new Map(pocs.map((poc) => [poc.id, pick(poc.nameNl, poc.nameEn, locale) ?? poc.nameNl]));

  return {
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
}

/**
 * Antwoorden insturen zoals de app en Burgieclan ze sturen: per vraag-id een
 * string ("1"/"0", "1".."5" of de tekst). Dezelfde `submitPollAnswers` als het
 * formulier op de homepage; opnieuw insturen vervangt wat er stond.
 */
export async function submitAppPollAnswers(
  userId: string,
  pollId: string,
  answers: Record<string, string>,
): Promise<SubmitPollCode | null> {
  const fields = new Map(Object.entries(answers).map(([questionId, value]) => [pollFieldName(questionId), value]));
  return submitPollAnswers(userId, pollId, (name) => fields.get(name));
}
