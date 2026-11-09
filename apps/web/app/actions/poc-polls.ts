"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { StudyYear } from "@prisma/client";
import { prisma } from "@vtk/db";
import { logAudit } from "@/lib/audit";
import { SITE_CONTENT_TAG } from "@/lib/cachedContent";
import { discordBotConfigured } from "@/lib/discord/bot";
import { postPollToDiscord, refreshPollDiscordMessage, removePollDiscordMessage } from "@/lib/discord/pollPosts";
import { managedPocIds, managesPoc } from "@/lib/pocPolls/access";
import { parsePollAnswers, pollIsForViewer, pollIsOpen } from "@/lib/pocPolls/core";
import { parseBrusselsInput, parsePollDraft } from "@/lib/pocPolls/draft";
import { STUDY_YEARS } from "@/lib/pocPolls/population";
import { getViewerStudy } from "@/lib/pocPolls/read";
import { pollAnswerRef } from "@/lib/pocPolls/voterKey";
import { replacePollAnswers } from "@/lib/pocPolls/write";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { getCurrentSession, requireSession } from "@/lib/session";

const MAX_SUMMARY_LENGTH = 4000;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function adminBase(formData: FormData): string {
  return `${formData.get("locale") === "en" ? "/en" : ""}/admin/peilingen`;
}

function refreshPollScreens() {
  revalidatePath("/[locale]/admin/peilingen", "layout");
  revalidatePath("/", "layout");
}

/**
 * Bewaart de antwoorden van een student op een POC-peiling.
 *
 * Opnieuw versturen vervangt alles wat die student eerder antwoordde: zo telt
 * iedereen één keer, en kan een vraag die je nu overslaat ook weer leeg worden.
 */
export async function submitPocPollAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const session = await getCurrentSession();
  if (!session) return saveError("POLL_SIGN_IN");

  const pollId = text(formData, "pollId");
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
  if (!poll?.publishedAt || !pollIsOpen(poll, new Date())) return saveError("POLL_CLOSED");

  const study = await getViewerStudy(session.user.id);
  if (!pollIsForViewer({ programmes: poll.poc.studyProgrammes, studyYears: poll.studyYears }, study)) {
    return saveError("POLL_NOT_YOURS");
  }

  const parsed = parsePollAnswers(poll.questions, (name) => formData.get(name));
  if (!parsed.ok) return saveError(parsed.code);
  if (parsed.answers.length === 0) return saveError("POLL_EMPTY");

  await replacePollAnswers({ pollId, userId: session.user.id, years: study.years, answers: parsed.answers });

  // De layout mee: de strook bovenaan hoort meteen te verdwijnen.
  revalidatePath("/", "layout");
  return saveOk();
}

async function manageScope() {
  const session = await requireSession();
  return managedPocIds(session);
}

/** De peiling, als deze gebruiker ze mag beheren. */
async function managedPoll(id: string) {
  const scope = await manageScope();
  const poll = await prisma.pocPoll.findUnique({
    where: { id },
    select: {
      id: true,
      pocId: true,
      titleNl: true,
      publishedAt: true,
      opensAt: true,
      closesAt: true,
      discordChannelId: true,
      discordMessageId: true,
    },
  });
  return poll && managesPoc(scope, poll.pocId) ? poll : null;
}

/** Een concept bewaren, of publiceren: dan gaat de peiling meteen open. */
export async function savePocPollAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const scope = await manageScope();
  const publish = formData.get("intent") !== "draft";
  const now = new Date();

  const parsed = parsePollDraft(
    {
      title: text(formData, "title"),
      closesAt: text(formData, "closesAt"),
      meetingDate: text(formData, "meetingDate"),
      questions: text(formData, "questions"),
      studyYears: formData.getAll("studyYears").filter((year): year is string => typeof year === "string"),
    },
    { publish, now },
  );
  if (!parsed.ok) return saveError(parsed.code);
  const { draft } = parsed;

  const id = text(formData, "id");
  let pocId = text(formData, "pocId");
  if (id) {
    const existing = await managedPoll(id);
    if (!existing) return saveError("POLL_FORBIDDEN");
    if (existing.publishedAt) return saveError("POLL_LOCKED");
    pocId = existing.pocId;
  }
  if (!pocId || !managesPoc(scope, pocId)) return saveError("POLL_FORBIDDEN");

  const poc = await prisma.poc.findUnique({ where: { id: pocId }, select: { studyProgrammes: true, discordChannelId: true } });
  if (publish && (!poc || poc.studyProgrammes.length === 0)) return saveError("POLL_POC_NO_PROGRAMME");

  const fields = {
    titleNl: draft.title,
    closesAt: draft.closesAt,
    meetingDate: draft.meetingDate,
    studyYears: draft.studyYears.filter((year): year is StudyYear => STUDY_YEARS.includes(year as StudyYear)),
    // Altijd het kanaal van de POC zelf: dat zien enkel haar studenten.
    discordChannelId: discordBotConfigured() && formData.has("postToDiscord") ? (poc?.discordChannelId ?? null) : null,
    ...(publish ? { publishedAt: now, opensAt: now } : {}),
  };

  const pollId = await prisma.$transaction(async (tx) => {
    const poll = id
      ? await tx.pocPoll.update({ where: { id }, data: fields, select: { id: true } })
      : await tx.pocPoll.create({ data: { ...fields, pocId, opensAt: now }, select: { id: true } });
    await tx.pocPollQuestion.deleteMany({ where: { pollId: poll.id } });
    await tx.pocPollQuestion.createMany({
      data: draft.questions.map((question, order) => ({
        pollId: poll.id,
        order,
        kind: question.kind,
        textNl: question.text,
        lowLabelNl: question.low,
        highLabelNl: question.high,
      })),
    });
    return poll.id;
  });

  await logAudit({
    action: publish ? "publish" : id ? "update" : "create",
    entity: "pocPoll",
    entityId: pollId,
    target: draft.title,
  });

  if (publish) {
    updateTag(SITE_CONTENT_TAG);
    await postPollToDiscord(pollId);
  }
  refreshPollScreens();

  // Een nieuw concept krijgt zijn eigen adres: een tweede klik op bewaren maakt
  // anders een duplicaat. Na publiceren is het opstelscherm er niet meer.
  if (publish || !id) redirect(`${adminBase(formData)}/${pollId}`);
  return saveOk();
}

