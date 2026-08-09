import "server-only";

import nodemailer from "nodemailer";

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

let transport: nodemailer.Transporter | null = null;

function smtpTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const secure = process.env.SMTP_SECURE === "true";
  transport ??= nodemailer.createTransport({
    host,
    port: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure,
    // Op poort 587 mag de verbinding nooit onversleuteld doorgaan: daar reizen
    // een wachtwoord en de tickets van een koper over. Zonder dit valt
    // nodemailer terug op plain wanneer STARTTLS niet aangekondigd wordt.
    requireTLS: !secure,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return transport;
}

export async function sendMail(message: MailMessage): Promise<string> {
  const sender = process.env.MAIL_FROM?.trim();
  const smtp = smtpTransport();

  if (!sender || !smtp) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP_HOST and MAIL_FROM must be configured");
    }
    const files = message.attachments?.map((attachment) => attachment.filename).join(", ");
    console.info(
      `[ticket-mail:dev] ${message.subject} -> ${message.to}${files ? ` (bijlagen: ${files})` : ""}`
    );
    return `dev-${Date.now()}`;
  }

  const result = await smtp.sendMail({
    from: sender,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo || process.env.MAIL_REPLY_TO || undefined,
    attachments: message.attachments,
  });
  return result.messageId;
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

/** Eén zin over de bijlagen, of niets wanneer er geen zijn. */
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
}): MailMessage {
  const nl = input.locale === "nl";
  const contents = input.contents ?? NO_CONTENTS;
  const subject = nl
    ? `Je tickets voor ${input.eventName}`
    : `Your tickets for ${input.eventName}`;
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

  const textLines = [
    intro,
    "",
    input.orderUrl,
    ...(attached ? ["", attached] : []),
    ...(contents.googleLinks.length > 0 ? ["", googleText] : []),
    "",
    warning,
    input.orderNumber,
  ];

  const attachedHtml = attached
    ? `<p style="line-height:1.6;color:#34405e;font-size:14px;margin:0 0 22px">${escapeHtml(attached)}</p>`
    : "";
  const googleHtml =
    contents.googleLinks.length > 0
      ? `<p style="font-size:13px;color:#5c667f;margin:0 0 10px">${escapeHtml(googleTitle)}</p><p style="margin:0 0 26px">${contents.googleLinks
          .map(
            (link) =>
              `<a href="${escapeHtml(link.url)}" style="display:inline-block;border:1px solid #d9dbe0;border-radius:4px;padding:9px 13px;margin:0 8px 8px 0;color:#0a0f1f;text-decoration:none;font-size:14px">${escapeHtml(link.label)}</a>`
          )
          .join("")}</p>`
      : "";

  return {
    to: input.buyerEmail,
    replyTo: input.replyTo,
    subject,
    attachments: input.attachments,
    text: textLines.join("\n"),
    html: `<!doctype html><html><body style="margin:0;background:#f2f0e9;color:#0a0f1f;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="height:8px;background:#ffd23f"></div><div style="background:#fff;border:1px solid #d9dbe0;padding:28px"><div style="font-size:14px;font-weight:700;letter-spacing:.08em">VTK TICKETING</div><h1 style="font-size:26px;line-height:1.2;margin:28px 0 12px">${escapeHtml(input.eventName)}</h1><p style="line-height:1.6;color:#34405e">${escapeHtml(intro)}</p><p style="margin:28px 0"><a href="${escapeHtml(input.orderUrl)}" style="display:inline-block;background:#0a0f1f;color:#fff;text-decoration:none;padding:13px 18px;border-radius:4px;font-weight:700">${button}</a></p>${attachedHtml}${googleHtml}<p style="font-size:12px;color:#5c667f;line-height:1.5">${warning}<br>${escapeHtml(input.orderNumber)}</p></div></div></body></html>`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}
