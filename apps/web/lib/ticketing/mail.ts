import "server-only";

import { deliverWebsiteMail } from "@/lib/email";
import {
  MAIL_COLOR as COLOR,
  MAIL_FONT as FONT,
  escapeHtml,
  mailButton,
  mailDocument,
  mailMessageBox,
} from "@/lib/mailDesign";
import { formatMoney } from "./money";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
  attachments?: MailAttachment[];
};

export async function sendMail(message: MailMessage): Promise<string> {
  const sender = process.env.MAIL_FROM?.trim();
  const result = await deliverWebsiteMail(
    {
      from: sender,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo || process.env.MAIL_REPLY_TO || undefined,
      attachments: message.attachments,
    },
    { source: "ticketing", requireProductionConfig: true },
  );

  if (result.status === "failed") throw result.error;
  if (result.status === "simulated") return result.messageId ?? `dev-${Date.now()}`;
  return result.messageId ?? `smtp-${Date.now()}`;
}

/**
 * Wat er bij de mail zit. De tekst wordt hierop gebouwd in plaats van vast
 * ingetypt: een mail die "in bijlage" zegt terwijl de wallet-provider net
 * onbereikbaar was, stuurt de koper naar een bijlage die er niet is.
 */
export type OrderMailContents = {
  /** De pdf met alle geldige tickets van de bestelling. */
  pdf: boolean;
  /** Aantal `.pkpass`-bijlagen (Apple Wallet), één per ticket. */
  applePasses: number;
  /** Google Wallet kan enkel een link zijn, geen bestand. */
  googleLinks: Array<{ label: string; url: string }>;
};

const NO_CONTENTS: OrderMailContents = { pdf: false, applePasses: 0, googleLinks: [] };

/**
 * Het event zoals de mail het toont: de poster bovenaan, de datumpin erop, en
 * de praktische regels eronder. Alles is optioneel en valt afzonderlijk weg:
 * een ticketevent zonder gekoppeld kalender-event heeft geen poster, en een
 * event zonder locatie hoort geen lege regel te krijgen.
 */
export type OrderMailEvent = {
  startsAt: Date;
  timeZone?: string;
  location?: string | null;
  /** Volledige URL naar de poster; een pad werkt niet in een mailbox. */
  posterUrl?: string | null;
  /** De post die het event organiseert, boven de titel. */
  ownerName?: string | null;
};

export type OrderMailLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

/** De bestelling zelf: wat er gekocht is en wat er betaald is. */
export type OrderMailSummary = {
  lines: OrderMailLine[];
  totalCents: number;
  refundedCents?: number;
  currency?: string;
  paidAt?: Date | null;
};

/** Eén regel over de bijlagen, of niets wanneer er geen zijn. */
export function attachmentLine(contents: OrderMailContents, nl: boolean): string {
  const apple = contents.applePasses > 0;
  if (!contents.pdf && !apple) return "";
  if (nl) {
    if (contents.pdf && apple) {
      return contents.applePasses === 1
        ? "Je ticket zit in bijlage: als pdf om te tonen of af te drukken, en als pas voor je Apple Wallet."
        : "Je tickets zitten in bijlage: als pdf om te tonen of af te drukken, en als pas per ticket voor je Apple Wallet.";
    }
    if (contents.pdf) return "Je tickets zitten als pdf in bijlage, om te tonen of af te drukken.";
    return "Je tickets zitten in bijlage als pas voor je Apple Wallet.";
  }
  if (contents.pdf && apple) {
    return contents.applePasses === 1
      ? "Your ticket is attached: as a PDF to show or print, and as a pass for Apple Wallet."
      : "Your tickets are attached: as a PDF to show or print, and as one pass per ticket for Apple Wallet.";
  }
  if (contents.pdf) return "Your tickets are attached as a PDF, to show or print.";
  return "Your tickets are attached as passes for Apple Wallet.";
}

