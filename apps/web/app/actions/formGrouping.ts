"use server";

import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import type { FormGroupingRole } from "@prisma/client";
import { requireFormCapability } from "@/lib/forms/authorization";
import { logFormAudit } from "@/lib/forms/audit";
import { runGrouping } from "@/lib/forms/grouping/run";
import {
  GROUPING_ROLES,
  roleHasWeight,
  roleNeedsOptions,
  rolesForFieldType,
} from "@/lib/forms/grouping/roles";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

/** Verwachte invoerfouten: een rode toast, geen error boundary (zie CLAUDE.md). */
const EXPECTED_ERRORS = new Set([
  "FORBIDDEN",
  "FORM_NOT_FOUND",
  "GROUPING_NOT_FOUND",
  "GROUP_NOT_FOUND",
  "MEMBER_NOT_FOUND",
  "OPTIONS_REQUIRED",
  "ONE_GROUP_SIZE",
  "ONE_ANCHOR",
  "FORM_REQUIRED",
]);

async function guard(run: () => Promise<void>): Promise<SaveState> {
  try {
    await run();
    return saveOk();
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_ERRORS.has(code) || code.startsWith("INVALID_")) return saveError(code);
    console.error("Groepjesmaker-actie mislukt", error);
    throw error;
  }
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function integer(
  formData: FormData,
  key: string,
  minimum: number,
  maximum: number,
  optional: boolean
): number | null {
  const raw = value(formData, key);
  if (!raw) {
    if (optional) return null;
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return parsed;
}

function pair(minimum: number | null, maximum: number | null, key: string) {
  if (minimum != null && maximum != null && maximum < minimum) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
}

function refresh(formId: string) {
  for (const prefix of ["", "/en"]) {
    for (const tab of ["", "/vragen", "/instellingen"]) {
      revalidatePath(`${prefix}/admin/apps/groepjesmaker/${formId}${tab}`);
    }
    revalidatePath(`${prefix}/admin/apps/groepjesmaker`);
  }
}

// -----------------------------------------------------------------------------

function adminPath(locale: string, path: string): string {
  return `${locale === "en" ? "/en" : ""}/admin/apps/groepjesmaker${path}`;
}

/**
 * Zet de groepjesmaker aan op een form en opent hem. De navigatie is de
 * bevestiging; de `redirect()` staat buiten de guard, want die werkt via een
 * throw.
 */
export async function enableGroupingAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const formId = value(formData, "formId");
  const locale = value(formData, "locale");
  const state = await guard(async () => {
    if (!formId) throw new Error("FORM_REQUIRED");
    const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
    const grouping = await prisma.formGrouping.upsert({
      where: { formId },
      create: { formId },
      update: {},
    });
    await logFormAudit(prisma, {
      formId,
      actorUserId: session.user.id,
      action: "FORM_GROUPING_ENABLED",
      entityType: "FormGrouping",
      entityId: grouping.id,
    });
    refresh(formId);
  });
  if (state.status !== "success") return state;
  redirect(adminPath(locale, `/${formId}`));
}

/** De parameters: de grenzen per groep en wanneer er ingedeeld wordt. */
export async function saveGroupingSettingsAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const formId = value(formData, "formId");
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
    const grouping = await prisma.formGrouping.findUnique({ where: { formId } });
    if (!grouping) throw new Error("GROUPING_NOT_FOUND");

    const minMembers = integer(formData, "minMembers", 1, 1000, false)!;
    const maxMembers = integer(formData, "maxMembers", 1, 1000, false)!;
    pair(minMembers, maxMembers, "maxMembers");
    const minGroups = integer(formData, "minGroups", 1, 1000, true);
    const maxGroups = integer(formData, "maxGroups", 1, 1000, true);
    pair(minGroups, maxGroups, "maxGroups");
    const minAnchors = integer(formData, "minAnchors", 0, 1000, true);
    const maxAnchors = integer(formData, "maxAnchors", 1, 1000, true);
    pair(minAnchors, maxAnchors, "maxAnchors");
    const expectedPeople = integer(formData, "expectedPeople", 1, 100_000, true);
    const autoRun = ["on", "true"].includes(value(formData, "autoRun"));

    await prisma.$transaction(async (tx) => {
      await tx.formGrouping.update({
        where: { id: grouping.id },
        data: {
          minMembers,
          maxMembers,
          minGroups,
          maxGroups,
          minAnchors,
          maxAnchors,
          expectedPeople,
          autoRun,
        },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_GROUPING_UPDATED",
        entityType: "FormGrouping",
        entityId: grouping.id,
        metadata: { autoRun, minMembers, maxMembers },
      });
    });
    refresh(formId);
  });
}

