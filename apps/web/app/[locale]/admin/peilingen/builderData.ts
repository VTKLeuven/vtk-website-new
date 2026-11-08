import "server-only";
import type { Locale } from "@vtk/i18n";
import { prisma } from "@vtk/db";
import { listDiscordChannels } from "@/lib/discord/bot";
import { pollPanelLabels, pollPhaseLabel } from "@/lib/pocPolls/copy";
import { pollPopulation, STUDY_YEARS } from "@/lib/pocPolls/population";
import type { PollBuilderPoc } from "./PollBuilder";

/** Wat het opstelscherm nodig heeft, voor een nieuwe peiling en voor een concept. */
export async function loadBuilderData(scope: string[] | "all", locale: Locale) {
  const pocRows = await prisma.poc.findMany({
    where: scope === "all" ? {} : { id: { in: scope } },
    orderBy: { order: "asc" },
    select: { id: true, nameNl: true, studyProgrammes: true },
  });
  const [pocs, channels] = await Promise.all([
    Promise.all(
      pocRows.map(async (poc): Promise<PollBuilderPoc> => {
        const population = await pollPopulation(poc.studyProgrammes, []);
        return {
          id: poc.id,
          name: poc.nameNl.replace(/^POC\s+/i, ""),
          hasProgramme: poc.studyProgrammes.length > 0,
          reach: population.total,
          perYear: population.perYear,
        };
      }),
    ),
    listDiscordChannels(),
  ]);
  return {
    pocs,
    channels,
    phases: STUDY_YEARS.map((key) => ({ key, label: pollPhaseLabel(key, locale) })),
    panelLabels: pollPanelLabels(locale),
  };
}
