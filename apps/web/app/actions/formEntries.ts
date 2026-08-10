"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { z } from "zod";
import { requireFormCapability } from "@/lib/forms/authorization";
import { logFormAudit } from "@/lib/forms/audit";
import { answerLines } from "@/lib/forms/outbox";
import { fillPlaceholders } from "@/lib/forms/mail";
import { sendMail, smtpConfigured } from "@/lib/mail";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";

const localeSchema = z.enum(["nl", "en"]);
const reviewSchema = z.enum(["NEW", "ACCEPTED", "REJECTED"]);

const EXPECTED_ERRORS = new Set([
  "FORBIDDEN",
  "FORM_NOT_FOUND",
  "ENTRY_NOT_FOUND",
  "NO_RECIPIENTS",
  "SUBJECT_REQUIRED",
  "BODY_REQUIRED",
  "NO_MAILSERVER",
  "REVIEWER_NOT_FOUND",
]);

async function guard(run: () => Promise<void>): Promise<SaveState> {
  try {
    await run();
    return saveOk();
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_ERRORS.has(code) || code.startsWith("INVALID_")) return saveError(code);
    console.error("Actie op inzending mislukt", error);
    throw error;
  }
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function refresh(locale: "nl" | "en", formId: string, entryId?: string) {
  const prefix = locale === "en" ? "/en" : "";
  revalidatePath(`${prefix}/admin/formulieren/${formId}/inzendingen`);
  if (entryId) revalidatePath(`${prefix}/admin/formulieren/${formId}/inzendingen/${entryId}`);
  revalidatePath(`${prefix}/admin/formulieren/${formId}`);
}

/** Status, notitie en beoordelaar van één inzending. */
export async function saveEntryReviewAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  return guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const formId = value(formData, "formId");
    const entryId = value(formData, "entryId");
    const { session } = await requireFormCapability(formId, "MANAGE_ENTRIES");

    const entry = await prisma.formEntry.findFirst({
      where: { id: entryId, formId },
      select: { id: true, reviewStatus: true },
    });
    if (!entry) throw new Error("ENTRY_NOT_FOUND");

    const reviewStatus = reviewSchema.parse(value(formData, "reviewStatus") || "NEW");
    const note = value(formData, "internalNote").slice(0, 5_000) || null;
    const reviewerEmail = value(formData, "reviewerEmail").toLowerCase();

    let reviewerId: string | null = null;
    if (reviewerEmail) {
      const reviewer = await prisma.user.findFirst({
        where: { email: reviewerEmail, deletedAt: null },
        select: { id: true },
      });
      if (!reviewer) throw new Error("REVIEWER_NOT_FOUND");
      reviewerId = reviewer.id;
    }

    await prisma.$transaction(async (tx) => {
      await tx.formEntry.update({
        where: { id: entryId },
        data: { reviewStatus, internalNote: note, reviewerId },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_ENTRY_REVIEWED",
        entityType: "FormEntry",
        entityId: entryId,
        metadata: { from: entry.reviewStatus, to: reviewStatus },
      });
    });

    refresh(locale, formId, entryId);
  });
}

/**
 * Een inzending verwijderen, met haar bestanden. De geclaimde quota gaan terug
 * naar de pot; anders blijft een geannuleerde inschrijving een plaats bezetten.
 */
export async function deleteFormEntryAction(formData: FormData): Promise<void> {
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const formId = value(formData, "formId");
  const entryId = value(formData, "entryId");
  const { session } = await requireFormCapability(formId, "MANAGE_ENTRIES");

  const entry = await prisma.formEntry.findFirst({
    where: { id: entryId, formId },
    include: { answers: { select: { valueOptions: true } }, uploads: true },
  });
  if (!entry) throw new Error("ENTRY_NOT_FOUND");

  const optionCodes = entry.answers.flatMap((answer) => answer.valueOptions);

  await prisma.$transaction(async (tx) => {
    if (entry.status === "SUBMITTED") {
      for (const code of optionCodes) {
        await tx.formFieldOption.updateMany({
          where: { formId, code, quotaUsed: { gt: 0 } },
          data: { quotaUsed: { decrement: 1 }, version: { increment: 1 } },
        });
      }
    }
    await tx.formEntry.delete({ where: { id: entryId } });
    await logFormAudit(tx, {
      formId,
      actorUserId: session.user.id,
      action: "FORM_ENTRY_DELETED",
      entityType: "FormEntry",
      entityId: entryId,
      metadata: { email: entry.submitterEmail },
    });
  });

  // Pas na de transactie: een mislukte verwijdering in de opslag mag de rij niet
  // laten terugkomen, en een wees in de opslag is minder erg dan een rij die
  // naar een bestand wijst dat er niet meer is.
  for (const upload of entry.uploads) {
    await deleteObject(upload.storageKey).catch((error) => {
      console.error("[forms] bestand verwijderen mislukt", upload.storageKey, error);
    });
  }

  refresh(locale, formId);
}

