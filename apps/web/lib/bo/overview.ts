import "server-only";

import { prisma } from "@vtk/db";
import type { BoLine } from "./figures";
import { buildOverview, type BoOverview, type DocInput } from "./dossiers";

/**
 * Het overzicht van één werkingsjaar, plus de jaren waarvoor er iets is.
 *
 * Laadt ook het jaar ervoor en erna: een resultaat van 26-27 komt soms pas in
 * een BO van 27-28 binnen, en wie naar 26-27 kijkt, wil dat dossier dan toch
 * afgerond zien. Omgekeerd zoekt een resultaat zijn budget in het jaar ervoor.
 */
export async function loadBoOverview(
  year: number,
  nl: boolean,
  today: Date = new Date(),
): Promise<{ overview: BoOverview; years: number[] }> {
  const [rows, posts, aliases, years, meetings] = await Promise.all([
    prisma.boDocument.findMany({
      where: { meeting: { workingYear: { gte: year - 1, lte: year + 1 } } },
      include: { meeting: true },
    }),
    prisma.group.findMany({
      select: { id: true, code: true, slug: true, nameNl: true, nameEn: true, orderInPraesidium: true, type: true },
    }),
    prisma.boPostAlias.findMany({ select: { key: true, postKeys: true } }),
    prisma.boMeeting.findMany({ distinct: ["workingYear"], select: { workingYear: true } }),
    prisma.boMeeting.findMany({ where: { workingYear: year } }),
  ]);

  const docs: DocInput[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    webUrl: row.webUrl,
    folderKind: row.folderKind,
    meeting: {
      id: row.meeting.id,
      name: row.meeting.name,
      kind: row.meeting.kind,
      number: row.meeting.number,
      date: row.meeting.date,
      workingYear: row.meeting.workingYear,
    },
    sheetPost: row.sheetPost,
    sheetTitle: row.sheetTitle,
    eventDate: row.eventDate,
    budgetTotalCents: row.budgetTotalCents,
    resultTotalCents: row.resultTotalCents,
    allocationCents: row.allocationCents,
    vtkSharePercent: row.vtkSharePercent,
    lines: Array.isArray(row.lines) ? (row.lines as unknown as BoLine[]) : null,
    location: row.location,
    figuresError: row.figuresError,
    missing: row.missingSince !== null || row.meeting.missingSince !== null,
    pairedBudgetId: row.pairedBudgetId,
    postKeysOverride: row.postKeys ?? [],
    budgetWaiver: row.budgetWaiver,
    hidden: row.hiddenAt !== null,
    driveFileId: row.driveFileId,
  }));

  return {
    overview: buildOverview(
      docs,
      posts,
      new Map(aliases.map((a) => [a.key, a.postKeys ?? []])),
      year,
      today,
      nl,
      meetings.map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        number: m.number,
        date: m.date,
        workingYear: m.workingYear,
        webUrl: m.webUrl,
        missing: m.missingSince !== null,
      })),
    ),
    years: years.map((y) => y.workingYear),
  };
}
