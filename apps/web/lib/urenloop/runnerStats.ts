import "server-only";

import { prisma } from "@vtk/db";
import { normalizeRNumber } from "@/lib/theokotPickupQuery";
import { summarizeRunner, type ParsedLapsFile, type RunnerYearStats } from "./laps";

/**
 * Vervangt alle rondes van `file.year` door die uit de upload. Andere jaren
 * blijven staan. In één transactie, zodat een account nooit een half jaar ziet.
 */
export async function importUrenloopLaps(
  file: ParsedLapsFile,
  meta: { fileName: string | null; importedById: string | null },
): Promise<{ replaced: boolean }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.urenloopEdition.findUnique({
      where: { year: file.year },
      select: { year: true },
    });
    // Cascade: de rondes van dat jaar gaan mee.
    if (existing) await tx.urenloopEdition.delete({ where: { year: file.year } });
    await tx.urenloopEdition.create({
      data: {
        year: file.year,
        eventStart: file.eventStart,
        fileName: meta.fileName,
        importedById: meta.importedById,
      },
    });
    await tx.urenloopLap.createMany({
      data: file.laps.map((lap) => ({ ...lap, year: file.year })),
    });
    return { replaced: Boolean(existing) };
  });
}

/**
 * De cijfers van één r-nummer, per jaar, het recentste eerst. Leeg zonder
 * r-nummer of zonder rondes.
 */
export async function getRunnerStats(rawRNumber: string | null): Promise<RunnerYearStats[]> {
  if (!rawRNumber) return [];
  const rNumber = normalizeRNumber(rawRNumber);
  if (!rNumber) return [];

  const laps = await prisma.urenloopLap.findMany({
    where: { rNumber },
    select: {
      year: true,
      sequence: true,
      startedAt: true,
      timeMs: true,
      raining: true,
      source: true,
    },
  });
  if (laps.length === 0) return [];

  const years = [...new Set(laps.map((lap) => lap.year))].sort((a, b) => b - a);
  const [editions, field] = await Promise.all([
    prisma.urenloopEdition.findMany({
      where: { year: { in: years } },
      select: { year: true, eventStart: true },
    }),
    // Per jaar elke loper met zijn aantal en zijn snelste: genoeg voor de plaats,
    // zonder de rondes van anderen naar deze pagina te halen.
    prisma.urenloopLap.groupBy({
      by: ["year", "runnerKey"],
      where: { year: { in: years } },
      _count: { _all: true },
      _min: { timeMs: true },
    }),
  ]);
  const eventStartByYear = new Map(editions.map((e) => [e.year, e.eventStart]));

  return years.flatMap((year) => {
    const eventStart = eventStartByYear.get(year);
    if (!eventStart) return [];
    const yearField = field.filter((entry) => entry.year === year);
    const stats = summarizeRunner({
      year,
      eventStart,
      laps: laps.filter((lap) => lap.year === year),
      field: yearField.map((entry) => ({
        runnerKey: entry.runnerKey,
        laps: entry._count._all,
        bestMs: entry._min.timeMs ?? Number.POSITIVE_INFINITY,
      })),
      teamLaps: yearField.reduce((sum, entry) => sum + entry._count._all, 0),
    });
    return stats ? [stats] : [];
  });
}

/** Per jaar wat er opgeladen is, voor /admin/24urenloop. */
export async function listUrenloopEditions() {
  const editions = await prisma.urenloopEdition.findMany({
    orderBy: { year: "desc" },
    select: {
      year: true,
      eventStart: true,
      fileName: true,
      importedAt: true,
      importedBy: { select: { name: true } },
    },
  });
  if (editions.length === 0) return [];

  const years = editions.map((e) => e.year);
  const [lapCounts, runners] = await Promise.all([
    prisma.urenloopLap.groupBy({
      by: ["year"],
      where: { year: { in: years } },
      _count: { _all: true },
    }),
    prisma.urenloopLap.findMany({
      where: { year: { in: years }, rNumber: { not: null } },
      distinct: ["year", "rNumber"],
      select: { year: true, rNumber: true },
    }),
  ]);
  // Hoeveel van die r-nummers een account hebben: wie geen account heeft,
  // ziet niets tot hij er een maakt met dat r-nummer.
  const withAccount = await prisma.user.findMany({
    where: { rNumber: { in: [...new Set(runners.map((r) => r.rNumber!))] } },
    select: { rNumber: true },
  });
  const accountSet = new Set(withAccount.map((u) => u.rNumber));

  return editions.map((edition) => {
    const yearRunners = runners.filter((r) => r.year === edition.year);
    return {
      ...edition,
      laps: lapCounts.find((c) => c.year === edition.year)?._count._all ?? 0,
      runnersWithRNumber: yearRunners.length,
      runnersWithAccount: yearRunners.filter((r) => accountSet.has(r.rNumber)).length,
    };
  });
}
