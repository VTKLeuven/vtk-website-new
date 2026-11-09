import "server-only";

import { after } from "next/server";
import { prisma } from "@vtk/db";
import { parsePollAnswers, pollFieldName, pollIsForViewer, pollIsOpen } from "@/lib/pocPolls/core";
import { pollVoterKey } from "@/lib/pocPolls/voterKey";
import { savePollAnswer } from "@/lib/pocPolls/write";
import { siteUrl } from "@/lib/seo";
import { createDiscordLinkToken } from "./linkToken";
import { accessiblePocNames, loadRolePocs, repairDiscordRoles, roleAccount, ROLE_ACCOUNT_SELECT } from "./pocAccess";
import {
  DISCORD_LINK_PANEL_ID,
  discordAccessMessage,
  discordConfirmStudyMessage,
  discordNoPocMessage,
  parsePollCustomId,
  pollAnswerLabel,
  pollBrokenNotice,
  pollClosedNotice,
  pollDoneMessage,
  pollInlineAnswerMessage,
  pollLinkAccountMessage,
  pollModalValue,
  pollNotForYouMessage,
  pollOpenModal,
  pollStepMessage,
  type DiscordPollView,
  type PollBotMessage,
  type PollModal,
} from "./pollMessages";
import { DISCORD_POLL_SELECT, discordPollView } from "./pollPosts";

/**
 * Wat er gebeurt wanneer iemand op Discord op een knop van een peiling drukt.
 *
 * Discord wil binnen drie seconden antwoord, dus hier gebeurt enkel wat nodig is
 * om het volgende bericht te kunnen tonen. Het antwoord komt in dezelfde tabel
 * als op de website: wie op beide antwoordt, telt één keer.
 */

export type DiscordInteraction = {
  type: number;
  data?: { custom_id?: unknown; components?: unknown };
  member?: { user?: { id?: unknown; username?: unknown }; roles?: unknown };
  user?: { id?: unknown; username?: unknown };
};

export type DiscordInteractionResponse =
  | { type: 1 }
  | { type: 4 | 7; data: PollBotMessage }
  | { type: 9; data: PollModal };

const reply = (data: PollBotMessage): DiscordInteractionResponse => ({ type: 4, data });
const update = (data: PollBotMessage): DiscordInteractionResponse => ({ type: 7, data });

export const INTERACTION_PING = 1;

async function ownAnswers(pollId: string, userId: string) {
  const rows = await prisma.pocPollAnswer.findMany({
    where: { voterKey: pollVoterKey(pollId, userId) },
    select: { questionId: true, value: true, text: true },
  });
  return new Map(rows.map((row) => [row.questionId, { value: row.value, text: row.text }]));
}

async function stepOrDone(view: DiscordPollView, index: number, userId: string): Promise<PollBotMessage> {
  if (index >= view.questions.length) return pollDoneMessage();
  const answers = await ownAnswers(view.id, userId);
  return pollStepMessage(view, index, answers.get(view.questions[index].id));
}

/**
 * De knop onder het vaste koppelbericht. Antwoorden gaat voor: de rollen veranderen
 * pas na het antwoord, want dat zijn verzoeken die Discords drie seconden kunnen
 * opeten.
 */
async function handleLinkPanel(interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  const actor = interaction.member?.user ?? interaction.user;
  if (typeof actor?.id !== "string") return reply(pollBrokenNotice());

  const origin = siteUrl();
  const now = new Date();
  const [pocs, account] = await Promise.all([
    loadRolePocs(),
    prisma.user.findUnique({ where: { discordId: actor.id }, select: ROLE_ACCOUNT_SELECT }),
  ]);

  if (!account || !account.active || account.deletedAt) {
    const username = typeof actor.username === "string" ? actor.username : "";
    const token = createDiscordLinkToken(actor.id, username, now);
    return reply(pollLinkAccountMessage(`${origin}/koppel-discord?token=${token}`));
  }

  const roles = interaction.member?.roles;
  const memberRoleIds = Array.isArray(roles) ? roles.filter((role): role is string => typeof role === "string") : [];
  after(() => repairDiscordRoles({ account, memberRoleIds, pocs, now }));

  if (!roleAccount(account, now).confirmed) return reply(discordConfirmStudyMessage(`${origin}/studie-bevestigen`));
  const names = accessiblePocNames(pocs, account, now);
  return reply(names.length > 0 ? discordAccessMessage(names) : discordNoPocMessage(`${origin}/account#profile`));
}

