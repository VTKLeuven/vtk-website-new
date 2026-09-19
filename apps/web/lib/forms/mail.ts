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

import {
  MAIL_COLOR,
  MAIL_FONT,
  escapeHtml,
  mailButton,
  mailContentRow,
  mailDateStub,
  mailDocument,
  mailFooterRow,
  mailHeaderRow,
  mailHeading,
  mailInfoTable,
  mailNoticeBox,
  mailParagraph,
  mailPill,
} from "@/lib/mailDesign";

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

  const subject =
    (input.subject ? fillPlaceholders(input.subject, placeholders) : null) ??
    (nl ? `Bevestiging: ${input.formTitle}` : `Confirmation: ${input.formTitle}`);

  const eventCard = input.event
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid ${
        MAIL_COLOR.line
      };border-radius:18px;overflow:hidden;margin:18px 0"><tr>${mailDateStub({
        date: input.event.start,
        locale: nl ? "nl" : "en",
      })}<td valign="middle" style="padding:18px 20px;font-family:${MAIL_FONT}"><div style="font-size:12px;font-weight:600;color:${
        MAIL_COLOR.muted
      }">${nl ? "Gekoppeld evenement" : "Linked event"}</div><div style="margin:4px 0 6px;font-size:18px;font-weight:650;letter-spacing:-.02em;color:${
        MAIL_COLOR.ink
      }">${escapeHtml(input.event.title)}</div><div style="font-size:13px;line-height:1.5;color:${
        MAIL_COLOR.body
      }">${
        input.event.location
          ? `${nl ? "Locatie:" : "Location:"} <strong>${escapeHtml(input.event.location)}</strong><br>`
          : ""
      }${nl ? "Het agenda-bestand (.ics) is als bijlage toegevoegd." : "The calendar invite (.ics) has been attached."}</div></td></tr></table>`
    : "";

  const answersHtml =
    input.includeAnswers && input.answers.length > 0
      ? `<div style="margin-top:20px"><div style="font-family:${MAIL_FONT};font-size:14px;font-weight:600;color:${
          MAIL_COLOR.ink
        };margin-bottom:8px">${
          nl ? "Dit vulde je in:" : "This is what you filled in:"
        }</div>${mailInfoTable([...input.answers])}</div>`
      : "";

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Formulieren" })}${mailContentRow(
      `${mailHeading(input.formTitle)}${mailParagraph(greeting)}${mailParagraph(
        intro,
      )}${answersHtml}${eventCard}`,
    )}${mailFooterRow(nl ? "VTK Formulieren · vtk.be" : "VTK Forms · vtk.be")}`,
  });

  return {
    to: input.recipient,
    subject,
    text: parts.join("\n"),
    html,
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
  const subject = `[Formulier] Nieuwe inzending: ${input.formTitle}`;

  const html = mailDocument({
    lang: "nl",
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Formulieren" })}${mailContentRow(
      `${mailHeading("Nieuwe inzending")}${mailParagraph(
        `<strong>${escapeHtml(who)}</strong> vulde "${escapeHtml(input.formTitle)}" in:`,
      )}${mailInfoTable([...input.answers])}<div style="margin:22px 0 10px">${mailButton(
        formUrl(input.slug, "nl"),
        "Bekijk alle inzendingen",
      )}</div>`,
    )}${mailFooterRow(`In totaal ${input.entryCount} inzending(en) voor dit formulier.`)}`,
  });

  return {
    to: input.recipients.join(", "),
    subject,
    text: [
      `${who} vulde "${input.formTitle}" in.`,
      "",
      answersAsText(input.answers),
      "",
      `Alle inzendingen (${input.entryCount}): ${formUrl(input.slug, "nl")}`,
    ].join("\n"),
    html,
  };
}

export function digestMail(input: {
  formTitle: string;
  slug: string;
  recipients: readonly string[];
  count: number;
  total: number;
}) {
  const subject = `[Formulier] ${input.count} nieuwe inzending(en): ${input.formTitle}`;

  const html = mailDocument({
    lang: "nl",
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Formulieren" })}${mailContentRow(
      `${mailHeading("Overzicht inzendingen")}${mailParagraph(
        `Er kwamen <strong>${input.count}</strong> nieuwe inzending(en) binnen voor "${escapeHtml(
          input.formTitle,
        )}".`,
      )}${mailNoticeBox(
        `In totaal staan er nu ${input.total} geregistreerde inzendingen in het beheer.`,
        "Totaal aantal inzendingen",
      )}<div style="margin:22px 0 10px">${mailButton(
        formUrl(input.slug, "nl"),
        "Bekijk alle inzendingen",
      )}</div>`,
    )}${mailFooterRow("VTK Formulieren · Dagelijkse samenvatting")}`,
  });

  return {
    to: input.recipients.join(", "),
    subject,
    text: [
      `Er kwamen ${input.count} nieuwe inzendingen binnen voor "${input.formTitle}".`,
      `In totaal staan er nu ${input.total}.`,
      "",
      formUrl(input.slug, "nl"),
    ].join("\n"),
    html,
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

  const subject = nl
    ? `Je inzending voor ${input.formTitle} is nog niet verstuurd`
    : `Your entry for ${input.formTitle} has not been submitted yet`;

  const greeting = input.recipientName
    ? nl
      ? `Dag ${input.recipientName},`
      : `Hi ${input.recipientName},`
    : nl
      ? "Dag,"
      : "Hi,";

  const html = mailDocument({
    lang: input.locale,
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Formulieren" })}${mailContentRow(
      `${mailHeading(
        nl ? "Inzending nog niet verstuurd" : "Entry not yet submitted",
      )}${mailParagraph(greeting)}${mailParagraph(
        nl
          ? `Je begon aan "<strong>${escapeHtml(
              input.formTitle,
            )}</strong>", maar je inzending werd nog niet voltooid.`
          : `You started "<strong>${escapeHtml(
              input.formTitle,
            )}</strong>", but your submission was not finalized.`,
      )}${mailNoticeBox(
        nl ? `Het formulier sluit op ${deadline}.` : `The form closes on ${deadline}.`,
        nl ? "Sluitingsmoment" : "Deadline",
      )}<div style="margin:22px 0 10px">${mailButton(
        formUrl(input.slug, input.locale),
        nl ? "Maak je inzending af" : "Complete your submission",
      )}</div>`,
    )}${mailFooterRow(nl ? "VTK Formulieren · vtk.be" : "VTK Forms · vtk.be")}`,
  });

  return {
    to: input.recipient,
    subject,
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
    html,
  };
}
