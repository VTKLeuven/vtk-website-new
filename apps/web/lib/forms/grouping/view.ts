import "server-only";

import { prisma } from "@vtk/db";
import type { FormGroupingRole } from "@prisma/client";
import { answerToText, type ExportAnswer, type ExportField } from "@/lib/forms/export";
import {
  registrationSize,
  splitNames,
  type GroupingEntryInput,
  type GroupingWarning,
} from "./algorithm";
import { groupingCloseReason } from "./due";
import { GROUPABLE_ENTRY_FILTER, fieldSpecs } from "./run";
import { rolesForFieldType } from "./roles";

type Locale = "nl" | "en";

export type GroupingFieldRow = {
  id: string;
  code: string;
  label: string;
  type: string;
  options: { code: string; label: string }[];
  allowedRoles: FormGroupingRole[];
  role: FormGroupingRole | null;
  weight: number;
  chosenOptions: string[];
};

export type GroupingMemberView = {
  memberId: string;
  entryId: string;
  isAnchor: boolean;
  name: string;
  size: number;
  /** De anderen uit een groepsinschrijving. */
  companions: string[];
};

export type GroupingGroupView = {
  id: string;
  number: number;
  members: GroupingMemberView[];
  memberPeople: number;
  anchorPeople: number;
  /** Per SIMILAR/DIVERSE-vraag één korte regel: wat deze groep kenmerkt. */
  profile: { label: string; role: "SIMILAR" | "DIVERSE"; value: string }[];
};

function localized(locale: Locale, nl: string, en: string | null): string {
  return locale === "en" && en ? en : nl;
}

