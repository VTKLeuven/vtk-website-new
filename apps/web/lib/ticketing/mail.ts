import "server-only";

import nodemailer from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string | null;
};

let transport: nodemailer.Transporter | null = null;

function smtpTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  transport ??= nodemailer.createTransport({
    host,
    port: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
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
    console.info(`[ticket-mail:dev] ${message.subject} -> ${message.to}`);
    return `dev-${Date.now()}`;
  }

  const result = await smtp.sendMail({
    from: sender,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    replyTo: message.replyTo || process.env.MAIL_REPLY_TO || undefined,
  });
  return result.messageId;
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
}): MailMessage {
  const nl = input.locale === "nl";
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

  return {
    to: input.buyerEmail,
    replyTo: input.replyTo,
    subject,
    text: `${intro}\n\n${input.orderUrl}\n\n${warning}\n${input.orderNumber}`,
    html: `<!doctype html><html><body style="margin:0;background:#f2f0e9;color:#0a0f1f;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:32px 20px"><div style="height:8px;background:#ffd23f"></div><div style="background:#fff;border:1px solid #d9dbe0;padding:28px"><div style="font-size:14px;font-weight:700;letter-spacing:.08em">VTK TICKETING</div><h1 style="font-size:26px;line-height:1.2;margin:28px 0 12px">${escapeHtml(input.eventName)}</h1><p style="line-height:1.6;color:#34405e">${escapeHtml(intro)}</p><p style="margin:28px 0"><a href="${escapeHtml(input.orderUrl)}" style="display:inline-block;background:#0a0f1f;color:#fff;text-decoration:none;padding:13px 18px;border-radius:4px;font-weight:700">${button}</a></p><p style="font-size:12px;color:#5c667f;line-height:1.5">${warning}<br>${escapeHtml(input.orderNumber)}</p></div></div></body></html>`,
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