/** De planning van een gepubliceerde peiling; de vragen liggen dan al vast. */
export async function updatePocPollScheduleAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const poll = await managedPoll(text(formData, "id"));
  if (!poll?.publishedAt) return saveError("POLL_FORBIDDEN");

  const closesAt = parseBrusselsInput(text(formData, "closesAt"));
  if (!closesAt) return saveError("POLL_CLOSES_INVALID");
  const meeting = text(formData, "meetingDate").trim();
  if (meeting && !/^\d{4}-\d{2}-\d{2}$/.test(meeting)) return saveError("POLL_MEETING_INVALID");

  await prisma.pocPoll.update({
    where: { id: poll.id },
    data: { closesAt, meetingDate: meeting ? new Date(`${meeting}T00:00:00.000Z`) : null },
  });
  await logAudit({ action: "update", entity: "pocPoll", entityId: poll.id, target: poll.titleNl, summary: "planning" });
  updateTag(SITE_CONTENT_TAG);
  await refreshPollDiscordMessage(poll.id);
  refreshPollScreens();
  return saveOk();
}

export async function deletePocPollAction(formData: FormData): Promise<SaveState> {
  const poll = await managedPoll(text(formData, "id"));
  if (!poll) return saveError("POLL_FORBIDDEN");

  await prisma.pocPoll.delete({ where: { id: poll.id } });
  await logAudit({ action: "delete", entity: "pocPoll", entityId: poll.id, target: poll.titleNl });
  await removePollDiscordMessage(poll.discordChannelId, poll.discordMessageId);
  updateTag(SITE_CONTENT_TAG);
  refreshPollScreens();
  redirect(adminBase(formData));
}

/** Wat de RiVers na de POC vertellen. Leegmaken haalt de samenvatting weer weg. */
export async function publishPocPollSummaryAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const poll = await managedPoll(text(formData, "id"));
  if (!poll?.publishedAt) return saveError("POLL_FORBIDDEN");
  if (pollIsOpen(poll, new Date())) return saveError("POLL_STILL_OPEN");

  const summary = text(formData, "summary").trim();
  if (summary.length > MAX_SUMMARY_LENGTH) return saveError("POLL_SUMMARY_LONG");

  await prisma.pocPoll.update({
    where: { id: poll.id },
    data: { summaryNl: summary || null, summaryPublishedAt: summary ? new Date() : null },
  });
  await logAudit({ action: "publish", entity: "pocPoll", entityId: poll.id, target: poll.titleNl, summary: "samenvatting" });
  updateTag(SITE_CONTENT_TAG);
  await refreshPollDiscordMessage(poll.id);
  refreshPollScreens();
  return saveOk();
}

/** Een open antwoord markeren voor de POC, of verbergen. */
export async function togglePocPollAnswerAction(formData: FormData): Promise<SaveState> {
  const poll = await managedPoll(text(formData, "id"));
  if (!poll?.publishedAt || pollIsOpen(poll, new Date())) return saveError("POLL_FORBIDDEN");

  const questionId = text(formData, "questionId");
  const question = await prisma.pocPollQuestion.findFirst({
    where: { id: questionId, pollId: poll.id },
    select: { answers: { select: { voterKey: true, starred: true, hidden: true } } },
  });
  const ref = text(formData, "ref");
  const answer = question?.answers.find((row) => pollAnswerRef(questionId, row.voterKey) === ref);
  if (!answer) return saveError("POLL_FORBIDDEN");

  const flag = text(formData, "flag") === "hidden" ? "hidden" : "starred";
  await prisma.pocPollAnswer.update({
    where: { questionId_voterKey: { questionId, voterKey: answer.voterKey } },
    data: { [flag]: !answer[flag] },
  });
  revalidatePath("/[locale]/admin/peilingen", "layout");
  return saveOk();
}

export async function retryPocPollDiscordAction(_previous: SaveState, formData: FormData): Promise<SaveState> {
  const poll = await managedPoll(text(formData, "id"));
  if (!poll?.publishedAt) return saveError("POLL_FORBIDDEN");

  await postPollToDiscord(poll.id);
  refreshPollScreens();
  const after = await prisma.pocPoll.findUnique({ where: { id: poll.id }, select: { discordError: true } });
  return after?.discordError ? saveError("POLL_DISCORD", after.discordError) : saveOk();
}
