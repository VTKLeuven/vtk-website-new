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

type ReserveOutcome =
  | { ok: true; waitlisted: false }
  | { ok: true; waitlisted: true; option: string }
  | { ok: false; option: string };

/**
 * Reserveert de opties met een quotum. Race-veilig door de update zelf te laten
 * tellen (`quotaUsed < quotaLimit`) in plaats van eerst te lezen en dan te
 * schrijven; een `updateMany` die niets raakt, betekent vol.
 *
 * Zit een optie vol en staat er een wachtlijst op, dan claimt deze inzending
 * niets meer en komt ze op de wachtlijst; wat ze al claimde, gaat terug. Anders
 * had ze de helft van haar keuzes bezet zonder plaats te hebben.
 */
async function reserveOptions(
  tx: Prisma.TransactionClient,
  formId: string,
  optionCodes: readonly string[]
): Promise<ReserveOutcome> {
  const claimedCodes: string[] = [];

  for (const code of optionCodes) {
    const options = await tx.formFieldOption.findMany({
      where: { formId, code },
      select: { id: true, quotaLimit: true, allowWaitlist: true },
    });
    for (const option of options) {
      if (option.quotaLimit == null) continue;
      const claimed = await tx.formFieldOption.updateMany({
        where: { id: option.id, quotaUsed: { lt: option.quotaLimit } },
        data: { quotaUsed: { increment: 1 }, version: { increment: 1 } },
      });
      if (claimed.count === 1) {
        claimedCodes.push(code);
        continue;
      }
      if (!option.allowWaitlist) {
        await releaseOptions(tx, formId, claimedCodes);
        return { ok: false, option: code };
      }
      await releaseOptions(tx, formId, claimedCodes);
      return { ok: true, waitlisted: true, option: code };
    }
  }
  return { ok: true, waitlisted: false };
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
  /** Mag een volle inzending op de wachtlijst in plaats van geweigerd te worden? */
  allowWaitlist: boolean;
};

export type SubmitResult =
  | { ok: true; entryId: string; waitlisted: boolean }
  | { ok: false; code: "FULL" | "OPTION_FULL"; option?: string };

class OptionReservationRejected extends Error {
  constructor(readonly option: string) {
    super("OPTION_FULL");
  }
}

export async function saveFormEntry(input: SubmitInput): Promise<SubmitResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      // De telling van hierboven kan intussen achterhaald zijn; dit is de check
      // die telt. Een inzending op de wachtlijst telt niet mee voor `maxEntries`:
      // ze heeft net geen plaats.
      let waitlisted = false;
      if (!input.asDraft && input.maxEntries != null) {
        const submitted = await tx.formEntry.count({
          where: {
            formId: input.formId,
            status: "SUBMITTED",
            isTest: false,
            waitlisted: false,
            ...(input.entryId ? { id: { not: input.entryId } } : {}),
          },
        });
        if (submitted >= input.maxEntries) {
          if (!input.allowWaitlist) return { ok: false, code: "FULL" as const };
          waitlisted = true;
        }
      }

      const existing = input.entryId
        ? await tx.formEntry.findFirst({
            where: { id: input.entryId, formId: input.formId },
            include: { answers: { select: { valueOptions: true } } },
          })
        : null;
      if (input.entryId && !existing) throw new Error("ENTRY_NOT_FOUND");

      // Bij een wijziging eerst teruggeven wat de vorige versie claimde, anders
      // telt dezelfde persoon twee keer mee voor het quotum.
      if (existing && existing.status === "SUBMITTED" && !existing.waitlisted) {
        await releaseOptions(
          tx,
          input.formId,
          existing.answers.flatMap((answer) => answer.valueOptions)
        );
      }

      if (!input.asDraft && !input.isTest && !waitlisted) {
        const reserved = await reserveOptions(tx, input.formId, input.claimedOptions);
        if (!reserved.ok) {
          // Bij een bewerking zijn de vorige quota hierboven al vrijgegeven.
          // Gooien rolt de volledige transactie terug, zodat een geweigerde
          // wijziging de bestaande inzending en haar plaats intact laat.
          throw new OptionReservationRejected(reserved.option);
        }
        if (reserved.waitlisted) waitlisted = true;
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
              waitlisted,
              waitlistedAt: waitlisted ? existing.waitlistedAt ?? new Date() : null,
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
              waitlisted,
              waitlistedAt: waitlisted ? new Date() : null,
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

      return { ok: true as const, entryId: entry.id, waitlisted };
    });
  } catch (error) {
    if (error instanceof OptionReservationRejected) {
      return { ok: false, code: "OPTION_FULL", option: error.option };
    }
    throw error;
  }
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
