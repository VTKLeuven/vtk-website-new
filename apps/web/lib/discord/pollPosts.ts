import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { pollVoterCount } from "@/lib/pocPolls/write";
import { siteUrl } from "@/lib/seo";
import { deleteChannelMessage, discordBotConfigured, editChannelMessage, sendChannelMessage } from "./bot";
import { pollChannelMessage, pollClosedChannelMessage, type DiscordPollView } from "./pollMessages";

/** Een peiling op Discord zetten, en het bericht na de deadline afsluiten. */

export const DISCORD_POLL_SELECT = {
  id: true,
  titleNl: true,
  meetingDate: true,
  publishedAt: true,
  opensAt: true,
  closesAt: true,
  studyYears: true,
  discordChannelId: true,
  discordMessageId: true,
  summaryPublishedAt: true,
  poc: { select: { nameNl: true, studyProgrammes: true } },
  questions: {
    orderBy: { order: "asc" },
    select: { id: true, kind: true, textNl: true, lowLabelNl: true, highLabelNl: true },
  },
} satisfies Prisma.PocPollSelect;

export type DiscordPollRow = Prisma.PocPollGetPayload<{ select: typeof DISCORD_POLL_SELECT }>;

export function discordPollView(poll: DiscordPollRow, siteOrigin: string = siteUrl()): DiscordPollView {
  return {
    id: poll.id,
    title: poll.titleNl,
    pocName: poll.poc.nameNl.replace(/^POC\s+/i, ""),
    closesAt: poll.closesAt,
    meetingDate: poll.meetingDate ? poll.meetingDate.toISOString().slice(0, 10) : null,
    siteOrigin,
    questions: poll.questions.map((question) => ({
      id: question.id,
      kind: question.kind,
      text: question.textNl,
      low: question.lowLabelNl,
      high: question.highLabelNl,
    })),
  };
}

function loadPoll(pollId: string) {
  return prisma.pocPoll.findUnique({ where: { id: pollId }, select: DISCORD_POLL_SELECT });
}

/** Post de peiling in haar kanaal. Een weigering komt op het scherm van de RiVers. */
export async function postPollToDiscord(pollId: string): Promise<void> {
  const poll = await loadPoll(pollId);
  if (!poll?.publishedAt || !poll.discordChannelId || poll.discordMessageId || !discordBotConfigured()) return;
  const result = await sendChannelMessage(poll.discordChannelId, pollChannelMessage(discordPollView(poll)));
  await prisma.pocPoll.update({
    where: { id: pollId },
    data: result.ok ? { discordMessageId: result.data.id, discordError: null } : { discordError: result.message },
  });
}

async function closedMessage(poll: DiscordPollRow, now: Date) {
  const view = discordPollView(poll);
  const voters = await pollVoterCount(poll.id);
  return pollClosedChannelMessage(view, voters, {
    summaryPublished: Boolean(poll.summaryPublishedAt),
    meetingAhead: Boolean(view.meetingDate && view.meetingDate >= ymdKey(brusselsYMD(now))),
  });
}

/** Zet het bericht opnieuw goed, na een nieuwe deadline of een samenvatting. */
export async function refreshPollDiscordMessage(pollId: string, now: Date = new Date()): Promise<void> {
  const poll = await loadPoll(pollId);
  if (!poll?.discordChannelId || !poll.discordMessageId || !discordBotConfigured()) return;
  const open = poll.closesAt > now;
  const message = open ? pollChannelMessage(discordPollView(poll)) : await closedMessage(poll, now);
  const result = await editChannelMessage(poll.discordChannelId, poll.discordMessageId, message);
  await prisma.pocPoll.update({
    where: { id: pollId },
    data: { discordError: result.ok ? null : result.message, discordClosedAt: open ? null : now },
  });
}

/** De worker: wat voorbij zijn deadline is, krijgt geen werkende knoppen meer. */
export async function closeExpiredPollsOnDiscord(now: Date): Promise<number> {
  if (!discordBotConfigured()) return 0;
  const due = await prisma.pocPoll.findMany({
    where: {
      publishedAt: { not: null },
      discordMessageId: { not: null },
      discordClosedAt: null,
      closesAt: { lte: now },
    },
    select: DISCORD_POLL_SELECT,
    take: 20,
  });
  for (const poll of due) {
    const result = await editChannelMessage(poll.discordChannelId!, poll.discordMessageId!, await closedMessage(poll, now));
    // Een verwijderd bericht (404) valt niet meer af te sluiten; niet blijven proberen.
    if (result.ok || result.status === 404) {
      await prisma.pocPoll.update({ where: { id: poll.id }, data: { discordClosedAt: now } });
    }
  }
  return due.length;
}

/** Bij het verwijderen van een peiling. Lukt het niet, dan werken de knoppen toch niet meer. */
export async function removePollDiscordMessage(channelId: string | null, messageId: string | null): Promise<void> {
  if (!channelId || !messageId || !discordBotConfigured()) return;
  await deleteChannelMessage(channelId, messageId);
}
