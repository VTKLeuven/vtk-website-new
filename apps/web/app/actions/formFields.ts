"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireFormCapability } from "@/lib/forms/authorization";
import { logFormAudit } from "@/lib/forms/audit";
import {
  FORM_FIELD_TYPES,
  canChangeTypeWithAnswers,
  fieldCodeFrom,
  isChoiceType,
  optionCodeFrom,
  validateFieldConfig,
} from "@/lib/forms/schema";
import { wouldCreateCycle } from "@/lib/forms/visibility";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

const fieldDraftSchema = z.object({
  id: z.string().nullish(),
  sectionId: z.string().nullish(),
  type: z.enum(FORM_FIELD_TYPES),
  labelNl: z.string().trim().min(1).max(300),
  labelEn: z.string().trim().max(300).nullish(),
  helpNl: z.string().trim().max(2_000).nullish(),
  helpEn: z.string().trim().max(2_000).nullish(),
  required: z.boolean(),
  config: z.unknown(),
  options: z
    .array(
      z.object({
        id: z.string().nullish(),
        labelNl: z.string().trim().min(1).max(300),
        labelEn: z.string().trim().max(300).nullish(),
        quotaLimit: z.number().int().min(1).max(100_000).nullish(),
      })
    )
    .max(200)
    .default([]),
  conditions: z
    .array(
      z.object({
        sourceFieldId: z.string().min(1),
        operator: z.enum(["EQUALS", "NOT_EQUALS", "INCLUDES", "IS_ANSWERED"]),
        value: z.string().max(300).nullish(),
      })
    )
    .max(10)
    .default([]),
});

export type FormFieldDraft = z.input<typeof fieldDraftSchema>;

const EXPECTED_ERRORS = new Set([
  "FORBIDDEN",
  "FORM_NOT_FOUND",
  "FIELD_NOT_FOUND",
  "FIELD_TYPE_LOCKED",
  "CHOICE_OPTIONS_REQUIRED",
  "CONDITION_CYCLE",
  "CONDITION_SOURCE_INVALID",
  "QUOTA_BELOW_USED",
  "INVALID_FIELD_CONFIG",
  "INVALID_FIELD_RANGE",
  "INVALID_FIELD_PATTERN",
  "SECTION_NOT_FOUND",
]);

async function guard(run: () => Promise<void>): Promise<SaveState> {
  try {
    await run();
    return saveOk();
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_ERRORS.has(code) || code.startsWith("INVALID_")) return saveError(code);
    console.error("Veldeditor-actie mislukt", error);
    throw error;
  }
}

function refresh(formId: string) {
  for (const base of ["", "/en"]) {
    revalidatePath(`${base}/admin/formulieren/${formId}/velden`);
    revalidatePath(`${base}/admin/formulieren/${formId}`);
  }
}

/**
 * Eén veld opslaan, met zijn opties en condities in dezelfde transactie.
 *
 * Bewust één actie in plaats van een reeks kleine: een veld met opties en
 * condities is één ding voor wie het bewerkt, en half opgeslagen (opties wel,
 * condities niet) is een toestand die niemand wil.
 */
