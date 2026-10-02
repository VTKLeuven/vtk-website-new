import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { logFormAudit } from "@/lib/forms/audit";
import { refreshFormPage } from "@/lib/forms/pageLink";
import { GROUPABLE_ENTRY_FILTER, groupingPeopleCount, runGrouping } from "./run";

export type DueGroupingOutcome = { formId: string; closed: boolean; groups: number };

/**
 * Wanneer "alle antwoorden er zijn". Het eerste dat klopt, telt:
 * - het formulier staat al op gesloten (iemand deed het met de hand);
 * - het sluitmoment is voorbij;
 * - het maximum aantal inzendingen is bereikt;
 * - het verwachte aantal personen is ingeschreven.
 */
export async function groupingCloseReason(
  grouping: { formId: string; expectedPeople: number | null },
  form: { status: string; closesAt: Date | null; maxEntries: number | null },
  now: Date
): Promise<"CLOSED" | "DEADLINE" | "FULL" | "EXPECTED" | null> {
  if (form.status === "CLOSED") return "CLOSED";
  if (form.closesAt && form.closesAt <= now) return "DEADLINE";
  if (form.maxEntries != null) {
    const submitted = await prisma.formEntry.count({
      where: { formId: grouping.formId, ...GROUPABLE_ENTRY_FILTER },
    });
    if (submitted >= form.maxEntries) return "FULL";
  }
  if (grouping.expectedPeople != null) {
    if ((await groupingPeopleCount(grouping.formId)) >= grouping.expectedPeople) {
      return "EXPECTED";
    }
  }
  return null;
}

/**
 * Loopt op de forms-worker (`/api/forms/maintenance`): sluit elk formulier met
 * een automatische groepjesmaker waarvan alle antwoorden binnen zijn, en deelt
 * het in. Enkel één keer: wie daarna opnieuw wil indelen, doet dat met de knop
 * in Apps > Groepjesmaker, zodat een handmatige verplaatsing nooit stil overschreven wordt.
 */
export async function runDueGroupings(now = new Date()): Promise<DueGroupingOutcome[]> {
  const candidates = await prisma.formGrouping.findMany({
    where: {
      autoRun: true,
      ranAt: null,
      form: { status: { in: ["PUBLISHED", "CLOSED"] } },
    },
    select: {
      formId: true,
      expectedPeople: true,
      form: {
        select: { status: true, closesAt: true, maxEntries: true, slug: true, pageId: true },
      },
    },
    take: 20,
  });

  const outcomes: DueGroupingOutcome[] = [];
  for (const candidate of candidates) {
    const reason = await groupingCloseReason(candidate, candidate.form, now);
    if (!reason) continue;

    let closed = false;
    if (candidate.form.status === "PUBLISHED") {
      // Voorwaardelijk: wie net met de hand iets anders deed, wint.
      const updated = await prisma.form.updateMany({
        where: { id: candidate.formId, status: "PUBLISHED" },
        data: { status: "CLOSED" },
      });
      closed = updated.count > 0;
      if (closed) {
        await logFormAudit(prisma, {
          formId: candidate.formId,
          action: "FORM_CLOSED_BY_GROUPING",
          entityType: "Form",
          entityId: candidate.formId,
          metadata: { reason },
        });
        // Anders toont de publieke pagina het formulier nog als open.
        for (const path of ["/formulieren", `/formulieren/${candidate.form.slug}`]) {
          revalidatePath(path);
          revalidatePath(`/en${path}`);
        }
        await refreshFormPage(candidate.form.pageId);
      }
    }

    const result = await runGrouping(candidate.formId, null);
    outcomes.push({ formId: candidate.formId, closed, groups: result.groups });
  }
  return outcomes;
}
