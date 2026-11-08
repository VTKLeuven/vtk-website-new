import "server-only";
import type { StudyYear } from "@prisma/client";
import { prisma } from "@vtk/db";
import type { PollAnswerRow } from "./core";
import { pollVoterKey } from "./voterKey";

/** Vervangt alles wat deze student op deze peiling antwoordde (de website). */
export async function replacePollAnswers(input: {
  pollId: string;
  userId: string;
  years: StudyYear[];
  answers: PollAnswerRow[];
}): Promise<void> {
  const voterKey = pollVoterKey(input.pollId, input.userId);
  await prisma.$transaction([
    prisma.pocPollAnswer.deleteMany({ where: { voterKey } }),
    prisma.pocPollAnswer.createMany({
      data: input.answers.map((answer) => ({ ...answer, voterKey, studyYears: input.years })),
      skipDuplicates: true,
    }),
  ]);
}

/** Eén antwoord bewaren of leegmaken (Discord, vraag per vraag). */
export async function savePollAnswer(input: {
  pollId: string;
  userId: string;
  years: StudyYear[];
  answer: PollAnswerRow | { questionId: string; clear: true };
}): Promise<void> {
  const voterKey = pollVoterKey(input.pollId, input.userId);
  const { answer } = input;
  if ("clear" in answer) {
    await prisma.pocPollAnswer.deleteMany({ where: { questionId: answer.questionId, voterKey } });
    return;
  }
  const data = { value: answer.value, text: answer.text, studyYears: input.years };
  await prisma.pocPollAnswer.upsert({
    where: { questionId_voterKey: { questionId: answer.questionId, voterKey } },
    create: { questionId: answer.questionId, voterKey, ...data },
    update: data,
  });
}

/** Hoeveel studenten minstens één vraag beantwoordden. */
export async function pollVoterCount(pollId: string): Promise<number> {
  const rows = await prisma.pocPollAnswer.findMany({
    where: { question: { pollId } },
    distinct: ["voterKey"],
    select: { voterKey: true },
  });
  return rows.length;
}
