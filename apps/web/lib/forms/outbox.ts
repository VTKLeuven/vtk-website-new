import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { sendMail, smtpConfigured } from "@vtk/mail";
import {
  confirmationMail,
  digestMail,
  draftReminderMail,
  notificationMail,
  type AnswerLine,
  type MailLocale,
} from "./mail";

/**
 * Duurzame wachtrij voor formuliermail, in het patroon van de ticketoutbox: een
 * unieke `dedupeKey` zodat hetzelfde bericht niet twee keer vertrekt, en
 * herpogingen met oplopend uitstel.
 *
 * Een eigen tabel naast die van ticketing, want die hangt met verplichte
 * verwijzingen aan een ticketevent en een bestelling; die generaliseren zou de
 * hele ticketmodule moeten migreren.
 */

type ClaimedMessage = {
  id: string;
  type: string;
  formId: string | null;
  entryId: string | null;
  recipient: string | null;
  payload: Prisma.JsonValue;
  attempts: number;
};

/** De antwoorden van één inzending als leesbare regels voor in een mail. */
export async function answerLines(
  entryId: string,
  locale: MailLocale
): Promise<AnswerLine[]> {
  const entry = await prisma.formEntry.findUnique({
    where: { id: entryId },
    include: {
      answers: { include: { field: { include: { options: true } } } },
      uploads: true,
    },
  });
  if (!entry) return [];

  const lines: AnswerLine[] = [];
  for (const answer of entry.answers.sort(
    (a, b) => a.field.sortOrder - b.field.sortOrder
  )) {
    const field = answer.field;
    const label = locale === "en" && field.labelEn ? field.labelEn : field.labelNl;
    let value = "";

    if (answer.valueOptions.length > 0) {
      value = answer.valueOptions
        .map((code) => {
          const option = field.options.find((candidate) => candidate.code === code);
          if (!option) return code;
          return locale === "en" && option.labelEn ? option.labelEn : option.labelNl;
        })
        .join(", ");
      if (answer.valueText) value += ` (${answer.valueText})`;
    } else if (answer.valueBool !== null) {
      value = answer.valueBool ? (locale === "en" ? "yes" : "ja") : locale === "en" ? "no" : "nee";
    } else if (answer.valueNumber !== null) {
      value = String(answer.valueNumber);
    } else if (answer.valueDate) {
      value = answer.valueDate.toISOString().slice(0, 10);
    } else {
      value = answer.valueText ?? "";
    }

    if (field.type === "FILE") {
      const files = entry.uploads.filter((upload) => upload.fieldId === field.id);
      value = files.map((file) => file.originalName).join(", ");
    }

    lines.push({ label, value });
  }

  // Uploadvelden zonder antwoordrij komen anders nergens terecht.
  for (const upload of entry.uploads) {
    if (lines.some((line) => line.value.includes(upload.originalName))) continue;
    lines.push({ label: "Bestand", value: upload.originalName });
  }
  return lines;
}

/**
 * Zet de mails klaar die bij één inzending horen. Faalt dit, dan mag de
 * inzending zelf niet sneuvelen: ze is al bewaard en de bezoeker heeft haar
 * verstuurd.
 */
export async function enqueueFormMail(
  form: {
    id: string;
    slug: string;
    titleNl: string;
    titleEn: string | null;
    confirmationEnabled: boolean;
    notifyMode: string;
    notifyEmails: string[];
  },
  entryId: string,
  identity: { name: string | null; email: string | null },
  locale: MailLocale
): Promise<void> {
  try {
    const messages: Prisma.FormOutboxMessageCreateManyInput[] = [];

    if (form.confirmationEnabled && identity.email) {
      messages.push({
        formId: form.id,
        entryId,
        type: "FORM_CONFIRMATION",
        dedupeKey: `confirmation:${entryId}`,
        recipient: identity.email,
        payload: { locale },
      });
    }
    if (form.notifyMode === "EACH" && form.notifyEmails.length > 0) {
      messages.push({
        formId: form.id,
        entryId,
        type: "FORM_NOTIFICATION",
        dedupeKey: `notification:${entryId}`,
        recipient: form.notifyEmails.join(","),
        payload: {},
      });
    }
    if (messages.length > 0) {
      // Een bewerkte inzending stuurt geen tweede bevestiging: de dedupeKey
      // bestaat dan al.
      await prisma.formOutboxMessage.createMany({ data: messages, skipDuplicates: true });
    }
  } catch (error) {
    console.error("[forms] mail klaarzetten mislukt", error);
  }
}