// -----------------------------------------------------------------------------
// Mailing naar deelnemers
// -----------------------------------------------------------------------------

const mailingSchema = z.object({
  formId: z.string().min(1),
  locale: localeSchema,
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  /** Leeg betekent: iedereen die voldoet aan de huidige filter. */
  entryIds: z.array(z.string()).max(5_000).default([]),
  reviewStatus: z.string().nullish(),
  includeTest: z.boolean().default(false),
});

export type MailingPreview = {
  recipients: number;
  sample: { to: string; subject: string; text: string } | null;
  missingEmail: number;
};

async function mailingTargets(input: z.infer<typeof mailingSchema>) {
  return prisma.formEntry.findMany({
    where: {
      formId: input.formId,
      status: "SUBMITTED",
      ...(input.includeTest ? {} : { isTest: false }),
      ...(input.entryIds.length > 0 ? { id: { in: input.entryIds } } : {}),
      ...(["NEW", "ACCEPTED", "REJECTED"].includes(input.reviewStatus ?? "")
        ? { reviewStatus: input.reviewStatus as "NEW" | "ACCEPTED" | "REJECTED" }
        : {}),
    },
    select: { id: true, submitterName: true, submitterEmail: true, locale: true },
    orderBy: { submittedAt: "asc" },
  });
}

/**
 * Wat er zou vertrekken, zonder iets te versturen. Verplicht vóór het echte
 * verzenden: een mailing naar honderden mensen mag geen verrassing zijn.
 */
export async function previewFormMailingAction(rawInput: unknown): Promise<MailingPreview> {
  const input = mailingSchema.parse(rawInput);
  await requireFormCapability(input.formId, "MAIL_PARTICIPANTS");

  const targets = await mailingTargets(input);
  const withEmail = targets.filter((target) => target.submitterEmail);
  const first = withEmail[0];

  return {
    recipients: withEmail.length,
    missingEmail: targets.length - withEmail.length,
    sample: first
      ? {
          to: first.submitterEmail as string,
          subject: fillPlaceholders(input.subject, {
            naam: first.submitterName ?? "",
            name: first.submitterName ?? "",
          }),
          text: fillPlaceholders(input.body, {
            naam: first.submitterName ?? "",
            name: first.submitterName ?? "",
            antwoorden: (await answerLines(first.id, input.locale))
              .map((line) => `${line.label}: ${line.value}`)
              .join("\n"),
          }),
        }
      : null,
  };
}

export async function sendFormMailingAction(rawInput: unknown): Promise<SaveState> {
  return guard(async () => {
    const input = mailingSchema.parse(rawInput);
    const { session, form } = await requireFormCapability(input.formId, "MAIL_PARTICIPANTS");
    if (!smtpConfigured()) throw new Error("NO_MAILSERVER");

    const targets = (await mailingTargets(input)).filter((target) => target.submitterEmail);
    if (targets.length === 0) throw new Error("NO_RECIPIENTS");

    let sent = 0;
    for (const target of targets) {
      const values = {
        naam: target.submitterName ?? "",
        name: target.submitterName ?? "",
        formulier: form.titleNl,
        antwoorden: (await answerLines(target.id, input.locale))
          .map((line) => `${line.label}: ${line.value}`)
          .join("\n"),
      };
      const ok = await sendMail({
        to: target.submitterEmail as string,
        subject: fillPlaceholders(input.subject, values),
        text: fillPlaceholders(input.body, values),
      });
      if (ok) sent += 1;
    }

    await logFormAudit(prisma, {
      formId: input.formId,
      actorUserId: session.user.id,
      action: "FORM_MAILING_SENT",
      entityType: "Form",
      entityId: input.formId,
      metadata: { recipients: targets.length, sent, subject: input.subject },
    });

    refresh(input.locale, input.formId);
  });
}
