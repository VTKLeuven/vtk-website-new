import "server-only";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import { listDiscordChannels } from "@/lib/discord/bot";
import { GENERAL_POLL } from "@/lib/pocPolls/core";
import { pollPanelLabels, pollPhaseLabel } from "@/lib/pocPolls/copy";
import { pollPopulation, STUDY_YEARS } from "@/lib/pocPolls/population";
import type { PollBuilderPoc } from "./PollBuilder";

/**
 * Wat het opstelscherm nodig heeft, voor een nieuwe peiling en voor een concept.
 *
 * Het Discord-kanaal kies je per peiling. Als startwaarde neemt het scherm het
 * kanaal van de laatste peiling van dezelfde POC (of van de laatste algemene
 * peiling), en anders het kanaal dat vroeger in /admin/pocs stond.
 */
export async function loadBuilderData(scope: string[] | "all", locale: Locale) {
  const [pocRows, channels, lastChannels] = await Promise.all([
    prisma.poc.findMany({
      where: scope === "all" ? {} : { id: { in: scope } },
      orderBy: { order: "asc" },
      select: { id: true, nameNl: true, studyProgrammes: true, discordChannelId: true },
    }),
    listDiscordChannels(),
    prisma.pocPoll.findMany({
      where: { discordChannelId: { not: null }, ...(scope === "all" ? {} : { pocId: { in: scope } }) },
      orderBy: { createdAt: "desc" },
      distinct: ["pocId"],
      select: { pocId: true, discordChannelId: true },
    }),
  ]);

  // Een kanaal dat intussen weg is, is geen startwaarde.
  const known = (channelId: string | null | undefined) =>
    channelId && channels?.some((channel) => channel.id === channelId) ? channelId : null;
  const lastFor = (pocId: string | null) => lastChannels.find((row) => row.pocId === pocId)?.discordChannelId;

  const pocs = await Promise.all(
    pocRows.map(async (poc): Promise<PollBuilderPoc> => {
      const population = await pollPopulation(poc.studyProgrammes, []);
      return {
        id: poc.id,
        name: poc.nameNl.replace(/^POC\s+/i, ""),
        general: false,
        hasProgramme: poc.studyProgrammes.length > 0,
        reach: population.total,
        perYear: population.perYear,
        defaultChannelId: known(lastFor(poc.id)) ?? known(poc.discordChannelId),
      };
    }),
  );

  // VTK Onderwijs (`pocs.manage`) kan ook een peiling voor alle richtingen maken.
  if (scope === "all") {
    const population = await pollPopulation(null, []);
    pocs.unshift({
      id: GENERAL_POLL,
      name: locale === "nl" ? "Alle richtingen (VTK Onderwijs)" : "All programmes (VTK Onderwijs)",
      general: true,
      hasProgramme: true,
      reach: population.total,
      perYear: population.perYear,
      defaultChannelId: known(lastFor(null)),
    });
  }

  return {
    pocs,
    channels,
    phases: STUDY_YEARS.map((key) => ({ key, label: pollPhaseLabel(key, locale) })),
    panelLabels: pollPanelLabels(locale),
  };
}