async function claimMessages(workerId: string, limit: number): Promise<ClaimedMessage[]> {
  return prisma.$queryRaw<ClaimedMessage[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "FormOutboxMessage"
      WHERE "status" IN ('PENDING', 'FAILED', 'PROCESSING')
        AND "availableAt" <= NOW()
        AND (
          "status" <> 'PROCESSING'
          OR "lockedAt" IS NULL
          OR "lockedAt" < NOW() - INTERVAL '5 minutes'
        )
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "FormOutboxMessage" AS message
    SET
      "status" = 'PROCESSING'::"FormOutboxStatus",
      "lockedAt" = NOW(),
      "lockedBy" = ${workerId},
      "attempts" = message."attempts" + 1,
      "updatedAt" = NOW()
    FROM candidates
    WHERE message."id" = candidates."id"
    RETURNING message."id", message."type", message."formId", message."entryId",
              message."recipient", message."payload", message."attempts"
  `;
}

async function deliver(message: ClaimedMessage): Promise<void> {
  const payload = (message.payload ?? {}) as { locale?: MailLocale; count?: number };
  const locale: MailLocale = payload.locale === "en" ? "en" : "nl";

  const form = message.formId
    ? await prisma.form.findUnique({
        where: { id: message.formId },
        include: { calendarEvent: true },
      })
    : null;
  if (!form) throw new Error("Formulier bestaat niet meer");
  const title = locale === "en" && form.titleEn ? form.titleEn : form.titleNl;

  if (message.type === "FORM_CONFIRMATION") {
    if (!message.entryId || !message.recipient) throw new Error("Bevestiging zonder ontvanger");
    const entry = await prisma.formEntry.findUnique({
      where: { id: message.entryId },
      select: { submitterName: true, status: true },
    });
    if (!entry || entry.status !== "SUBMITTED") throw new Error("Inzending is niet ingediend");

    const mail = confirmationMail({
      locale,
      formTitle: title,
      slug: form.slug,
      recipient: message.recipient,
      recipientName: entry.submitterName,
      subject: locale === "en" ? form.confirmationSubjectEn : form.confirmationSubjectNl,
      body: locale === "en" ? form.confirmationBodyEn : form.confirmationBodyNl,
      answers: form.confirmationIncludeAnswers
        ? await answerLines(message.entryId, locale)
        : [],
      includeAnswers: form.confirmationIncludeAnswers,
      event:
        form.confirmationIncludeIcs && form.calendarEvent
          ? {
              id: form.calendarEvent.id,
              title:
                locale === "en" && form.calendarEvent.titleEn
                  ? form.calendarEvent.titleEn
                  : form.calendarEvent.titleNl,
              start: form.calendarEvent.start,
              end: form.calendarEvent.end,
              location: form.calendarEvent.location,
            }
          : null,
    });
    const sent = await sendMail(mail, { throwOnError: true });
    if (!sent) throw new Error("Versturen mislukt");
    return;
  }

  if (message.type === "FORM_NOTIFICATION") {
    if (!message.entryId || !message.recipient) throw new Error("Melding zonder ontvanger");
    const [entry, entryCount] = await Promise.all([
      prisma.formEntry.findUnique({
        where: { id: message.entryId },
        select: { submitterName: true, submitterEmail: true },
      }),
      prisma.formEntry.count({
        where: { formId: form.id, status: "SUBMITTED", isTest: false },
      }),
    ]);
    const mail = notificationMail({
      formTitle: form.titleNl,
      slug: form.slug,
      recipients: message.recipient.split(","),
      submitterName: entry?.submitterName ?? null,
      submitterEmail: entry?.submitterEmail ?? null,
      answers: await answerLines(message.entryId, "nl"),
      entryCount,
    });
    const sent = await sendMail(mail, { throwOnError: true });
    if (!sent) throw new Error("Versturen mislukt");
    return;
  }

  if (message.type === "FORM_DIGEST") {
    if (!message.recipient) throw new Error("Samenvatting zonder ontvanger");
    const total = await prisma.formEntry.count({
      where: { formId: form.id, status: "SUBMITTED", isTest: false },
    });
    const sent = await sendMail(
      digestMail({
        formTitle: form.titleNl,
        slug: form.slug,
        recipients: message.recipient.split(","),
        count: payload.count ?? 0,
        total,
      }),
      { throwOnError: true }
    );
    if (!sent) throw new Error("Versturen mislukt");
    return;
  }

  if (message.type === "FORM_DRAFT_REMINDER") {
    if (!message.recipient || !form.closesAt) throw new Error("Herinnering zonder deadline");
    const entry = message.entryId
      ? await prisma.formEntry.findUnique({
          where: { id: message.entryId },
          select: { submitterName: true, status: true },
        })
      : null;
    // Wie intussen indiende, krijgt geen herinnering meer.
    if (!entry || entry.status !== "DRAFT") return;
    const sent = await sendMail(
      draftReminderMail({
        locale,
        formTitle: title,
        slug: form.slug,
        recipient: message.recipient,
        recipientName: entry.submitterName,
        closesAt: form.closesAt,
      }),
      { throwOnError: true }
    );
    if (!sent) throw new Error("Versturen mislukt");
    return;
  }

  throw new Error(`Onbekend berichttype: ${message.type}`);
}

export async function processFormOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  // Zonder mailserver niets uit de wachtrij halen: anders staat alles op SENT
  // terwijl er nooit iets vertrok.
  if (!smtpConfigured()) return { sent: 0, failed: 0 };

  const workerId = `web-${process.pid}-${randomUUID()}`;
  const messages = await claimMessages(workerId, Math.min(Math.max(limit, 1), 50));
  let sent = 0;
  let failed = 0;

  for (const message of messages) {
    try {
      await deliver(message);
      const finalized = await prisma.formOutboxMessage.updateMany({
        where: { id: message.id, status: "PROCESSING", lockedBy: workerId },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      if (finalized.count === 1) sent += 1;
    } catch (error) {
      const dead = message.attempts >= 8;
      const delayMinutes = Math.min(360, 2 ** Math.min(message.attempts, 8));
      const finalized = await prisma.formOutboxMessage.updateMany({
        where: { id: message.id, status: "PROCESSING", lockedBy: workerId },
        data: {
          status: dead ? "DEAD" : "FAILED",
          availableAt: new Date(Date.now() + delayMinutes * 60_000),
          lockedAt: null,
          lockedBy: null,
          lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Onbekende fout",
        },
      });
      if (finalized.count === 1) failed += 1;
    }
  }
  return { sent, failed };
}

/**
 * Eén samenvatting per dag per formulier, in plaats van een mail per inzending.
 * De dedupeKey bevat de dag, dus twee keer draaien levert één mail op.
 */
export async function enqueueDailyDigests(now = new Date()): Promise<number> {
  const day = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const forms = await prisma.form.findMany({
    where: { notifyMode: "DAILY", status: { in: ["PUBLISHED", "CLOSED"] } },
    select: { id: true, notifyEmails: true },
  });

  let queued = 0;
  for (const form of forms) {
    if (form.notifyEmails.length === 0) continue;
    const count = await prisma.formEntry.count({
      where: {
        formId: form.id,
        status: "SUBMITTED",
        isTest: false,
        submittedAt: { gte: since },
      },
    });
    if (count === 0) continue;

    const created = await prisma.formOutboxMessage.createMany({
      data: [
        {
          formId: form.id,
          type: "FORM_DIGEST",
          dedupeKey: `digest:${form.id}:${day}`,
          recipient: form.notifyEmails.join(","),
          payload: { count },
        },
      ],
      skipDuplicates: true,
    });
    queued += created.count;
  }
  return queued;
}

/**
 * Herinnering aan wie een concept liet staan, één keer, ergens in de laatste
 * twee dagen voor het formulier sluit.
 */
export async function enqueueDraftReminders(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const drafts = await prisma.formEntry.findMany({
    where: {
      status: "DRAFT",
      submitterEmail: { not: null },
      form: {
        status: "PUBLISHED",
        allowDrafts: true,
        closesAt: { gt: now, lte: horizon },
      },
    },
    select: {
      id: true,
      formId: true,
      submitterEmail: true,
      locale: true,
    },
    take: 500,
  });

  if (drafts.length === 0) return 0;
  const created = await prisma.formOutboxMessage.createMany({
    data: drafts.map((draft) => ({
      formId: draft.formId,
      entryId: draft.id,
      type: "FORM_DRAFT_REMINDER",
      dedupeKey: `reminder:${draft.id}`,
      recipient: draft.submitterEmail,
      payload: { locale: draft.locale === "EN" ? "en" : "nl" },
    })),
    skipDuplicates: true,
  });
  return created.count;
}