export async function handlePollInteraction(interaction: DiscordInteraction): Promise<DiscordInteractionResponse> {
  if (interaction.data?.custom_id === DISCORD_LINK_PANEL_ID) return handleLinkPanel(interaction);

  const parsed = parsePollCustomId(interaction.data?.custom_id);
  const actor = interaction.member?.user ?? interaction.user;
  if (!parsed || typeof actor?.id !== "string") return reply(pollBrokenNotice());

  const origin = siteUrl();
  const now = new Date();
  const [poll, account] = await Promise.all([
    prisma.pocPoll.findUnique({ where: { id: parsed.pollId }, select: DISCORD_POLL_SELECT }),
    prisma.user.findUnique({
      where: { discordId: actor.id },
      select: { id: true, active: true, deletedAt: true, studyProgrammes: true, studyYears: true },
    }),
  ]);

  if (!poll) return reply(pollBrokenNotice());
  if (!poll.publishedAt || !pollIsOpen(poll, now)) return reply(pollClosedNotice());

  if (!account || !account.active || account.deletedAt) {
    const username = typeof actor.username === "string" ? actor.username : "";
    const token = createDiscordLinkToken(actor.id, username, now);
    return reply(pollLinkAccountMessage(`${origin}/koppel-discord?token=${token}`));
  }

  const eligible = pollIsForViewer(
    { programmes: poll.poc.studyProgrammes, studyYears: poll.studyYears },
    { programmes: account.studyProgrammes, years: account.studyYears },
  );
  const view = discordPollView(poll, origin);
  if (!eligible) return reply(pollNotForYouMessage(view.pocName, `${origin}/account#profile`));

  const question = view.questions[parsed.index];
  const save = (value: number) => {
    if (!question) return null;
    const result = parsePollAnswers([question], (name) => (name === pollFieldName(question.id) ? String(value) : null));
    return result.ok ? result.answers[0] : null;
  };

  switch (parsed.action) {
    case "s":
      return reply(await stepOrDone(view, 0, account.id));
    case "n":
      return update(await stepOrDone(view, parsed.index, account.id));
    case "a":
    case "i": {
      const answer = parsed.value === null ? null : save(parsed.value);
      if (!answer || !question || parsed.value === null) return reply(pollBrokenNotice());
      await savePollAnswer({ pollId: poll.id, userId: account.id, years: account.studyYears, answer });
      if (parsed.action === "i") return reply(pollInlineAnswerMessage(pollAnswerLabel(question, parsed.value)));
      return update(await stepOrDone(view, parsed.index + 1, account.id));
    }
    case "o": {
      if (!question) return reply(pollBrokenNotice());
      const answers = await ownAnswers(poll.id, account.id);
      return { type: 9, data: pollOpenModal(view, parsed.index, answers.get(question.id)?.text ?? null) };
    }
    case "m": {
      if (!question) return reply(pollBrokenNotice());
      const text = (pollModalValue(interaction.data?.components) ?? "").trim();
      await savePollAnswer({
        pollId: poll.id,
        userId: account.id,
        years: account.studyYears,
        answer: text
          ? { questionId: question.id, value: null, text: text.slice(0, 2000) }
          : { questionId: question.id, clear: true },
      });
      return update(await stepOrDone(view, parsed.index + 1, account.id));
    }
  }
}
