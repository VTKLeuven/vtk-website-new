import "server-only";

import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { logFormAudit } from "@/lib/forms/audit";
import {
  makeGroups,
  registrationSize,
  type GroupingEntryInput,
  type GroupingFieldSpec,
  type GroupingResult,
  type GroupingWarning,
} from "./algorithm";
import { valueKindForFieldType } from "./roles";

/**
 * Wat meetelt: ingediend, geen test en niet op de wachtlijst. Een inzending op
 * de wachtlijst heeft geen plaats, dus ook geen groep.
 */
export const GROUPABLE_ENTRY_FILTER = {
  status: "SUBMITTED",
  isTest: false,
  waitlisted: false,
} as const satisfies Prisma.FormEntryWhereInput;

type LoadedGrouping = NonNullable<Awaited<ReturnType<typeof loadGrouping>>>;

async function loadGrouping(formId: string) {
  return prisma.formGrouping.findUnique({
    where: { formId },
    include: {
      fields: { include: { field: { select: { id: true, type: true, archivedAt: true } } } },
    },
  });
}

export function fieldSpecs(grouping: LoadedGrouping): GroupingFieldSpec[] {
  return grouping.fields
    .filter((row) => !row.field.archivedAt)
    .map((row) => ({
      fieldId: row.fieldId,
      role: row.role,
      kind: valueKindForFieldType(row.field.type),
      weight: row.weight,
      options: row.options,
    }));
}

/** De antwoorden van de inzendingen, in de vorm die het algoritme leest. */
export async function loadGroupingEntries(
  formId: string,
  fieldIds: readonly string[]
): Promise<GroupingEntryInput[]> {
  const entries = await prisma.formEntry.findMany({
    where: { formId, ...GROUPABLE_ENTRY_FILTER },
    select: {
      id: true,
      answers: {
        where: { fieldId: { in: [...fieldIds] } },
        select: {
          fieldId: true,
          valueText: true,
          valueNumber: true,
          valueBool: true,
          valueOptions: true,
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
  });
  return entries.map((entry) => ({
    id: entry.id,
    answers: Object.fromEntries(
      entry.answers.map((answer) => [
        answer.fieldId,
        {
          text: answer.valueText,
          number: answer.valueNumber,
          bool: answer.valueBool,
          options: answer.valueOptions,
        },
      ])
    ),
  }));
}

/** Hoeveel personen er ingeschreven zijn; een groepsinschrijving telt voluit. */
export async function groupingPeopleCount(formId: string): Promise<number> {
  const grouping = await loadGrouping(formId);
  if (!grouping) return 0;
  const specs = fieldSpecs(grouping);
  const entries = await loadGroupingEntries(
    formId,
    specs.map((spec) => spec.fieldId)
  );
  return entries.reduce((sum, entry) => sum + registrationSize(entry, specs), 0);
}

/** Een vaste seed per formulier: opnieuw indelen zonder nieuwe inzendingen geeft dezelfde groepen. */
function seedFor(formId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < formId.length; index += 1) {
    hash ^= formId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deelt de inzendingen opnieuw in en vervangt het vorige resultaat, inclusief
 * handmatige verplaatsingen. De aanroeper vraagt daar zelf eerst bevestiging
 * voor.
 */
export async function runGrouping(
  formId: string,
  actorUserId: string | null
): Promise<{ groups: number; warnings: GroupingWarning[] }> {
  const grouping = await loadGrouping(formId);
  if (!grouping) throw new Error("GROUPING_NOT_FOUND");
  if (grouping.maxMembers < grouping.minMembers) throw new Error("INVALID_MAXMEMBERS");

  const specs = fieldSpecs(grouping);
  const entries = await loadGroupingEntries(
    formId,
    specs.map((spec) => spec.fieldId)
  );
  const result: GroupingResult = makeGroups(entries, specs, grouping, { seed: seedFor(formId) });

  await prisma.$transaction(async (tx) => {
    await tx.formGroupingGroup.deleteMany({ where: { groupingId: grouping.id } });
    for (const [index, group] of result.groups.entries()) {
      await tx.formGroupingGroup.create({
        data: {
          groupingId: grouping.id,
          number: index + 1,
          members: {
            create: group.members.map((member) => ({
              groupingId: grouping.id,
              entryId: member.entryId,
              isAnchor: member.isAnchor,
            })),
          },
        },
      });
    }
    await tx.formGrouping.update({
      where: { id: grouping.id },
      data: {
        ranAt: new Date(),
        ranById: actorUserId,
        manualMoves: 0,
        warnings: result.warnings as unknown as Prisma.InputJsonValue,
      },
    });
    await logFormAudit(tx, {
      formId,
      actorUserId,
      action: "FORM_GROUPING_RUN",
      entityType: "FormGrouping",
      entityId: grouping.id,
      metadata: {
        entries: entries.length,
        groups: result.groups.length,
        warnings: result.warnings.length,
        automatic: actorUserId == null,
      },
    });
  });

  return { groups: result.groups.length, warnings: result.warnings };
}
