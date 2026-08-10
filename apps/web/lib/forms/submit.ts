import "server-only";

import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import type { AnswerValue } from "./visibility";

/**
 * Het bewaren van een inzending, quota inbegrepen.
 *
 * Alles zit in één transactie: antwoorden, bestanden en het aftellen van de
 * quota. Zou het aftellen erbuiten vallen, dan kunnen twee mensen tegelijk de
 * laatste plaats krijgen.
 */

export type AnswerRow = {
  fieldId: string;
  fieldCode: string;
  type: string;
  value: AnswerValue;
};

export type PendingUpload = {
  fieldId: string;
  storageKey: string;
  originalName: string;
  contentType: string | null;
  sizeBytes: number;
};

function answerData(row: AnswerRow) {
  const value = row.value;
  return {
    fieldId: row.fieldId,
    fieldCode: row.fieldCode,
    valueText: value.text ?? null,
    valueNumber: value.number ?? null,
    valueDate:
      row.type === "DATE" && value.text ? new Date(`${value.text}T00:00:00Z`) : null,
    valueBool: value.checked ?? null,
    valueOptions: value.options ?? [],
    otherText: null as string | null,
  };
}

/**
 * Reserveert de opties met een quotum. Race-veilig door de update zelf te laten
 * tellen (`quotaUsed < quotaLimit`) in plaats van eerst te lezen en dan te
 * schrijven; een `updateMany` die niets raakt, betekent vol.
 */
async function reserveOptions(
  tx: Prisma.TransactionClient,
  formId: string,
  optionCodes: readonly string[]
): Promise<string | null> {
  for (const code of optionCodes) {
    const options = await tx.formFieldOption.findMany({
      where: { formId, code },
      select: { id: true, quotaLimit: true },
    });
    for (const option of options) {
      if (option.quotaLimit == null) continue;
      const claimed = await tx.formFieldOption.updateMany({
        where: { id: option.id, quotaUsed: { lt: option.quotaLimit } },
        data: { quotaUsed: { increment: 1 }, version: { increment: 1 } },
      });
      if (claimed.count === 0) return code;
    }
  }
  return null;
}

/** Geeft de quota van een ingetrokken of gewijzigde inzending terug. */
async function releaseOptions(
  tx: Prisma.TransactionClient,
  formId: string,
  optionCodes: readonly string[]
): Promise<void> {
  for (const code of optionCodes) {
    await tx.formFieldOption.updateMany({
      where: { formId, code, quotaUsed: { gt: 0 } },
      data: { quotaUsed: { decrement: 1 }, version: { increment: 1 } },
    });
  }
}

export type SubmitInput = {
  formId: string;
  entryId?: string | null;
  submittedById: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  locale: "NL" | "EN";
  isTest: boolean;
  requestFingerprint: string | null;
  answers: AnswerRow[];
  uploads: PendingUpload[];
  /** Optiecodes met een quotum die deze inzending claimt. */
  claimedOptions: string[];
  /** Bij een concept telt het quotum nog niet mee: enkel indienen claimt. */
  asDraft: boolean;
  /** Harde grens op het aantal inzendingen, opnieuw gecheckt in de transactie. */
  maxEntries: number | null;
};

export type SubmitResult =
  | { ok: true; entryId: string }
  | { ok: false; code: "FULL" | "OPTION_FULL"; option?: string };

export async function saveFormEntry(input: SubmitInput): Promise<SubmitResult> {
  return prisma.$transaction(async (tx) => {
    // De telling van hierboven kan intussen achterhaald zijn; dit is de check
    // die telt.
    if (!input.asDraft && input.maxEntries != null) {
      const submitted = await tx.formEntry.count({
        where: {
          formId: input.formId,
          status: "SUBMITTED",
          isTest: false,
          ...(input.entryId ? { id: { not: input.entryId } } : {}),
        },
      });
      if (submitted >= input.maxEntries) return { ok: false, code: "FULL" as const };
    }

    const existing = input.entryId
      ? await tx.formEntry.findFirst({
          where: { id: input.entryId, formId: input.formId },
          include: { answers: { select: { valueOptions: true } } },
        })
      : null;

    // Bij een wijziging eerst teruggeven wat de vorige versie claimde, anders
    // telt dezelfde persoon twee keer mee voor het quotum.
    if (existing && existing.status === "SUBMITTED") {
      await releaseOptions(
        tx,
        input.formId,
        existing.answers.flatMap((answer) => answer.valueOptions)
      );
    }

    if (!input.asDraft && !input.isTest) {
      const full = await reserveOptions(tx, input.formId, input.claimedOptions);
      if (full) return { ok: false, code: "OPTION_FULL" as const, option: full };
    }

    const entry = existing
      ? await tx.formEntry.update({
          where: { id: existing.id },
          data: {
            status: input.asDraft ? "DRAFT" : "SUBMITTED",
            submitterName: input.submitterName,
            submitterEmail: input.submitterEmail,
            locale: input.locale,
            submittedAt: input.asDraft ? null : existing.submittedAt ?? new Date(),
          },
          select: { id: true },
        })
      : await tx.formEntry.create({
          data: {
            formId: input.formId,
            status: input.asDraft ? "DRAFT" : "SUBMITTED",
            submittedById: input.submittedById,
            submitterName: input.submitterName,
            submitterEmail: input.submitterEmail,
            locale: input.locale,
            isTest: input.isTest,
            requestFingerprint: input.requestFingerprint,
            submittedAt: input.asDraft ? null : new Date(),
          },
          select: { id: true },
        });

    // Antwoorden volledig vervangen: een veld dat onzichtbaar werd, hoort geen
    // oud antwoord meer achter te laten.
    await tx.formAnswer.deleteMany({ where: { entryId: entry.id } });
    for (const row of input.answers) {
      await tx.formAnswer.create({
        data: { formId: input.formId, entryId: entry.id, ...answerData(row) },
      });
    }

    if (input.uploads.length > 0) {
      await tx.formFileUpload.createMany({
        data: input.uploads.map((upload) => ({
          formId: input.formId,
          entryId: entry.id,
          fieldId: upload.fieldId,
          storageKey: upload.storageKey,
          originalName: upload.originalName,
          contentType: upload.contentType,
          sizeBytes: upload.sizeBytes,
        })),
      });
    }

    return { ok: true as const, entryId: entry.id };
  });
}

/**
 * Diende dit adres of r-nummer al eerder in? Bedoeld om te waarschuwen, niet om
 * te blokkeren: iemand kan een tweede keer indienen voor een huisgenoot, en een
 * harde blokkade op e-mail is te omzeilen met een plusadres.
 */
export async function findDuplicateEntry(
  formId: string,
  email: string | null,
  excludeEntryId?: string | null
): Promise<{ id: string; submittedAt: Date | null } | null> {
  if (!email) return null;
  return prisma.formEntry.findFirst({
    where: {
      formId,
      status: "SUBMITTED",
      isTest: false,
      submitterEmail: email.toLowerCase(),
      ...(excludeEntryId ? { id: { not: excludeEntryId } } : {}),
    },
    select: { id: true, submittedAt: true },
    orderBy: { submittedAt: "desc" },
  });
}