/** Alles wat het scherm van één groepjesmaker toont, in één ronde. */
export async function loadGroupingView(formId: string, locale: Locale) {
  const grouping = await prisma.formGrouping.findUnique({
    where: { formId },
    include: {
      form: { select: { status: true, closesAt: true, maxEntries: true } },
      ranBy: { select: { name: true } },
      fields: { include: { field: { select: { id: true, type: true, archivedAt: true } } } },
      groups: {
        orderBy: { number: "asc" },
        include: { members: { select: { id: true, entryId: true, isAnchor: true } } },
      },
    },
  });

  const fields = await prisma.formField.findMany({
    where: { formId, archivedAt: null },
    include: { options: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });

  const roleByField = new Map((grouping?.fields ?? []).map((row) => [row.fieldId, row]));
  const fieldRows: GroupingFieldRow[] = fields
    .map((field) => {
      const row = roleByField.get(field.id);
      return {
        id: field.id,
        code: field.code,
        label: localized(locale, field.labelNl, field.labelEn),
        type: field.type,
        options:
          field.type === "BOOLEAN"
            ? [
                { code: "true", label: locale === "nl" ? "Ja" : "Yes" },
                { code: "false", label: locale === "nl" ? "Nee" : "No" },
              ]
            : field.options.map((option) => ({
                code: option.code,
                label: localized(locale, option.labelNl, option.labelEn),
              })),
        allowedRoles: rolesForFieldType(field.type) as FormGroupingRole[],
        role: row?.role ?? null,
        weight: row?.weight ?? 1,
        chosenOptions: row?.options ?? [],
      };
    })
    .filter((row) => row.allowedRoles.length > 0);

  if (!grouping) {
    return { grouping: null, fields: fieldRows } as const;
  }

  const specs = fieldSpecs(grouping);
  const entries = await prisma.formEntry.findMany({
    where: { formId, ...GROUPABLE_ENTRY_FILTER },
    select: {
      id: true,
      submitterName: true,
      submitterEmail: true,
      answers: {
        select: {
          fieldId: true,
          fieldCode: true,
          valueText: true,
          valueNumber: true,
          valueDate: true,
          valueBool: true,
          valueOptions: true,
        },
      },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
  });

  const exportFields = new Map<string, ExportField>(
    fields.map((field) => [
      field.id,
      {
        id: field.id,
        code: field.code,
        type: field.type,
        labelNl: field.labelNl,
        labelEn: field.labelEn,
        sortOrder: field.sortOrder,
        archivedAt: field.archivedAt,
        options: field.options,
      },
    ])
  );
  const fieldsWithRole = (role: FormGroupingRole) =>
    specs.filter((spec) => spec.role === role).map((spec) => spec.fieldId);
  const nameFields = fieldsWithRole("NAME");
  const companionFields = fieldsWithRole("GROUP_NAMES");

  const entryInfo = new Map<
    string,
    { name: string; size: number; companions: string[]; answers: Map<string, ExportAnswer> }
  >();
  for (const entry of entries) {
    const answers = new Map<string, ExportAnswer>(
      entry.answers.map((answer) => [answer.fieldId, answer])
    );
    const input: GroupingEntryInput = {
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
    };
    const name =
      nameFields
        .map((fieldId) => answers.get(fieldId)?.valueText?.trim())
        .filter(Boolean)
        .join(" ") ||
      entry.submitterName ||
      entry.submitterEmail ||
      `#${entry.id.slice(-6)}`;
    entryInfo.set(entry.id, {
      name,
      size: registrationSize(input, specs),
      companions: companionFields.flatMap((fieldId) =>
        splitNames(answers.get(fieldId)?.valueText)
      ),
      answers,
    });
  }

  const profileFields = specs.filter(
    (spec) => (spec.role === "SIMILAR" || spec.role === "DIVERSE") && exportFields.has(spec.fieldId)
  );

  const groups: GroupingGroupView[] = grouping.groups.map((group) => {
    const members: GroupingMemberView[] = group.members
      .filter((member) => entryInfo.has(member.entryId))
      .map((member) => {
        const info = entryInfo.get(member.entryId)!;
        return {
          memberId: member.id,
          entryId: member.entryId,
          isAnchor: member.isAnchor,
          name: info.name,
          size: info.size,
          companions: info.companions,
        };
      })
      .sort((a, b) => Number(b.isAnchor) - Number(a.isAnchor) || a.name.localeCompare(b.name));

    const memberPeople = members.filter((m) => !m.isAnchor).reduce((sum, m) => sum + m.size, 0);
    const anchorPeople = members.filter((m) => m.isAnchor).reduce((sum, m) => sum + m.size, 0);

    const profile = profileFields.map((spec) => {
      const field = exportFields.get(spec.fieldId)!;
      const counts = new Map<string, number>();
      let answered = 0;
      for (const member of members) {
        const info = entryInfo.get(member.entryId)!;
        const text = answerToText(field, info.answers.get(spec.fieldId), [], locale);
        if (!text) continue;
        answered += member.size;
        for (const part of text.split(" | ")) {
          counts.set(part, (counts.get(part) ?? 0) + member.size);
        }
      }
      const label = localized(locale, field.labelNl, field.labelEn);
      if (answered === 0) {
        return { label, role: spec.role as "SIMILAR" | "DIVERSE", value: "-" };
      }
      if (spec.role === "DIVERSE") {
        const most = Math.max(...counts.values());
        return {
          label,
          role: "DIVERSE" as const,
          value:
            locale === "nl"
              ? `${counts.size} verschillend, hoogstens ${most} dezelfde`
              : `${counts.size} different, at most ${most} alike`,
        };
      }
      const [top, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { label, role: "SIMILAR" as const, value: `${top} (${count}/${answered})` };
    });

    return { id: group.id, number: group.number, members, memberPeople, anchorPeople, profile };
  });

  const grouped = new Set(grouping.groups.flatMap((group) => group.members.map((m) => m.entryId)));
  const ungrouped = entries
    .filter((entry) => !grouped.has(entry.id))
    .map((entry) => ({ entryId: entry.id, name: entryInfo.get(entry.id)!.name }));

  const people = [...entryInfo.values()].reduce((sum, info) => sum + info.size, 0);
  const closeReason = await groupingCloseReason(grouping, grouping.form, new Date());

  return {
    grouping: {
      id: grouping.id,
      minMembers: grouping.minMembers,
      maxMembers: grouping.maxMembers,
      minGroups: grouping.minGroups,
      maxGroups: grouping.maxGroups,
      minAnchors: grouping.minAnchors,
      maxAnchors: grouping.maxAnchors,
      autoRun: grouping.autoRun,
      expectedPeople: grouping.expectedPeople,
      ranAt: grouping.ranAt,
      ranByName: grouping.ranBy?.name ?? null,
      manualMoves: grouping.manualMoves,
      warnings: (Array.isArray(grouping.warnings) ? grouping.warnings : []) as GroupingWarning[],
    },
    fields: fieldRows,
    stats: { entries: entries.length, people },
    closeReason,
    groups,
    ungrouped,
    entryNames: new Map([...entryInfo.entries()].map(([id, info]) => [id, info.name])),
  } as const;
}
