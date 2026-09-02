"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import { deleteObject } from "@vtk/storage";
import { z } from "zod";
import { requireFormCapability } from "@/lib/forms/authorization";
import {
  formConditions,
  loadPublicForm,
  type PublicFormData,
} from "@/lib/forms/publicForm";
import { claimedOptionCodes, validateSubmission } from "@/lib/forms/validation";
import { saveFormEntry } from "@/lib/forms/submit";
import type { AnswerValue } from "@/lib/forms/visibility";
import { extensionOf } from "@/lib/forms/uploadToken";
import { logFormAudit } from "@/lib/forms/audit";
import { answerLines } from "@/lib/forms/outbox";
import { fillPlaceholders } from "@/lib/forms/mail";
import { sendMail, smtpConfigured } from "@/lib/email";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";

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
  "STILL_FULL",
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

/** Titel van het formulier, voor een leesbare regel in het adminlogboek. */
async function formTitle(formId: string): Promise<string> {
  const form = await prisma.form.findUnique({ where: { id: formId }, select: { titleNl: true } });
  return form?.titleNl ?? formId;
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

    await logAudit({
      action: "update",
      entity: "formEntry",
      entityId: entryId,
      target: await formTitle(formId),
      summary: `inzending beoordeeld: ${entry.reviewStatus} naar ${reviewStatus}`,
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

  await logAudit({
    action: "delete",
    entity: "formEntry",
    entityId: entryId,
    target: entry.submitterEmail ?? (await formTitle(formId)),
    summary: `inzending op ${await formTitle(formId)} verwijderd, met ${
      entry.uploads.length
    } bestand(en)`,
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
      const ok = await sendMail(
        {
          to: target.submitterEmail as string,
          subject: fillPlaceholders(input.subject, values),
          text: fillPlaceholders(input.body, values),
        },
        { source: "forms" },
      );
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

    await logAudit({
      action: "send",
      entity: "formMailing",
      entityId: input.formId,
      target: form.titleNl,
      summary: `"${input.subject}" naar ${sent} van ${targets.length} deelnemer(s)`,
    });

    refresh(input.locale, input.formId);
  });
}

// -----------------------------------------------------------------------------
// Een inzending toevoegen namens iemand anders
// -----------------------------------------------------------------------------

const managedAnswerSchema = z.object({
  text: z.string().max(20_000).nullish(),
  number: z.number().nullish(),
  checked: z.boolean().nullish(),
  options: z.array(z.string().max(60)).max(200).nullish(),
});

const behalfSchema = z.object({
  formId: z.string().min(1),
  locale: localeSchema,
  submitterName: z.string().trim().max(200).nullish(),
  submitterEmail: z.string().trim().max(320).nullish(),
  answers: z.record(z.string(), managedAnswerSchema),
});

const editEntrySchema = behalfSchema.extend({ entryId: z.string().min(1) });

export type BehalfResult =
  | { status: "ok"; entryId: string }
  | { status: "invalid"; errors: Record<string, string> }
  | { status: "rejected"; reason: string };

type ManagedEntryInput = z.infer<typeof behalfSchema> & { entryId?: string };

type StoredAnswer = {
  fieldId: string;
  fieldCode: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
  valueOptions: string[];
  field: { type: string };
};

function storedAnswerValue(answer: StoredAnswer): AnswerValue {
  return {
    text: answer.valueText,
    number: answer.valueNumber,
    checked: answer.valueBool,
    options: answer.valueOptions,
  };
}

function validationFields(
  form: PublicFormData,
  existingAnswers: readonly StoredAnswer[]
) {
  const existingOptions = new Map(
    existingAnswers.map((answer) => [answer.fieldId, new Set(answer.valueOptions)])
  );

  return form.fields.map((field) => {
    const activeCodes = new Set(field.options.map((option) => option.code));
    const retainedCodes = [...(existingOptions.get(field.id) ?? [])].filter(
      (code) => !activeCodes.has(code)
    );
    return {
      id: field.id,
      code: field.code,
      type: field.type,
      required: field.required,
      config: field.config,
      sectionId: field.sectionId,
      sortOrder: field.sortOrder,
      options: [
        ...field.options.map((option) => ({
          code: option.code,
          archivedAt: option.archivedAt,
        })),
        // Een intussen geschrapte keuze mag bij een bewerking blijven staan,
        // maar de client kan geen andere geschrapte keuze toevoegen.
        ...retainedCodes.map((code) => ({ code, archivedAt: null })),
      ],
    };
  });
}

async function saveManagedEntry(input: ManagedEntryInput): Promise<BehalfResult> {
  const { session, form } = await requireFormCapability(input.formId, "MANAGE_ENTRIES");
  const full = await loadPublicForm(form.slug);
  if (!full) return { status: "rejected", reason: "FORM_NOT_FOUND" };

  const existing = input.entryId
    ? await prisma.formEntry.findFirst({
        where: { id: input.entryId, formId: input.formId, status: "SUBMITTED" },
        select: {
          id: true,
          submittedById: true,
          locale: true,
          isTest: true,
          requestFingerprint: true,
          answers: {
            select: {
              fieldId: true,
              fieldCode: true,
              valueText: true,
              valueNumber: true,
              valueBool: true,
              valueOptions: true,
              field: { select: { type: true } },
            },
          },
          uploads: { select: { fieldId: true, originalName: true } },
        },
      })
    : null;
  if (input.entryId && !existing) {
    return { status: "rejected", reason: "ENTRY_NOT_FOUND" };
  }

  const fields = validationFields(full, existing?.answers ?? []);
  const fileCounts: Record<string, { count: number; extensions: string[] }> = {};
  for (const upload of existing?.uploads ?? []) {
    const info = (fileCounts[upload.fieldId] ??= { count: 0, extensions: [] });
    info.count += 1;
    info.extensions.push(extensionOf(upload.originalName));
  }

  const retainedOptionPairs = (existing?.answers ?? []).flatMap((answer) =>
    answer.valueOptions
      .filter(
        (code) =>
          !full.fields
            .find((field) => field.id === answer.fieldId)
            ?.options.some((option) => option.code === code)
      )
      .map((code) => ({ fieldId: answer.fieldId, code }))
  );
  const retainedOptionRoutes =
    retainedOptionPairs.length > 0
      ? await prisma.formFieldOption.findMany({
          where: {
            formId: input.formId,
            OR: retainedOptionPairs,
          },
          select: { fieldId: true, code: true, nextSectionId: true, endsForm: true },
        })
      : [];

  const validation = validateSubmission({
    fields,
    conditions: formConditions(full),
    answers: input.answers as Record<string, AnswerValue>,
    fileCounts,
    sections: full.stepBySections ? full.sections : undefined,
    branchOptions: full.stepBySections
      ? [
          ...full.fields.flatMap((field) =>
            field.options.map((option) => ({
              fieldId: field.id,
              code: option.code,
              nextSectionId: option.nextSectionId,
              endsForm: option.endsForm,
            }))
          ),
          ...retainedOptionRoutes,
        ]
      : undefined,
  });
  if (Object.keys(validation.errors).length > 0) {
    return { status: "invalid", errors: validation.errors };
  }

  const fieldById = new Map(full.fields.map((field) => [field.id, field]));
  const activeFieldIds = new Set(full.fields.map((field) => field.id));
  const retainedAnswers = (existing?.answers ?? [])
    .filter((answer) => !activeFieldIds.has(answer.fieldId))
    .map((answer) => ({
      fieldId: answer.fieldId,
      fieldCode: answer.fieldCode,
      type: answer.field.type,
      value: storedAnswerValue(answer),
    }));

  const result = await saveFormEntry({
    formId: full.id,
    entryId: existing?.id ?? null,
    submittedById: existing?.submittedById ?? null,
    submitterName: input.submitterName?.trim() || null,
    submitterEmail: input.submitterEmail?.trim().toLowerCase() || null,
    locale: existing?.locale ?? (input.locale === "en" ? "EN" : "NL"),
    isTest: existing?.isTest ?? false,
    requestFingerprint: existing?.requestFingerprint ?? null,
    answers: [
      ...Object.entries(validation.cleaned).map(([fieldId, answerValue]) => ({
        fieldId,
        fieldCode: fieldById.get(fieldId)?.code ?? fieldId,
        type: fieldById.get(fieldId)?.type ?? "SHORT_TEXT",
        value: answerValue,
      })),
      ...retainedAnswers,
    ],
    // Bestaande uploads blijven aan de inzending hangen. Geen uploadtokens
    // meesturen voorkomt dat dezelfde bestanden opnieuw worden aangemaakt.
    uploads: [],
    claimedOptions: claimedOptionCodes(fields, validation.cleaned),
    asDraft: false,
    maxEntries: full.maxEntries,
    allowWaitlist: full.allowWaitlist,
  });

  if (!result.ok) return { status: "rejected", reason: result.code };

  await logFormAudit(prisma, {
    formId: input.formId,
    actorUserId: session.user.id,
    action: existing ? "FORM_ENTRY_EDITED" : "FORM_ENTRY_ADDED_ON_BEHALF",
    entityType: "FormEntry",
    entityId: result.entryId,
    metadata: { email: input.submitterEmail ?? null },
  });

  await logAudit({
    action: existing ? "update" : "create",
    entity: "formEntry",
    entityId: result.entryId,
    target: input.submitterEmail ?? (await formTitle(input.formId)),
    summary: existing
      ? `antwoorden aangepast op ${await formTitle(input.formId)}`
      : `inzending toegevoegd namens iemand op ${await formTitle(input.formId)}`,
  });

  refresh(input.locale, input.formId, existing?.id);
  return { status: "ok", entryId: result.entryId };
}

/**
 * Iemand belt of mailt zijn inschrijving door en een beheerder tikt ze in.
 *
 * Loopt door exact dezelfde validatie en quota-reservatie als een gewone
 * inzending: een tweede weg naar de database die de regels niet kent, is precies
 * hoe zo'n systeem zijn tellingen kwijtraakt. Wat hier wél anders is: het
 * formulier hoeft niet open te staan (een beheerder mag ook nadien nog iemand
 * toevoegen) en er vertrekt geen bevestigingsmail, want de inzender heeft dit
 * niet zelf gedaan.
 */
export async function addEntryOnBehalfAction(rawInput: unknown): Promise<BehalfResult> {
  try {
    const input = behalfSchema.parse(rawInput);
    return await saveManagedEntry(input);
  } catch (error) {
    unstable_rethrow(error);
    console.error("Inzending namens iemand toevoegen mislukt", error);
    throw error;
  }
}

/** Antwoorden van een bestaande inzending aanpassen zonder een mail te sturen. */
export async function editFormEntryAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  let answers: unknown;
  try {
    answers = JSON.parse(value(formData, "answers"));
  } catch {
    return saveError("INVALID_INPUT");
  }

  const parsed = editEntrySchema.safeParse({
    formId: value(formData, "formId"),
    entryId: value(formData, "entryId"),
    locale: value(formData, "locale") || "nl",
    submitterName: value(formData, "submitterName"),
    submitterEmail: value(formData, "submitterEmail"),
    answers,
  });
  if (!parsed.success) return saveError("INVALID_INPUT");

  try {
    const result = await saveManagedEntry(parsed.data);
    if (result.status === "invalid") return saveError("INVALID_ANSWERS");
    if (result.status === "rejected") return saveError(result.reason);
    return saveOk();
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_ERRORS.has(code) || code.startsWith("INVALID_")) return saveError(code);
    console.error("Inzending bewerken mislukt", error);
    throw error;
  }
}