export async function saveFormFieldAction(
  formId: string,
  rawDraft: unknown
): Promise<SaveState> {
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_FORM");
    const draft = fieldDraftSchema.parse(rawDraft);
    const config = validateFieldConfig(draft.type, draft.config) as Prisma.InputJsonValue;

    if (isChoiceType(draft.type) && draft.options.length < 1) {
      throw new Error("CHOICE_OPTIONS_REQUIRED");
    }

    const existing = draft.id
      ? await prisma.formField.findFirst({
          where: { id: draft.id, formId },
          include: { options: true, _count: { select: { answers: true } } },
        })
      : null;
    if (draft.id && !existing) throw new Error("FIELD_NOT_FOUND");

    if (draft.sectionId) {
      const section = await prisma.formSection.count({
        where: { id: draft.sectionId, formId },
      });
      if (!section) throw new Error("SECTION_NOT_FOUND");
    }

    // Een typewissel mag de bestaande antwoorden niet in de verkeerde kolom
    // zetten; de editor waarschuwt hiervoor, dit is het slot erachter.
    if (
      existing &&
      existing.type !== draft.type &&
      existing._count.answers > 0 &&
      !canChangeTypeWithAnswers(existing.type, draft.type)
    ) {
      throw new Error("FIELD_TYPE_LOCKED");
    }

    const siblings = await prisma.formField.findMany({
      where: { formId, ...(draft.id ? { id: { not: draft.id } } : {}) },
      select: { id: true, code: true, sortOrder: true },
    });
    const takenCodes = siblings.map((sibling) => sibling.code);

    const conditions = draft.conditions ?? [];
    for (const condition of conditions) {
      if (!siblings.some((sibling) => sibling.id === condition.sourceFieldId)) {
        throw new Error("CONDITION_SOURCE_INVALID");
      }
    }

    await prisma.$transaction(async (tx) => {
      const fieldId = existing
        ? (
            await tx.formField.update({
              where: { id: existing.id },
              data: {
                sectionId: draft.sectionId ?? null,
                type: draft.type,
                labelNl: draft.labelNl,
                labelEn: draft.labelEn || null,
                helpNl: draft.helpNl || null,
                helpEn: draft.helpEn || null,
                required: draft.required,
                config,
              },
              select: { id: true },
            })
          ).id
        : (
            await tx.formField.create({
              data: {
                formId,
                sectionId: draft.sectionId ?? null,
                // De code wordt één keer afgeleid en wijzigt daarna nooit meer:
                // hij is de kolomnaam in de export en de sleutel in een
                // prefill-link.
                code: fieldCodeFrom(draft.labelNl, takenCodes),
                type: draft.type,
                sortOrder:
                  siblings.reduce((max, sibling) => Math.max(max, sibling.sortOrder), -1) + 1,
                labelNl: draft.labelNl,
                labelEn: draft.labelEn || null,
                helpNl: draft.helpNl || null,
                helpEn: draft.helpEn || null,
                required: draft.required,
                config,
              },
              select: { id: true },
            })
          ).id;

      // Condities van dít veld vervangen. De kringcheck draait tegen alle
      // andere condities van het formulier, niet enkel tegen die van dit veld.
      const otherConditions = await tx.formFieldCondition.findMany({
        where: { formId, fieldId: { not: fieldId } },
        select: { fieldId: true, sourceFieldId: true, operator: true, value: true },
      });
      for (const condition of conditions) {
        if (
          wouldCreateCycle(otherConditions, {
            fieldId,
            sourceFieldId: condition.sourceFieldId,
          })
        ) {
          throw new Error("CONDITION_CYCLE");
        }
      }
      await tx.formFieldCondition.deleteMany({ where: { formId, fieldId } });
      for (const [index, condition] of conditions.entries()) {
        await tx.formFieldCondition.create({
          data: {
            formId,
            fieldId,
            sourceFieldId: condition.sourceFieldId,
            operator: condition.operator,
            value: condition.operator === "IS_ANSWERED" ? null : condition.value || null,
            sortOrder: index,
          },
        });
      }

      if (isChoiceType(draft.type)) {
        await syncOptions(tx, { formId, fieldId, options: draft.options ?? [] });
      }

      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: existing ? "FORM_FIELD_UPDATED" : "FORM_FIELD_CREATED",
        entityType: "FormField",
        entityId: fieldId,
        metadata: { type: draft.type },
      });
    });

    refresh(formId);
  });
}

/**
 * Opties bijwerken zonder bestaande antwoorden te beschadigen.
 *
 * Een optie die verdwijnt uit de lijst wordt gearchiveerd wanneer iemand ze al
 * aanduidde, en pas echt verwijderd wanneer niemand ze koos. Zo blijft een
 * ingediend antwoord leesbaar in de export nadat de beheerder de optie schrapte.
 */
