import "server-only";
import { prisma } from "@vtk/db";
import { parsePollAnswers, pollIsForViewer, pollIsOpen } from "./core";
import { getViewerStudy } from "./read";
import { replacePollAnswers } from "./write";

export type SubmitPollCode = "POLL_CLOSED" | "POLL_NOT_YOURS" | "POLL_INVALID" | "POLL_TOO_LONG" | "POLL_EMPTY";

/**
 * Bewaart de antwoorden van een student op een POC-peiling, voor het formulier
 * op de site en voor de app. Eén plek voor de regels: open, voor deze student,
 * en enkel waarden die een vraag kan hebben.
 *
 * Opnieuw versturen vervangt alles wat die student eerder antwoordde: zo telt
 * iedereen één keer, en kan een vraag die je nu overslaat ook weer leeg worden.
 *
 * `read` geeft de ruwe waarde van een formulierveld (`pollFieldName`). Geeft een
 * code terug bij een weigering, `null` wanneer het bewaard is.
 */
export async function submitPollAnswers(
  userId: string,
  pollId: string,
  read: (fieldName: string) => unknown,
): Promise<SubmitPollCode | null> {
  const poll = await prisma.pocPoll.findUnique({
    where: { id: pollId },
    select: {
      publishedAt: true,
      opensAt: true,
      closesAt: true,
      studyYears: true,
      poc: { select: { studyProgrammes: true } },
      questions: { select: { id: true, kind: true } },
    },
  });
  if (!poll?.publishedAt || !pollIsOpen(poll, new Date())) return "POLL_CLOSED";

  const study = await getViewerStudy(userId);
  if (!pollIsForViewer({ programmes: poll.poc?.studyProgrammes ?? null, studyYears: poll.studyYears }, study)) {
    return "POLL_NOT_YOURS";
  }

  const parsed = parsePollAnswers(poll.questions, read);
  if (!parsed.ok) return parsed.code;
  if (parsed.answers.length === 0) return "POLL_EMPTY";

  await replacePollAnswers({ pollId, userId, years: study.years, answers: parsed.answers });
  return null;
}