/**
 * Wat elke vraag doet. Eén keer alles: de rollen worden vervangen door wat het
 * formulier meestuurt, zodat een rol die je weghaalt ook echt weg is.
 */
export async function saveGroupingRolesAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const formId = value(formData, "formId");
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
    const grouping = await prisma.formGrouping.findUnique({ where: { formId } });
    if (!grouping) throw new Error("GROUPING_NOT_FOUND");

    const fields = await prisma.formField.findMany({
      where: { formId, archivedAt: null },
      include: { options: { where: { archivedAt: null }, select: { code: true } } },
    });
    const roles: { fieldId: string; role: FormGroupingRole; weight: number; options: string[] }[] =
      [];
    for (const field of fields) {
      const raw = value(formData, `role:${field.id}`);
      if (!raw) continue;
      const role = GROUPING_ROLES.find((candidate) => candidate === raw);
      if (!role || !rolesForFieldType(field.type).includes(role)) {
        throw new Error("INVALID_ROLE");
      }
      const weight = roleHasWeight(role)
        ? integer(formData, `weight:${field.id}`, 1, 5, true) ?? 1
        : 1;
      let options: string[] = [];
      if (roleNeedsOptions(role)) {
        const valid = new Set(
          field.type === "BOOLEAN" ? ["true", "false"] : field.options.map((option) => option.code)
        );
        options = [
          ...new Set(
            formData
              .getAll(`options:${field.id}`)
              .map(String)
              .filter((code) => valid.has(code))
          ),
        ];
        if (options.length === 0) throw new Error("OPTIONS_REQUIRED");
      }
      roles.push({ fieldId: field.id, role, weight, options });
    }
    // Twee aantallen of twee kernvragen spreken elkaar tegen zodra ze verschillen.
    if (roles.filter((row) => row.role === "GROUP_SIZE").length > 1) {
      throw new Error("ONE_GROUP_SIZE");
    }
    if (roles.filter((row) => row.role === "ANCHOR").length > 1) throw new Error("ONE_ANCHOR");

    await prisma.$transaction(async (tx) => {
      await tx.formGroupingField.deleteMany({ where: { groupingId: grouping.id } });
      if (roles.length > 0) {
        await tx.formGroupingField.createMany({
          data: roles.map((row) => ({ groupingId: grouping.id, ...row })),
        });
      }
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_GROUPING_ROLES_UPDATED",
        entityType: "FormGrouping",
        entityId: grouping.id,
        metadata: { roles: roles.length },
      });
    });
    refresh(formId);
  });
}

export async function runGroupingAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const formId = value(formData, "formId");
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
    await runGrouping(formId, session.user.id);
    refresh(formId);
  });
}

/**
 * Verplaatst één inzending (met iedereen die ze meebracht) naar een andere
 * groep, of naar een nieuwe groep wanneer `groupId` "new" is.
 */
