import "server-only";
import { cache } from "react";
import type { StudyProgramme } from "@prisma/client";
import { prisma } from "@vtk/db";
import { getCachedOpenPocPolls } from "@/lib/cachedContent";
import { pollIsForViewer, pollIsOpen, type OpenPocPoll, type ViewerPocPoll } from "./core";
import { pollVoterKey } from "./voterKey";

/**
 * De peilingen die nu open staan. Komt uit de gedeelde cache: de strook hangt in
 * de layout, en het grootste deel van het jaar is het antwoord gewoon "geen".
 */
export async function getOpenPocPolls(now: Date): Promise<OpenPocPoll[]> {
  return (await getCachedOpenPocPolls()).filter((poll) => pollIsOpen(poll, now));
}

/** Per verzoek één keer: de layout en de homepage hebben dit allebei nodig. */
const getViewerStudy = cache(async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { studyProgrammes: true, studyYears: true },
  });
  return { programmes: user?.studyProgrammes ?? [], years: user?.studyYears ?? [] };
});

export async function getViewerProgrammes(userId: string): Promise<StudyProgramme[]> {
  return (await getViewerStudy(userId)).programmes;
}

export { getViewerStudy };

/** De open peilingen van de richtingen van deze student, met zijn eigen antwoorden. */
export const getViewerPocPolls = cache(async (userId: string): Promise<ViewerPocPoll[]> => {
  const open = await getOpenPocPolls(new Date());
  if (open.length === 0) return [];

  const study = await getViewerStudy(userId);
  const mine = open.filter((poll) => pollIsForViewer(poll, study));
  if (mine.length === 0) return [];

  const keys = new Map(mine.map((poll) => [poll.id, pollVoterKey(poll.id, userId)]));
  const rows = await prisma.pocPollAnswer.findMany({
    where: { voterKey: { in: [...keys.values()] } },
    select: { questionId: true, value: true, text: true, voterKey: true },
  });

  return mine.map((poll) => {
    const own = rows.filter((row) => row.voterKey === keys.get(poll.id));
    return {
      ...poll,
      answered: own.length > 0,
      answers: Object.fromEntries(
        own.map((row) => [row.questionId, { value: row.value, text: row.text }]),
      ),
    };
  });
});
