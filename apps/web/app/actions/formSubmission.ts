"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { createRequestFingerprint } from "@/lib/ticketing/crypto";
import {
  filledTooFast,
  rateLimitKey,
  trippedHoneypot,
  withinRateLimit,
} from "@/lib/forms/antiSpam";
import { formAvailability, loadPublicForm } from "@/lib/forms/publicForm";
import { claimedOptionCodes, validateSubmission } from "@/lib/forms/validation";
import { findDuplicateEntry, saveFormEntry, type PendingUpload } from "@/lib/forms/submit";
import { verifyUploadToken, extensionOf } from "@/lib/forms/uploadToken";
import { enqueueFormMail } from "@/lib/forms/outbox";
import type { AnswerValue } from "@/lib/forms/visibility";

const answerSchema = z.object({
  text: z.string().max(20_000).nullish(),
  number: z.number().nullish(),
  checked: z.boolean().nullish(),
  options: z.array(z.string().max(60)).max(200).nullish(),
});

const payloadSchema = z.object({
  formId: z.string().min(1),
  entryId: z.string().nullish(),
  locale: z.enum(["nl", "en"]),
  answers: z.record(z.string(), answerSchema),
  uploads: z.record(z.string(), z.array(z.string().max(4_000)).max(10)).default({}),
  /** Het verborgen veld; ingevuld betekent bot. */
  honeypot: z.string().max(200).nullish(),
  /** Wanneer het formulier op het scherm kwam, om te snel invullen te herkennen. */
  startedAt: z.number().nullish(),
  asDraft: z.boolean().default(false),
  /** Een beheerder kan zijn eigen formulier uitproberen zonder mee te tellen. */
  isTest: z.boolean().default(false),
  consent: z.boolean().default(false),
});

export type FormSubmitPayload = z.input<typeof payloadSchema>;

export type FormSubmitResult =
  | { status: "ok"; entryId: string; duplicate: boolean }
  | { status: "draft"; entryId: string }
  | { status: "invalid"; errors: Record<string, string>; formError?: string }
  | { status: "rejected"; reason: string };

/**
 * Indienen (of als concept bewaren).
 *
 * Alles wat de client meestuurt is een voorstel: de zichtbaarheid, de
 * verplichte velden, de quota en het doelpubliek worden hier opnieuw bepaald.
 */