export async function moveGroupingMemberAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const formId = value(formData, "formId");
  const memberId = value(formData, "memberId");
  const target = value(formData, "groupId");
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
    await prisma.$transaction(async (tx) => {
      const grouping = await tx.formGrouping.findUnique({ where: { formId } });
      if (!grouping) throw new Error("GROUPING_NOT_FOUND");
      const member = await tx.formGroupingMember.findFirst({
        where: { id: memberId, groupingId: grouping.id },
      });
      if (!member) throw new Error("MEMBER_NOT_FOUND");

      let groupId = target;
      if (target === "new") {
        const last = await tx.formGroupingGroup.findFirst({
          where: { groupingId: grouping.id },
          orderBy: { number: "desc" },
          select: { number: true },
        });
        const created = await tx.formGroupingGroup.create({
          data: { groupingId: grouping.id, number: (last?.number ?? 0) + 1 },
        });
        groupId = created.id;
      } else {
        const group = await tx.formGroupingGroup.findFirst({
          where: { id: target, groupingId: grouping.id },
        });
        if (!group) throw new Error("GROUP_NOT_FOUND");
      }
      if (groupId === member.groupId) return;

      await tx.formGroupingMember.update({ where: { id: member.id }, data: { groupId } });
      await tx.formGrouping.update({
        where: { id: grouping.id },
        data: { manualMoves: { increment: 1 } },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_GROUPING_MOVED",
        entityType: "FormGroupingMember",
        entityId: member.id,
        metadata: { from: member.groupId, to: groupId },
      });
    });
    refresh(formId);
  });
}

/**
 * Een inzending die na de indeling binnenkwam, in een bestaande groep zetten.
 * Opnieuw indelen zou alles omgooien voor één laatkomer.
 */
export async function addGroupingMemberAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  const formId = value(formData, "formId");
  const entryId = value(formData, "entryId");
  const target = value(formData, "groupId");
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
    await prisma.$transaction(async (tx) => {
      const grouping = await tx.formGrouping.findUnique({
        where: { formId },
        include: { fields: { where: { role: "ANCHOR" } } },
      });
      if (!grouping) throw new Error("GROUPING_NOT_FOUND");
      const group = await tx.formGroupingGroup.findFirst({
        where: { id: target, groupingId: grouping.id },
      });
      if (!group) throw new Error("GROUP_NOT_FOUND");
      const entry = await tx.formEntry.findFirst({
        where: { id: entryId, formId, status: "SUBMITTED" },
        include: { answers: true },
      });
      if (!entry) throw new Error("MEMBER_NOT_FOUND");

      const anchor = grouping.fields[0];
      const answer = anchor ? entry.answers.find((row) => row.fieldId === anchor.fieldId) : null;
      const isAnchor = Boolean(
        anchor &&
          answer &&
          (answer.valueOptions.some((code) => anchor.options.includes(code)) ||
            (answer.valueBool != null && anchor.options.includes(String(answer.valueBool))))
      );

      const member = await tx.formGroupingMember.upsert({
        where: { groupingId_entryId: { groupingId: grouping.id, entryId } },
        create: { groupingId: grouping.id, groupId: group.id, entryId, isAnchor },
        update: { groupId: group.id },
      });
      await tx.formGrouping.update({
        where: { id: grouping.id },
        data: { manualMoves: { increment: 1 } },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_GROUPING_MOVED",
        entityType: "FormGroupingMember",
        entityId: member.id,
        metadata: { to: group.id, late: true },
      });
    });
    refresh(formId);
  });
}

/**
 * Zet de groepjesmaker uit: de instellingen en de groepen weg, de inzendingen
 * blijven. Het detailscherm bestaat daarna niet meer, dus terug naar de lijst.
 */
export async function deleteGroupingAction(formData: FormData): Promise<void> {
  const formId = value(formData, "formId");
  const locale = value(formData, "locale");
  const { session } = await requireFormCapability(formId, "MANAGE_GROUPING");
  const grouping = await prisma.formGrouping.findUnique({ where: { formId } });
  if (!grouping) redirect(adminPath(locale, ""));
  await prisma.$transaction(async (tx) => {
    await tx.formGrouping.delete({ where: { id: grouping.id } });
    await logFormAudit(tx, {
      formId,
      actorUserId: session.user.id,
      action: "FORM_GROUPING_DELETED",
      entityType: "FormGrouping",
      entityId: grouping.id,
    });
  });
  refresh(formId);
  redirect(adminPath(locale, ""));
}
