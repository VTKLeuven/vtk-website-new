import "server-only";

import { prisma } from "@vtk/db";
import {
  defaultMailFrom,
  deliverMail,
  smtpConfigured,
  type MailDeliveryResult,
  type MailInput,
} from "@vtk/mail";

export { defaultMailFrom, smtpConfigured };
export type { MailInput };

/** Hoe lang mailinhoud beschikbaar blijft voor technisch onderzoek. */
export const EMAIL_LOG_RETENTION_DAYS = 30;

/**
 * Stabiele herkomstcodes voor het filter. De labels horen hier bij de code die
 * ze schrijft; zo wordt "website" geen onbruikbare verzamelbak zodra er een
 * nieuwe mailsoort bijkomt.
 */
export const EMAIL_SOURCES = {
  account: { nl: "Accounts", en: "Accounts" },
  contact: { nl: "Contactformulier", en: "Contact form" },
  expenses: { nl: "Rekeningen", en: "Expenses" },
  forms: { nl: "Formulieren", en: "Forms" },
  lesbezoeken: { nl: "Lesbezoeken", en: "Classroom visits" },
  shifts: { nl: "Shiften", en: "Shifts" },
  takedowns: { nl: "Verwijderverzoeken", en: "Takedown requests" },
  theokot: { nl: "Theokot", en: "Theokot" },
  theokotRental: { nl: "Theokotverhuur", en: "Theokot rentals" },
  ticketing: { nl: "Tickets", en: "Tickets" },
  urenloopApp: { nl: "24UL-app", en: "24UL app" },
  website: { nl: "Website", en: "Website" },
} as const;

export type EmailSource = keyof typeof EMAIL_SOURCES;

export type WebsiteMailOptions = {
  throwOnError?: boolean;
  source?: EmailSource;
  /** Behoudt de strengere productiegrendel van de ticketoutbox. */
  requireProductionConfig?: boolean;
};

/**
 * Verstuurt via de gedeelde SMTP-laag en schrijft altijd één technische
 * logregel voor de poging. Een kapotte logtabel mag echte post nooit blokkeren.
 */
export async function deliverWebsiteMail(
  input: MailInput,
  options: WebsiteMailOptions = {},
): Promise<MailDeliveryResult> {
  const startedAt = new Date();

  let result: MailDeliveryResult;
  if (
    options.requireProductionConfig &&
    process.env.NODE_ENV === "production" &&
    (!smtpConfigured() || !process.env.MAIL_FROM?.trim())
  ) {
    result = {
      status: "failed",
      error: new Error("SMTP_HOST and MAIL_FROM must be configured"),
    };
  } else {
    result = await deliverMail(input);
  }

  const completedAt = new Date();
  await writeEmailLog(input, options.source ?? "website", result, startedAt, completedAt);
  return result;
}

/** Zelfde contract als @vtk/mail, maar met het centrale websitelogboek erbij. */
export async function sendMail(
  input: MailInput,
  options: WebsiteMailOptions = {},
): Promise<boolean> {
  const result = await deliverWebsiteMail(input, options);
  if (result.status !== "failed") return true;
  if (options.throwOnError) throw result.error;
  return false;
}

async function writeEmailLog(
  input: MailInput,
  source: EmailSource,
  result: MailDeliveryResult,
  createdAt: Date,
  completedAt: Date,
): Promise<void> {
  const cc = Array.isArray(input.cc) ? input.cc.filter(Boolean).join(", ") : input.cc?.trim();
  const base = {
    createdAt,
    completedAt,
    durationMs: Math.max(0, completedAt.getTime() - createdAt.getTime()),
    source,
    from: clean(input.from?.trim() || defaultMailFrom()),
    to: clean(input.to),
    cc: cc ? clean(cc) : null,
    replyTo: input.replyTo ? clean(input.replyTo) : null,
    subject: clean(input.subject),
    text: clean(input.text),
    html: input.html ? clean(input.html) : null,
    attachments: (input.attachments ?? []).map((attachment) => ({
      filename: clean(attachment.filename),
      contentType: attachment.contentType ?? null,
      bytes: attachment.content.byteLength,
    })),
  };

  try {
    if (result.status === "failed") {
      await prisma.emailLog.create({
        data: {
          ...base,
          status: "FAILED",
          accepted: [],
          rejected: [],
          error: errorSummary(result.error),
        },
      });
    } else if (result.status === "simulated") {
      await prisma.emailLog.create({
        data: {
          ...base,
          status: "SIMULATED",
          providerMessageId: result.messageId,
          accepted: [],
          rejected: [],
        },
      });
    } else {
      await prisma.emailLog.create({
        data: {
          ...base,
          status: result.status === "partial" ? "PARTIAL" : "SENT",
          providerMessageId: result.messageId,
          providerResponse: result.response ? clean(result.response).slice(0, 2_000) : null,
          accepted: result.accepted.map(clean),
          rejected: result.rejected.map(clean),
        },
      });
    }
  } catch (error) {
    // De verzenduitkomst is op dit punt al gekend. Een loggingfout mag die niet
    // veranderen en mag een outbox ook niet tot een dubbele verzending dwingen.
    console.error("[email-log] kon verzendpoging niet bewaren", error);
    return;
  }

  try {
    await maybePruneEmailLog();
  } catch (error) {
    console.error("[email-log] kon oude regels niet opruimen", error);
  }
}

function clean(value: string): string {
  // PostgreSQL tekstvelden weigeren NUL; mailinhoud hoeft daardoor niet de
  // geslaagde verzending alsnog als een loggingfout te laten eindigen.
  return value.replaceAll("\0", "");
}

function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return clean(String(error)).slice(0, 10_000);
  const details = error as Error & {
    code?: unknown;
    command?: unknown;
    response?: unknown;
    responseCode?: unknown;
  };
  const extra = [
    details.code === undefined ? null : `code=${String(details.code)}`,
    details.command === undefined ? null : `command=${String(details.command)}`,
    details.responseCode === undefined ? null : `responseCode=${String(details.responseCode)}`,
    details.response === undefined ? null : `response=${String(details.response)}`,
  ].filter((value): value is string => Boolean(value));
  return clean(`${error.name}: ${error.message}${extra.length ? `\n${extra.join("\n")}` : ""}`).slice(
    0,
    10_000,
  );
}

/** Verwijdert mailinhoud die buiten de technische bewaartermijn valt. */
export async function pruneEmailLog(): Promise<number> {
  const cutoff = new Date(Date.now() - EMAIL_LOG_RETENTION_DAYS * 86_400_000);
  const { count } = await prisma.emailLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}

const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

async function maybePruneEmailLog(): Promise<void> {
  const now = Date.now();
  if (now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  await pruneEmailLog();
}