export async function submitFormAction(rawPayload: unknown): Promise<FormSubmitResult> {
  try {
    const payload = payloadSchema.parse(rawPayload);
    const session = await getCurrentSession();

    const form = await prisma.form.findUnique({
      where: { id: payload.formId },
      select: { slug: true },
    });
    if (!form) return { status: "rejected", reason: "NOT_FOUND" };

    const full = await loadPublicForm(form.slug);
    if (!full) return { status: "rejected", reason: "NOT_FOUND" };

    // Een bot die een foutmelding krijgt, past zijn volgende poging aan. Dus:
    // dezelfde uitkomst als een geslaagde inzending, maar er wordt niets
    // bewaard.
    if (trippedHoneypot(payload.honeypot) || filledTooFast(payload.startedAt)) {
      return { status: "ok", entryId: "", duplicate: false };
    }

    const requestHeaders = await headers();
    const ipAddress =
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip") ||
      null;
    if (!payload.asDraft && !withinRateLimit(rateLimitKey(payload.formId, ipAddress))) {
      return { status: "rejected", reason: "RATE_LIMITED" };
    }

    const ownEntries = session
      ? await prisma.formEntry.count({
          where: {
            formId: full.id,
            submittedById: session.user.id,
            status: "SUBMITTED",
            ...(payload.entryId ? { id: { not: payload.entryId } } : {}),
          },
        })
      : 0;

    const availability = formAvailability(full, {
      loggedIn: Boolean(session),
      ownEntries,
      locale: payload.locale,
    });
    // Bewerken van een bestaande inzending mag ook nadat het formulier sloot
    // voor nieuwe inzendingen; daarover beslist `allowEditAfterSubmit`.
    const editingOwnEntry = Boolean(payload.entryId);
    if (availability !== "OPEN" && !(editingOwnEntry && availability === "ALREADY_SUBMITTED")) {
      return { status: "rejected", reason: availability };
    }
    if (payload.asDraft && (!session || !full.allowDrafts)) {
      return { status: "rejected", reason: "DRAFTS_NOT_ALLOWED" };
    }
    if (full.requireConsent && !payload.asDraft && !payload.consent) {
      return { status: "invalid", errors: {}, formError: "CONSENT_REQUIRED" };
    }

    // Bestanden: enkel wat wij zelf ondertekend hebben telt, en enkel voor het
    // veld waarvoor het geüpload werd.
    const uploads: PendingUpload[] = [];
    const fileCounts: Record<string, { count: number; extensions: string[] }> = {};
    for (const [fieldId, tokens] of Object.entries(payload.uploads ?? {})) {
      for (const token of tokens) {
        const descriptor = verifyUploadToken(token, { formId: full.id, fieldId });
        if (!descriptor) return { status: "rejected", reason: "INVALID_UPLOAD" };
        uploads.push({
          fieldId,
          storageKey: descriptor.storageKey,
          originalName: descriptor.originalName,
          contentType: descriptor.contentType,
          sizeBytes: descriptor.sizeBytes,
        });
        const info = (fileCounts[fieldId] ??= { count: 0, extensions: [] });
        info.count += 1;
        info.extensions.push(extensionOf(descriptor.originalName));
      }
    }

    const answers = payload.answers as Record<string, AnswerValue>;
    const validation = validateSubmission({
      fields: full.fields.map((field) => ({
        id: field.id,
        code: field.code,
        type: field.type,
        required: field.required,
        config: field.config,
        options: field.options.map((option) => ({
          code: option.code,
          archivedAt: option.archivedAt,
        })),
      })),
      conditions: full.fields.flatMap((field) =>
        field.conditions.map((condition) => ({
          fieldId: field.id,
          sourceFieldId: condition.sourceFieldId,
          operator: condition.operator,
          value: condition.value,
        }))
      ),
      answers,
      fileCounts,
    });

    // Een concept mag half ingevuld zijn; dat is net het punt ervan.
    if (!payload.asDraft && Object.keys(validation.errors).length > 0) {
      return { status: "invalid", errors: validation.errors };
    }

    const fieldById = new Map(full.fields.map((field) => [field.id, field]));
    const identity = identityFrom(full.fields, validation.cleaned, session);

    const result = await saveFormEntry({
      formId: full.id,
      entryId: payload.entryId ?? null,
      submittedById: session?.user.id ?? null,
      submitterName: identity.name,
      submitterEmail: identity.email,
      locale: payload.locale === "en" ? "EN" : "NL",
      isTest: payload.isTest && Boolean(session),
      requestFingerprint: ipAddress ? createRequestFingerprint(ipAddress) : null,
      answers: Object.entries(validation.cleaned).map(([fieldId, value]) => ({
        fieldId,
        fieldCode: fieldById.get(fieldId)?.code ?? fieldId,
        type: fieldById.get(fieldId)?.type ?? "SHORT_TEXT",
        value,
      })),
      uploads: uploads.filter((upload) => validation.visible.has(upload.fieldId)),
      claimedOptions: claimedOptionCodes(
        full.fields.map((field) => ({
          id: field.id,
          code: field.code,
          type: field.type,
          required: field.required,
          config: field.config,
          options: field.options,
        })),
        validation.cleaned
      ),
      asDraft: payload.asDraft,
      maxEntries: full.maxEntries,
    });

    if (!result.ok) {
      return {
        status: "rejected",
        reason: result.code === "FULL" ? "FULL" : "OPTION_FULL",
      };
    }

    for (const path of [`/formulieren/${full.slug}`, `/en/formulieren/${full.slug}`]) {
      revalidatePath(path);
    }

    if (payload.asDraft) return { status: "draft", entryId: result.entryId };

    const duplicate = await findDuplicateEntry(full.id, identity.email, result.entryId);
    await enqueueFormMail(full, result.entryId, identity, payload.locale);

    return { status: "ok", entryId: result.entryId, duplicate: Boolean(duplicate) };
  } catch (error) {
    unstable_rethrow(error);
    console.error("Formulier indienen mislukt", error);
    throw error;
  }
}

/**
 * Naam en e-mail van de inzender: uit het profiel wanneer die ingelogd is, en
 * anders uit het eerste e-mail- of naamveld van het formulier zelf. Zonder dit
 * kan een bevestigingsmail nergens naartoe.
 */
function identityFrom(
  fields: ReadonlyArray<{ id: string; type: string; code: string }>,
  cleaned: Readonly<Record<string, AnswerValue>>,
  session: Awaited<ReturnType<typeof getCurrentSession>>
): { name: string | null; email: string | null } {
  if (session) {
    return { name: session.user.name, email: session.user.email.toLowerCase() };
  }
  // Bij een anonieme inzending: het eerste e-mailveld, en enkel een veld dat
  // letterlijk "naam" heet. Ruimer raden zette ooit de naam van een partner in
  // de aanhef van de bevestigingsmail.
  const emailField = fields.find((field) => field.type === "EMAIL");
  const nameField = fields.find((field) => ["naam", "name"].includes(field.code));
  return {
    name: nameField ? cleaned[nameField.id]?.text?.trim() || null : null,
    email: emailField ? cleaned[emailField.id]?.text?.trim().toLowerCase() || null : null,
  };
}