async function syncOptions(
  tx: Prisma.TransactionClient,
  input: {
    formId: string;
    fieldId: string;
    options: Array<{
      id?: string | null;
      labelNl: string;
      labelEn?: string | null;
      quotaLimit?: number | null;
    }>;
  }
) {
  const existing = await tx.formFieldOption.findMany({
    where: { fieldId: input.fieldId },
  });
  const keptIds = new Set(
    input.options.map((option) => option.id).filter((id): id is string => Boolean(id))
  );
  const takenCodes = existing.map((option) => option.code);

  for (const [index, option] of input.options.entries()) {
    const current = option.id ? existing.find((row) => row.id === option.id) : null;
    if (current) {
      // Een quotum onder wat al gebruikt is, zou de teller negatief maken en
      // bestaande inzendingen ongeldig verklaren.
      if (option.quotaLimit != null && option.quotaLimit < current.quotaUsed) {
        throw new Error("QUOTA_BELOW_USED");
      }
      await tx.formFieldOption.update({
        where: { id: current.id },
        data: {
          labelNl: option.labelNl,
          labelEn: option.labelEn || null,
          quotaLimit: option.quotaLimit ?? null,
          sortOrder: index,
          archivedAt: null,
        },
      });
      continue;
    }
    const code = optionCodeFrom(option.labelNl, takenCodes);
    takenCodes.push(code);
    await tx.formFieldOption.create({
      data: {
        formId: input.formId,
        fieldId: input.fieldId,
        code,
        labelNl: option.labelNl,
        labelEn: option.labelEn || null,
        quotaLimit: option.quotaLimit ?? null,
        sortOrder: index,
      },
    });
  }

  for (const option of existing) {
    if (keptIds.has(option.id)) continue;
    const used = await tx.formAnswer.count({
      where: { fieldId: input.fieldId, valueOptions: { has: option.code } },
    });
    if (used > 0) {
      await tx.formFieldOption.update({
        where: { id: option.id },
        data: { archivedAt: option.archivedAt ?? new Date() },
      });
    } else {
      await tx.formFieldOption.delete({ where: { id: option.id } });
    }
  }
}

export async function reorderFormFieldsAction(
  formId: string,
  order: Array<{ id: string; sectionId: string | null }>
): Promise<SaveState> {
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_FORM");
    const fields = await prisma.formField.findMany({
      where: { formId },
      select: { id: true },
    });
    const known = new Set(fields.map((field) => field.id));

    await prisma.$transaction(async (tx) => {
      for (const [index, entry] of order.entries()) {
        if (!known.has(entry.id)) continue;
        await tx.formField.update({
          where: { id: entry.id },
          data: { sortOrder: index, sectionId: entry.sectionId },
        });
      }
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_FIELDS_REORDERED",
        entityType: "Form",
        entityId: formId,
      });
    });

    refresh(formId);
  });
}

/**
 * Verwijderen of archiveren, afhankelijk van wat eraan hangt. Een veld met
 * antwoorden verdwijnt van het formulier maar houdt zijn kolom in de export;
 * hard verwijderen zou bestaande inzendingen uithollen.
 */
export async function removeFormFieldAction(formData: FormData): Promise<void> {
  const formId = String(formData.get("formId") ?? "");
  const fieldId = String(formData.get("fieldId") ?? "");
  const { session } = await requireFormCapability(formId, "MANAGE_FORM");

  const field = await prisma.formField.findFirst({
    where: { id: fieldId, formId },
    include: { _count: { select: { answers: true, uploads: true } } },
  });
  if (!field) throw new Error("FIELD_NOT_FOUND");
  const hasAnswers = field._count.answers > 0 || field._count.uploads > 0;

  await prisma.$transaction(async (tx) => {
    if (hasAnswers) {
      await tx.formField.update({
        where: { id: fieldId },
        data: { archivedAt: field.archivedAt ?? new Date() },
      });
    } else {
      // Condities die naar dit veld wijzen, verdwijnen mee: een conditie op een
      // vraag die niet meer bestaat, verbergt haar doelveld voorgoed.
      await tx.formFieldCondition.deleteMany({
        where: { formId, OR: [{ fieldId }, { sourceFieldId: fieldId }] },
      });
      await tx.formField.delete({ where: { id: fieldId } });
    }
    await logFormAudit(tx, {
      formId,
      actorUserId: session.user.id,
      action: hasAnswers ? "FORM_FIELD_ARCHIVED" : "FORM_FIELD_DELETED",
      entityType: "FormField",
      entityId: fieldId,
      metadata: { code: field.code },
    });
  });

  refresh(formId);
}

