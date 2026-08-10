import "server-only";

import { buildIcs } from "@/lib/calendar/ics";

/**
 * De teksten van de formuliermails. Puur opbouwen, niet versturen: dat doet de
 * outbox, zodat een mislukte verzending opnieuw geprobeerd kan worden.
 */

export type MailLocale = "nl" | "en";

export type AnswerLine = { label: string; value: string };

function baseUrl(): string {
  return (
    process.env.TICKETING_PUBLIC_URL?.trim() ||
    process.env.VTK_MAIN_URL?.trim() ||
    "https://vtk.be"
  ).replace(/\/$/, "");
}

export function formUrl(slug: string, locale: MailLocale): string {
  return `${baseUrl()}${locale === "en" ? "/en" : ""}/formulieren/${slug}`;
}

/**
 * Vervangt de plaatshouders in een zelfgeschreven tekst. Onbekende namen
 * blijven staan zoals ze zijn: stilletjes leegmaken maakt een fout onzichtbaar
 * voor wie het sjabloon schreef.
 */
export function fillPlaceholders(
  template: string,
  values: Readonly<Record<string, string>>
): string {
  return template.replace(/\{\{\s*([a-z0-9_.:-]+)\s*\}\}/gi, (match, key: string) => {
    const value = values[key.toLowerCase()];
    return value === undefined ? match : value;
  });
}

export function answersAsText(lines: readonly AnswerLine[]): string {
  return lines.map((line) => `${line.label}: ${line.value}`).join("\n");
}

export function confirmationMail(input: {
  locale: MailLocale;
  formTitle: string;
  slug: string;
  recipient: string;
  recipientName: string | null;
  subject: string | null;
  body: string | null;
  answers: readonly AnswerLine[];
  includeAnswers: boolean;
  event?: {
    id: string;
    title: string;
    start: Date;
    end: Date;
    location: string | null;
  } | null;
}) {
  const nl = input.locale === "nl";
  const greeting = input.recipientName
    ? nl
      ? `Dag ${input.recipientName},`
      : `Hi ${input.recipientName},`
    : nl
      ? "Dag,"
      : "Hi,";

  const placeholders = {
    naam: input.recipientName ?? "",
    name: input.recipientName ?? "",
    formulier: input.formTitle,
    form: input.formTitle,
  };

  const intro = input.body
    ? fillPlaceholders(input.body, placeholders)
    : nl
      ? `We hebben je inzending voor "${input.formTitle}" goed ontvangen.`
      : `We have received your entry for "${input.formTitle}".`;

  const parts = [greeting, "", intro];
  if (input.includeAnswers && input.answers.length > 0) {
    parts.push(
      "",
      nl ? "Dit vulde je in:" : "This is what you filled in:",
      "",
      answersAsText(input.answers)
    );
  }
  parts.push("", nl ? "Groeten,\nVTK" : "Regards,\nVTK");

  const attachments = input.event
    ? [
        {
          filename: "evenement.ics",
          contentType: "text/calendar; charset=utf-8",
          content: Buffer.from(
            buildIcs({
              name: input.event.title,
              events: [
                {
                  uid: `form-${input.event.id}@vtk.be`,
                  summary: input.event.title,
                  start: input.event.start,
                  end: input.event.end,
                  allDay: false,
                  location: input.event.location,
                  updatedAt: input.event.start,
                },
              ],
            }),
            "utf8"
          ),
        },
      ]
    : undefined;

  return {
    to: input.recipient,
    subject:
      (input.subject ? fillPlaceholders(input.subject, placeholders) : null) ??
      (nl ? `Bevestiging: ${input.formTitle}` : `Confirmation: ${input.formTitle}`),
    text: parts.join("\n"),
    attachments,
  };
}

export function notificationMail(input: {
  formTitle: string;
  slug: string;
  recipients: readonly string[];
  submitterName: string | null;
  submitterEmail: string | null;
  answers: readonly AnswerLine[];
  entryCount: number;
}) {
  const who = input.submitterName || input.submitterEmail || "iemand";
  return {
    to: input.recipients.join(", "),
    subject: `[Formulier] Nieuwe inzending: ${input.formTitle}`,
    text: [
      `${who} vulde "${input.formTitle}" in.`,
      "",
      answersAsText(input.answers),
      "",
      `Alle inzendingen (${input.entryCount}): ${formUrl(input.slug, "nl")}`,
    ].join("\n"),
  };
}

export function digestMail(input: {
  formTitle: string;
  slug: string;
  recipients: readonly string[];
  count: number;
  total: number;
}) {
  return {
    to: input.recipients.join(", "),
    subject: `[Formulier] ${input.count} nieuwe inzending(en): ${input.formTitle}`,
    text: [
      `Er kwamen ${input.count} nieuwe inzendingen binnen voor "${input.formTitle}".`,
      `In totaal staan er nu ${input.total}.`,
      "",
      formUrl(input.slug, "nl"),
    ].join("\n"),
  };
}

export function draftReminderMail(input: {
  locale: MailLocale;
  formTitle: string;
  slug: string;
  recipient: string;
  recipientName: string | null;
  closesAt: Date;
}) {
  const nl = input.locale === "nl";
  const deadline = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-BE", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Brussels",
  }).format(input.closesAt);

  return {
    to: input.recipient,
    subject: nl
      ? `Je inzending voor ${input.formTitle} is nog niet verstuurd`
      : `Your entry for ${input.formTitle} has not been submitted yet`,
    text: [
      input.recipientName ? (nl ? `Dag ${input.recipientName},` : `Hi ${input.recipientName},`) : nl ? "Dag," : "Hi,",
      "",
      nl
        ? `Je begon aan "${input.formTitle}" maar diende nog niet in. Het formulier sluit op ${deadline}.`
        : `You started "${input.formTitle}" but have not submitted yet. The form closes on ${deadline}.`,
      "",
      formUrl(input.slug, input.locale),
      "",
      nl ? "Groeten,\nVTK" : "Regards,\nVTK",
    ].join("\n"),
  };
}