/* -------------------------------------------------------------------------
   Het uitzicht van de mail

   Dezelfde taal als de ticketkaart op /tickets: de poster van het event, de
   titel met de gele streep eronder en de gele datumpin ernaast, en daaronder de
   praktische regels en de bestellijnen.

   De kaart, de kleuren, de knop en de kop met de gele streep komen uit
   `lib/mailDesign.ts`; hier staat enkel wat deze mail eigen is. Verder rekent
   niets hier op meer dan tabellen en inline stijlen.
   ------------------------------------------------------------------------- */

function dateLocale(nl: boolean): string {
  return nl ? "nl-BE" : "en-GB";
}

function moneyLocale(nl: boolean): string {
  return nl ? "nl-BE" : "en-GB";
}

function zoned(
  date: Date,
  timeZone: string,
  nl: boolean,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(dateLocale(nl), { timeZone, ...options }).format(date);
}

/** "vrijdag 2 oktober 2026, 20:00" */
function eventMoment(event: OrderMailEvent, nl: boolean): string {
  const timeZone = event.timeZone || "Europe/Brussels";
  const day = zoned(event.startsAt, timeZone, nl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = zoned(event.startsAt, timeZone, nl, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  // en-GB zet zelf al een komma na de weekdag ("Friday, 2 October 2026"); daar
  // nog een komma achter plakken leest als een opsomming.
  return nl ? `${day}, ${time}` : `${day} at ${time}`;
}

/** De drie regels van de gele datumpin, zoals op de ticketkaart. */
function pinParts(event: OrderMailEvent, nl: boolean): { weekday: string; day: string; month: string } {
  const timeZone = event.timeZone || "Europe/Brussels";
  return {
    weekday: zoned(event.startsAt, timeZone, nl, { weekday: "short" }),
    // Het dagnummer altijd in en-GB: nl-BE schrijft "2." met een punt erachter.
    day: new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric" }).format(event.startsAt),
    month: zoned(event.startsAt, timeZone, nl, { month: "short" }),
  };
}

/**
 * De poster bovenaan. De datumpin hangt hier niet over: in een mailbox is er
 * geen `position`, en een niet-gepositioneerde pin die met een negatieve marge
 * over de foto geschoven wordt, verdwijnt er gewoon achter (een afbeelding
 * tekent over de achtergrond van elk blok eronder). De pin staat daarom naast
 * de titel, in het witte blok.
 */
function posterHtml(event: OrderMailEvent | undefined): string {
  if (!event?.posterUrl) return "";
  // `font-size:0;line-height:0` haalt de witte strook weg die sommige clients
  // onder een afbeelding in een tabelcel zetten.
  return `<tr><td style="padding:0;font-size:0;line-height:0"><img src="${escapeHtml(event.posterUrl)}" width="600" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;background:${COLOR.navy}"></td></tr>`;
}

/** De gele datumpin van de ticketkaart, naast de titel. */
function pinHtml(event: OrderMailEvent, nl: boolean): string {
  const { weekday, day, month } = pinParts(event, nl);
  const small = `font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="64" style="width:64px"><tr><td align="center" valign="middle" style="width:64px;height:64px;border-radius:14px;background:${COLOR.yellow};color:${COLOR.ink};font-family:${FONT};line-height:1;padding:8px 0"><div style="${small}">${escapeHtml(weekday)}</div><div style="font-size:24px;font-weight:800;padding:3px 0 2px">${escapeHtml(day)}</div><div style="${small}">${escapeHtml(month)}</div></td></tr></table>`;
}

/**
 * De titel met de gele streep eronder, even breed als de titel zelf. De tabel
 * eromheen krimpt naar de inhoud; dat is wat `width: fit-content` op het web
 * doet. Loopt de titel over twee regels, dan is de streep zo breed als de
 * langste regel, en dat is precies de bedoeling.
 */
function titleHtml(title: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr><td style="padding:0"><h1 style="margin:0;font-family:${FONT};font-size:25px;font-weight:700;line-height:1.2;letter-spacing:-.01em;color:${COLOR.ink}">${escapeHtml(title)}</h1><div style="height:4px;margin-top:8px;border-radius:2px;background:${COLOR.yellow};font-size:0;line-height:0">&nbsp;</div></td></tr></table>`;
}

function factsHtml(event: OrderMailEvent | undefined, nl: boolean): string {
  if (!event) return "";
  const rows = [eventMoment(event, nl), event.location?.trim()].filter(Boolean) as string[];
  if (rows.length === 0) return "";
  return `<div style="padding-top:12px;font-size:13.5px;line-height:1.5;color:${COLOR.muted}">${rows
    .map((row) => escapeHtml(row))
    .join("<br>")}</div>`;
}

function summaryHtml(summary: OrderMailSummary | undefined, nl: boolean): string {
  if (!summary || summary.lines.length === 0) return "";
  const currency = summary.currency ?? "EUR";
  const money = (cents: number) => formatMoney(cents, currency, moneyLocale(nl));
  const cell = `padding:11px 0;border-bottom:1px solid ${COLOR.line};font-size:14px;line-height:1.35`;

  const lines = summary.lines
    .map((line) => {
      // De stukprijs enkel bij meer dan één: bij één ticket herhaalt ze het
      // bedrag dat er rechts al staat.
      const unit =
        line.quantity > 1
          ? `<br><span style="font-size:12.5px;font-weight:400;color:${COLOR.muted}">${escapeHtml(
              nl ? `${money(line.unitPriceCents)} per stuk` : `${money(line.unitPriceCents)} each`
            )}</span>`
          : "";
      return `<tr><td valign="top" width="30" style="${cell};padding-right:10px;color:${COLOR.muted}">${line.quantity}x</td><td valign="top" style="${cell};color:${COLOR.ink};font-weight:600">${escapeHtml(line.name)}${unit}</td><td valign="top" align="right" style="${cell};padding-left:10px;color:${COLOR.ink};font-weight:600;white-space:nowrap">${escapeHtml(money(line.totalCents))}</td></tr>`;
    })
    .join("");

  const paid = summary.paidAt
    ? nl
      ? `Betaald op ${zoned(summary.paidAt, "Europe/Brussels", nl, { day: "numeric", month: "long" })}`
      : `Paid on ${zoned(summary.paidAt, "Europe/Brussels", nl, { day: "numeric", month: "long" })}`
    : nl
      ? "Totaal betaald"
      : "Total paid";
  const total = `<tr><td colspan="2" style="padding:13px 0 0;font-size:14px;color:${COLOR.muted}">${escapeHtml(paid)}</td><td align="right" style="padding:13px 0 0;font-size:16px;font-weight:700;color:${COLOR.ink};white-space:nowrap">${escapeHtml(money(summary.totalCents))}</td></tr>`;

  // Een bestelling kan al (deels) terugbetaald zijn wanneer deze mail vertrekt;
  // dan klopt "betaald" alleen nog met die regel erbij.
  const refunded =
    summary.refundedCents && summary.refundedCents > 0
      ? `<tr><td colspan="2" style="padding:6px 0 0;font-size:13.5px;color:${COLOR.muted}">${escapeHtml(nl ? "Terugbetaald" : "Refunded")}</td><td align="right" style="padding:6px 0 0;font-size:13.5px;font-weight:600;color:${COLOR.muted};white-space:nowrap">-&nbsp;${escapeHtml(money(summary.refundedCents))}</td></tr>`
      : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin-top:22px;font-family:${FONT}"><tr><td colspan="3" style="border-top:1px solid ${COLOR.line};font-size:0;line-height:0">&nbsp;</td></tr>${lines}${total}${refunded}</table>`;
}

export function orderConfirmationMail(input: {
  locale: "nl" | "en";
  buyerName: string;
  buyerEmail: string;
  eventName: string;
  orderNumber: string;
  ticketCount: number;
  orderUrl: string;
  replyTo?: string | null;
  contents?: OrderMailContents;
  attachments?: MailAttachment[];
  event?: OrderMailEvent;
  summary?: OrderMailSummary;
}): MailMessage {
  const nl = input.locale === "nl";
  const contents = input.contents ?? NO_CONTENTS;
  const subject = nl
    ? `${input.ticketCount === 1 ? "Je ticket" : "Je tickets"} voor ${input.eventName}`
    : `${input.ticketCount === 1 ? "Your ticket" : "Your tickets"} for ${input.eventName}`;
  const intro = nl
    ? `Dag ${input.buyerName}, je betaling is ontvangen. Je vindt ${input.ticketCount === 1 ? "je ticket" : `je ${input.ticketCount} tickets`} via onderstaande link.`
    : `Hi ${input.buyerName}, your payment was received. Open ${input.ticketCount === 1 ? "your ticket" : `your ${input.ticketCount} tickets`} using the link below.`;
  const button = nl ? "Bekijk je tickets" : "View your tickets";
  const warning = nl
    ? "Deel deze link niet: ze geeft toegang tot je tickets."
    : "Do not share this link: it grants access to your tickets.";
  const attached = attachmentLine(contents, nl);
  const googleTitle = nl ? "Bewaren in Google Wallet" : "Save to Google Wallet";
  // Een save-link van Google is een jwt van een paar kilobyte. In de
  // tekstversie is dat per ticket een blok onleesbare tekens dat menig
  // mailclient bovendien afkapt, en dan werkt de link niet meer. In html wordt
  // het een knop; wie enkel tekst leest, gaat via de ticketpagina, waar
  // dezelfde knop staat.
  const googleText = nl
    ? "Toevoegen aan Google Wallet kan op je ticketpagina hierboven."
    : "You can add your tickets to Google Wallet from your ticket page above.";

  const moment = input.event ? eventMoment(input.event, nl) : "";
  const place = input.event?.location?.trim() ?? "";
  const summaryText = (input.summary?.lines ?? []).map((line) => {
    const money = formatMoney(line.totalCents, input.summary?.currency ?? "EUR", moneyLocale(nl));
    return `${line.quantity}x ${line.name}: ${money}`;
  });
  if (input.summary && summaryText.length > 0) {
    const money = formatMoney(input.summary.totalCents, input.summary.currency ?? "EUR", moneyLocale(nl));
    summaryText.push(`${nl ? "Totaal betaald" : "Total paid"}: ${money}`);
  }

  const textLines = [
    intro,
    "",
    input.eventName,
    ...(moment ? [moment] : []),
    ...(place ? [place] : []),
    "",
    input.orderUrl,
    ...(attached ? ["", attached] : []),
    ...(contents.googleLinks.length > 0 ? ["", googleText] : []),
    ...(summaryText.length > 0 ? ["", ...summaryText] : []),
    "",
    warning,
    input.orderNumber,
  ];

  const attachedHtml = attached
    ? `<p style="margin:22px 0 0;font-size:14px;line-height:1.5;color:${COLOR.body}">${escapeHtml(attached)}</p>`
    : "";
  const googleHtml =
    contents.googleLinks.length > 0
      ? `<p style="margin:22px 0 0;font-size:13px;color:${COLOR.muted}">${escapeHtml(googleTitle)}</p><p style="margin:10px 0 0">${contents.googleLinks
          .map(
            (link) =>
              `<a href="${escapeHtml(link.url)}" style="display:inline-block;border:1px solid #d5d9e4;border-radius:999px;padding:10px 15px;margin:0 8px 8px 0;color:${COLOR.ink};text-decoration:none;font-size:14px;font-weight:700">${escapeHtml(link.label)}</a>`
          )
          .join("")}</p>`
      : "";

  const owner = input.event?.ownerName?.trim();
  const ownerHtml = owner
    ? `<div style="padding-bottom:10px;font-size:12px;font-weight:600;color:${COLOR.muted}">${escapeHtml(owner)}</div>`
    : "";
  // De kop van het witte blok: links de post, de titel en het praktische,
  // rechts de gele datumpin.
  const headHtml = input.event
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td valign="top" style="padding-right:14px">${ownerHtml}${titleHtml(input.eventName)}${factsHtml(input.event, nl)}</td><td valign="top" align="right" width="64" style="width:64px">${pinHtml(input.event, nl)}</td></tr></table>`
    : `${ownerHtml}${titleHtml(input.eventName)}`;

  const html = mailDocument({
    lang: nl ? "nl" : "en",
    title: subject,
    rows: `${posterHtml(input.event)}<tr><td style="padding:26px 30px 30px">${headHtml}<p style="margin:20px 0 0;font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(intro)}</p><p style="margin:22px 0 0">${mailButton(input.orderUrl, button)}</p>${attachedHtml}${googleHtml}${summaryHtml(input.summary, nl)}</td></tr><tr><td style="padding:16px 30px;background:${COLOR.paper2};border-top:1px solid ${COLOR.line}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td style="font-size:12px;line-height:1.5;color:${COLOR.muted}">${escapeHtml(warning)}</td><td align="right" style="font-size:12px;font-weight:600;color:${COLOR.muted};white-space:nowrap;padding-left:14px">${escapeHtml(input.orderNumber)}</td></tr></table></td></tr>`,
  });

  return {
    to: input.buyerEmail,
    replyTo: input.replyTo,
    subject,
    attachments: input.attachments,
    text: textLines.join("\n"),
    html,
  };
}

/**
 * Een ticket dat het beheer verwijderde (tabblad Deelnemers), met de reden die
 * het beheer opgaf. Gaat naar de koper: die kreeg de tickets en die moet weten
 * dat er een niet meer werkt. Zegt of er geld teruggaat enkel wanneer dat via
 * de site gebeurde; anders staat het, als het moet, in de reden.
 */
export function ticketCancelledMail(input: {
  locale: "nl" | "en";
  buyerName: string;
  buyerEmail: string;
  attendeeName: string;
  ticketTypeName: string;
  eventName: string;
  orderNumber: string;
  reason: string;
  /** Wat er via Mollie teruggaat; `null` wanneer er via de site niets terugging. */
  refund: { amountCents: number; currency: string } | null;
  /** Geldige tickets die de koper voor dit event nog in deze bestelling heeft. */
  remainingTickets: number;
  replyTo?: string | null;
  event?: OrderMailEvent;
}): MailMessage {
  const nl = input.locale === "nl";
  const own = sameName(input.attendeeName, input.buyerName);
  const subject = nl
    ? `${own ? "Je ticket" : `Ticket van ${input.attendeeName}`} voor ${input.eventName} geannuleerd`
    : `${own ? "Your ticket" : `${input.attendeeName}'s ticket`} for ${input.eventName} cancelled`;
  const intro = nl
    ? `Dag ${input.buyerName}, ${own ? "je ticket" : `het ticket van ${input.attendeeName}`} (${input.ticketTypeName}) voor ${input.eventName} is geannuleerd. Het werkt niet meer aan de ingang.`
    : `Hi ${input.buyerName}, ${own ? "your ticket" : `${input.attendeeName}'s ticket`} (${input.ticketTypeName}) for ${input.eventName} has been cancelled. It no longer works at the entrance.`;
  const reasonLabel = nl ? "Reden" : "Reason";
  const refundLine = input.refund
    ? nl
      ? `Je krijgt ${formatMoney(input.refund.amountCents, input.refund.currency, moneyLocale(nl))} terug op de rekening waarmee je betaalde. Dat kan enkele dagen duren.`
      : `You will get ${formatMoney(input.refund.amountCents, input.refund.currency, moneyLocale(nl))} back on the account you paid with. This can take a few days.`
    : "";
  const remainingLine =
    input.remainingTickets > 0
      ? nl
        ? input.remainingTickets === 1
          ? "Je andere ticket van deze bestelling blijft geldig."
          : `Je ${input.remainingTickets} andere tickets van deze bestelling blijven geldig.`
        : input.remainingTickets === 1
          ? "The other ticket in this order stays valid."
          : `The ${input.remainingTickets} other tickets in this order stay valid.`
      : "";
  const questions = nl
    ? "Vragen? Antwoord gewoon op deze mail."
    : "Questions? Just reply to this email.";

  const textLines = [
    intro,
    "",
    `${reasonLabel}:`,
    input.reason,
    ...(refundLine ? ["", refundLine] : []),
    ...(remainingLine ? ["", remainingLine] : []),
    "",
    questions,
    input.orderNumber,
  ];

  const paragraph = (text: string) =>
    `<p style="margin:16px 0 0;font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(text)}</p>`;
  const headHtml = input.event
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td valign="top" style="padding-right:14px">${titleHtml(input.eventName)}${factsHtml(input.event, nl)}</td><td valign="top" align="right" width="64" style="width:64px">${pinHtml(input.event, nl)}</td></tr></table>`
    : titleHtml(input.eventName);
  const html = mailDocument({
    lang: nl ? "nl" : "en",
    title: subject,
    preheader: intro,
    rows: `<tr><td style="padding:26px 30px 30px">${headHtml}<p style="margin:20px 0 0;font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(intro)}</p>${mailMessageBox(input.reason, reasonLabel)}${refundLine ? paragraph(refundLine) : ""}${remainingLine ? paragraph(remainingLine) : ""}</td></tr><tr><td style="padding:16px 30px;background:${COLOR.paper2};border-top:1px solid ${COLOR.line}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td style="font-size:12px;line-height:1.5;color:${COLOR.muted}">${escapeHtml(questions)}</td><td align="right" style="font-size:12px;font-weight:600;color:${COLOR.muted};white-space:nowrap;padding-left:14px">${escapeHtml(input.orderNumber)}</td></tr></table></td></tr>`,
  });

  return {
    to: input.buyerEmail,
    replyTo: input.replyTo,
    subject,
    text: textLines.join("\n"),
    html,
  };
}

/** Hoofdletters en dubbele spaties tellen niet, net als bij de voorverkoop. */
function sameName(left: string, right: string): boolean {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-BE");
  return normalize(left) === normalize(right);
}

/** De voet van een ticketmail: links een regel uitleg, rechts het bestelnummer. */
function footerRow(note: string, orderNumber: string | null): string {
  const number = orderNumber
    ? `<td align="right" style="font-size:12px;font-weight:600;color:${COLOR.muted};white-space:nowrap;padding-left:14px">${escapeHtml(orderNumber)}</td>`
    : "";
  return `<tr><td style="padding:16px 30px;background:${COLOR.paper2};border-top:1px solid ${COLOR.line}"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td style="font-size:12px;line-height:1.5;color:${COLOR.muted}">${escapeHtml(note)}</td>${number}</tr></table></td></tr>`;
}

function eventHead(eventName: string, event: OrderMailEvent | undefined, nl: boolean): string {
  return event
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%"><tr><td valign="top" style="padding-right:14px">${titleHtml(eventName)}${factsHtml(event, nl)}</td><td valign="top" align="right" width="64" style="width:64px">${pinHtml(event, nl)}</td></tr></table>`
    : titleHtml(eventName);
}

/**
 * Een ticket dat het beheer van type wisselde (upgrade of downgrade, tabblad
 * Deelnemers). Gaat naar de koper, zoals de annulatie. De code en de QR blijven
 * dezelfde, dus er hoeft niets opnieuw gedownload te worden; dat zegt de mail
 * er uitdrukkelijk bij, anders zoekt de deelnemer een nieuw ticket. Over geld
 * zegt ze niets: een prijsverschil regelt de organisator buiten de site, en
 * staat, als het moet, in het bericht.
 */
export function ticketChangedMail(input: {
  locale: "nl" | "en";
  buyerName: string;
  buyerEmail: string;
  attendeeName: string;
  fromName: string;
  toName: string;
  eventName: string;
  orderNumber: string;
  orderUrl: string;
  /** Een optionele uitleg van de organisator, letterlijk in de mail. */
  message: string | null;
  replyTo?: string | null;
  event?: OrderMailEvent;
}): MailMessage {
  const nl = input.locale === "nl";
  const own = sameName(input.attendeeName, input.buyerName);
  const subject = nl
    ? `${own ? "Je ticket" : `Ticket van ${input.attendeeName}`} voor ${input.eventName} gewijzigd`
    : `${own ? "Your ticket" : `${input.attendeeName}'s ticket`} for ${input.eventName} changed`;
  const intro = nl
    ? `Dag ${input.buyerName}, ${own ? "je ticket" : `het ticket van ${input.attendeeName}`} voor ${input.eventName} is omgezet van ${input.fromName} naar ${input.toName}.`
    : `Hi ${input.buyerName}, ${own ? "your ticket" : `${input.attendeeName}'s ticket`} for ${input.eventName} has been changed from ${input.fromName} to ${input.toName}.`;
  const same = nl
    ? "Het ticket en de QR-code blijven dezelfde: je hoeft niets opnieuw te downloaden. Aan de ingang geldt het meteen als het nieuwe type."
    : "The ticket and its QR code stay the same: there is nothing to download again. At the entrance it counts as the new type right away.";
  const button = nl ? "Bekijk je tickets" : "View your tickets";
  const messageLabel = nl ? "Bericht van de organisator" : "Message from the organiser";
  const questions = nl
    ? "Vragen? Antwoord gewoon op deze mail."
    : "Questions? Just reply to this email.";

  const textLines = [
    intro,
    "",
    same,
    ...(input.message ? ["", `${messageLabel}:`, input.message] : []),
    "",
    input.orderUrl,
    "",
    questions,
    input.orderNumber,
  ];
  const html = mailDocument({
    lang: nl ? "nl" : "en",
    title: subject,
    preheader: intro,
    rows: `<tr><td style="padding:26px 30px 30px">${eventHead(input.eventName, input.event, nl)}<p style="margin:20px 0 0;font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(intro)}</p><p style="margin:16px 0 0;font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(same)}</p>${input.message ? mailMessageBox(input.message, messageLabel) : ""}<p style="margin:22px 0 0">${mailButton(input.orderUrl, button)}</p></td></tr>${footerRow(questions, input.orderNumber)}`,
  });
  return { to: input.buyerEmail, replyTo: input.replyTo, subject, text: textLines.join("\n"), html };
}

/**
 * Een bericht van de organisator aan de deelnemers van een event (tabblad
 * Deelnemers, "Deelnemers mailen"): het onderwerp en de tekst zoals de
 * organisator ze schreef, onder de kop van het event. Antwoorden gaat naar het
 * contactadres van het event. Eén mail per adres, ook wanneer iemand meerdere
 * tickets heeft.
 */
export function attendeeMessageMail(input: {
  locale: "nl" | "en";
  to: string;
  name: string | null;
  eventName: string;
  subject: string;
  message: string;
  senderName: string | null;
  replyTo?: string | null;
  event?: OrderMailEvent;
}): MailMessage {
  const nl = input.locale === "nl";
  const greeting = input.name ? (nl ? `Dag ${input.name},` : `Hi ${input.name},`) : nl ? "Dag," : "Hi,";
  const why = nl
    ? `Je krijgt deze mail omdat je een ticket hebt voor ${input.eventName}.`
    : `You are receiving this email because you have a ticket for ${input.eventName}.`;
  const reply = input.replyTo
    ? nl
      ? "Vragen? Antwoord gewoon op deze mail."
      : "Questions? Just reply to this email."
    : why;
  const label = input.senderName
    ? nl
      ? `Bericht van ${input.senderName}`
      : `Message from ${input.senderName}`
    : nl
      ? "Bericht van de organisator"
      : "Message from the organiser";
  const textLines = [greeting, "", input.message, "", why];
  const html = mailDocument({
    lang: nl ? "nl" : "en",
    title: input.subject,
    preheader: input.message.slice(0, 140),
    rows: `<tr><td style="padding:26px 30px 30px">${eventHead(input.eventName, input.event, nl)}<p style="margin:20px 0 0;font-size:15.5px;line-height:1.6;color:${COLOR.body}">${escapeHtml(greeting)}</p>${mailMessageBox(input.message, label)}<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${COLOR.muted}">${escapeHtml(why)}</p></td></tr>${footerRow(reply, null)}`,
  });
  return {
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    text: textLines.join("\n"),
    html,
  };
}