export async function duplicateFormFieldAction(
  formId: string,
  fieldId: string
): Promise<SaveState> {
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_FORM");
    const field = await prisma.formField.findFirst({
      where: { id: fieldId, formId },
      include: { options: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } },
    });
    if (!field) throw new Error("FIELD_NOT_FOUND");

    const siblings = await prisma.formField.findMany({
      where: { formId },
      select: { code: true, sortOrder: true },
    });

    await prisma.$transaction(async (tx) => {
      const copy = await tx.formField.create({
        data: {
          formId,
          sectionId: field.sectionId,
          code: fieldCodeFrom(
            field.labelNl,
            siblings.map((sibling) => sibling.code)
          ),
          type: field.type,
          sortOrder:
            siblings.reduce((max, sibling) => Math.max(max, sibling.sortOrder), -1) + 1,
          labelNl: field.labelNl,
          labelEn: field.labelEn,
          helpNl: field.helpNl,
          helpEn: field.helpEn,
          required: field.required,
          config: field.config as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      const takenCodes: string[] = [];
      for (const [index, option] of field.options.entries()) {
        const code = optionCodeFrom(option.labelNl, takenCodes);
        takenCodes.push(code);
        await tx.formFieldOption.create({
          data: {
            formId,
            fieldId: copy.id,
            code,
            labelNl: option.labelNl,
            labelEn: option.labelEn,
            // Het quotum gaat mee, de teller niet: dit is een nieuwe vraag.
            quotaLimit: option.quotaLimit,
            sortOrder: index,
          },
        });
      }

      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_FIELD_DUPLICATED",
        entityType: "FormField",
        entityId: copy.id,
        metadata: { sourceFieldId: fieldId },
      });
    });

    refresh(formId);
  });
}

// -----------------------------------------------------------------------------
// Secties
// -----------------------------------------------------------------------------

const sectionDraftSchema = z.object({
  id: z.string().nullish(),
  titleNl: z.string().trim().min(1).max(300),
  titleEn: z.string().trim().max(300).nullish(),
  descriptionNl: z.string().trim().max(2_000).nullish(),
  descriptionEn: z.string().trim().max(2_000).nullish(),
});

export async function saveFormSectionAction(
  formId: string,
  rawDraft: unknown
): Promise<SaveState> {
  return guard(async () => {
    const { session } = await requireFormCapability(formId, "MANAGE_FORM");
    const draft = sectionDraftSchema.parse(rawDraft);

    const data = {
      titleNl: draft.titleNl,
      titleEn: draft.titleEn || null,
      descriptionNl: draft.descriptionNl || null,
      descriptionEn: draft.descriptionEn || null,
    };

    await prisma.$transaction(async (tx) => {
      if (draft.id) {
        const existing = await tx.formSection.count({ where: { id: draft.id, formId } });
        if (!existing) throw new Error("SECTION_NOT_FOUND");
        await tx.formSection.update({ where: { id: draft.id }, data });
      } else {
        const last = await tx.formSection.findFirst({
          where: { formId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        await tx.formSection.create({
          data: { ...data, formId, sortOrder: (last?.sortOrder ?? -1) + 1 },
        });
      }
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: draft.id ? "FORM_SECTION_UPDATED" : "FORM_SECTION_CREATED",
        entityType: "FormSection",
        entityId: draft.id ?? null,
      });
    });

    refresh(formId);
  });
}

/**
 * Een sectie verwijderen laat haar velden staan: die schuiven naar het deel
 * boven de eerste sectie. Velden mee weggooien zou antwoorden meenemen, en dat
 * is niet wat "sectie verwijderen" betekent.
 */
export async function deleteFormSectionAction(formData: FormData): Promise<void> {
  const formId = String(formData.get("formId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const { session } = await requireFormCapability(formId, "MANAGE_FORM");

  const section = await prisma.formSection.findFirst({ where: { id: sectionId, formId } });
  if (!section) throw new Error("SECTION_NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    await tx.formField.updateMany({ where: { formId, sectionId }, data: { sectionId: null } });
    await tx.formSection.delete({ where: { id: sectionId } });
    await logFormAudit(tx, {
      formId,
      actorUserId: session.user.id,
      action: "FORM_SECTION_DELETED",
      entityType: "FormSection",
      entityId: sectionId,
    });
  });

  refresh(formId);
}