/**
 * Iemand van de wachtlijst een plaats geven.
 *
 * Probeert alsnog de quota te claimen die de inzending nodig heeft. Lukt dat
 * niet, dan blijft ze op de wachtlijst staan in plaats van een plaats te krijgen
 * die er niet is; anders zou de teller er twee tonen waar er één past.
 */
export async function promoteWaitlistedEntryAction(
  _previous: SaveState,
  formData: FormData
): Promise<SaveState> {
  return guard(async () => {
    const locale = localeSchema.parse(value(formData, "locale") || "nl");
    const formId = value(formData, "formId");
    const entryId = value(formData, "entryId");
    const { session, form } = await requireFormCapability(formId, "MANAGE_ENTRIES");

    const entry = await prisma.formEntry.findFirst({
      where: { id: entryId, formId, waitlisted: true },
      include: { answers: { select: { valueOptions: true } } },
    });
    if (!entry) throw new Error("ENTRY_NOT_FOUND");

    const wanted = entry.answers.flatMap((answer) => answer.valueOptions);

    await prisma.$transaction(async (tx) => {
      if (form.maxEntries != null) {
        const taken = await tx.formEntry.count({
          where: { formId, status: "SUBMITTED", isTest: false, waitlisted: false },
        });
        if (taken >= form.maxEntries) throw new Error("STILL_FULL");
      }

      const claimed: string[] = [];
      for (const code of wanted) {
        const options = await tx.formFieldOption.findMany({
          where: { formId, code },
          select: { id: true, quotaLimit: true },
        });
        for (const option of options) {
          if (option.quotaLimit == null) continue;
          const took = await tx.formFieldOption.updateMany({
            where: { id: option.id, quotaUsed: { lt: option.quotaLimit } },
            data: { quotaUsed: { increment: 1 }, version: { increment: 1 } },
          });
          if (took.count === 1) {
            claimed.push(code);
            continue;
          }
          // Halve plaatsen bestaan niet: teruggeven wat we net namen.
          for (const back of claimed) {
            await tx.formFieldOption.updateMany({
              where: { formId, code: back, quotaUsed: { gt: 0 } },
              data: { quotaUsed: { decrement: 1 }, version: { increment: 1 } },
            });
          }
          throw new Error("STILL_FULL");
        }
      }

      await tx.formEntry.update({
        where: { id: entryId },
        data: { waitlisted: false, waitlistedAt: null },
      });
      await logFormAudit(tx, {
        formId,
        actorUserId: session.user.id,
        action: "FORM_ENTRY_PROMOTED",
        entityType: "FormEntry",
        entityId: entryId,
      });
    });

    await logAudit({
      action: "update",
      entity: "formEntry",
      entityId: entryId,
      target: entry.submitterEmail ?? form.titleNl,
      summary: `van de wachtlijst gehaald op ${form.titleNl}`,
    });

    refresh(locale, formId, entryId);
  });
}
