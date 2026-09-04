import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { sendMail } from "@/lib/email";
import { getObjectBuffer } from "@vtk/storage";
import { siteUrl } from "@/lib/seo";
import {
  DEPOSIT_CHOICE_META,
  DEPOSIT_STATE_META,
  RENTAL_STATUS_META,
  type DepositChoice,
  type RenterType,
} from "@/lib/theokotVerhuur";
import {
  DEFAULT_RENTAL_CONFIG,
  DEFAULT_RENTAL_GUIDE,
  DEFAULT_RENTAL_TEMPLATES,
  parseRentalConfig,
  parseRentalGuide,
  parseRentalTemplates,
  rentalReplyTo,
  type RentalConfig,
  type RentalGuide,
  type RentalTemplate,
} from "@/lib/theokotVerhuurMail";
import {
  DEFAULT_RENTAL_QUESTIONS,
  parseRentalQuestions,
  type RentalQuestions,
} from "@/lib/theokotVerhuur";

/**
 * Server-only kant van de Theokot-verhuur: de database, de instellingen, de
 * mails en de eenmalige sleutels achter de knoppen in de meldingsmail. De zuivere
 * logica staat in `lib/theokotVerhuur.ts` en `lib/theokotVerhuurMail.ts`, zodat
 * prisma nooit in een clientbundel belandt.
 */

export const RENTAL_CONFIG_KEY = "theokot.rental.config";
export const RENTAL_MAIL_KEY = "theokot.rental.mail";
export const RENTAL_QUESTIONS_KEY = "theokot.rental.questions";
export const RENTAL_GUIDE_KEY = "theokot.rental.guide";

/**
 * De afzender van elke verhuurmail.
 *
 * Bewust met een eigen variabele naast `MAIL_FROM`: die staat al op de
 * Theokot-broodjes, en een verhuurcontract hoort niet in dezelfde draad te
 * belanden als een besteld broodje. Zonder variabele valt hij terug op hetzelfde
 * adres, want dat is nog altijd de juiste post.
 */
const RENTAL_FROM =
  process.env.MAIL_FROM_THEOKOT_VERHUUR?.trim() || "Theokot VTK <theokot@vtk.be>";

/**
 * De afzender zoals ze in de inbox van de huurder staat. De schermen tonen ze in
 * het mailvoorbeeld; die tekst mag geen tweede waarheid worden, dus komt ze uit
 * dezelfde constante als het versturen zelf.
 */
export function rentalSenderLabel(): string {
  return RENTAL_FROM;
}

// -----------------------------------------------------------------------------
// Instellingen
// -----------------------------------------------------------------------------

async function readSetting(key: string): Promise<unknown> {
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    return row?.value;
  } catch {
    return undefined;
  }
}

export async function getRentalConfig(): Promise<RentalConfig> {
  try {
    return parseRentalConfig(await readSetting(RENTAL_CONFIG_KEY));
  } catch {
    return DEFAULT_RENTAL_CONFIG;
  }
}

export async function getRentalTemplates(): Promise<RentalTemplate[]> {
  try {
    return parseRentalTemplates(await readSetting(RENTAL_MAIL_KEY));
  } catch {
    return DEFAULT_RENTAL_TEMPLATES;
  }
}

export async function getRentalQuestions(): Promise<RentalQuestions> {
  try {
    return parseRentalQuestions(await readSetting(RENTAL_QUESTIONS_KEY));
  } catch {
    return DEFAULT_RENTAL_QUESTIONS;
  }
}

export async function getRentalGuide(): Promise<RentalGuide> {
  try {
    return parseRentalGuide(await readSetting(RENTAL_GUIDE_KEY));
  } catch {
    return DEFAULT_RENTAL_GUIDE;
  }
}

// -----------------------------------------------------------------------------
// Formatteren
// -----------------------------------------------------------------------------

/** Datum en uur zoals ze in een mail moeten staan, altijd in Brussel-tijd. */
export function formatRentalMoment(
  instant: Date,
  locale: "nl" | "en",
): { date: string; time: string } {
  const date = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(instant);
  const time = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
  return { date, time };
}

export function depositChoiceLabel(choice: DepositChoice, locale: "nl" | "en"): string {
  return DEPOSIT_CHOICE_META[choice][locale];
}

// -----------------------------------------------------------------------------
// Mailen
// -----------------------------------------------------------------------------

export type RentalAttachment = { filename: string; content: Buffer; contentType?: string };

/**
 * Verstuurt één verhuurmail.
 *
 * `replyTo` staat op de mensen die de aanvragen behandelen: een huurder die op
 * de goedkeuring antwoordt, moet bij hen terechtkomen en niet bij een afzender
 * die niemand leest.
 */
export async function sendRentalMail(input: {
  to: string;
  subject: string;
  text: string;
  cc?: string | string[];
  replyTo?: string;
  attachments?: RentalAttachment[];
}): Promise<boolean> {
  const config = await getRentalConfig();
  const delivered = await sendMail(
    {
      to: input.to,
      cc: input.cc,
      from: RENTAL_FROM,
      replyTo: input.replyTo ?? rentalReplyTo(config),
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    },
    { source: "theokotRental" },
  );

  if (!delivered) {
    // Enkel dát het misging: de inhoud is post naar een huurder en hoort niet in
    // onze monitoring.
    Sentry.captureMessage("Theokot-verhuur: mail versturen mislukt", "error");
  }
  return delivered;
}

// -----------------------------------------------------------------------------
// Het huurcontract als bijlage
// -----------------------------------------------------------------------------

/**
 * Het huurcontract dat bij deze aanvraag hoort, klaar om aan te hangen.
 *
 * Intern en extern zijn twee verschillende documenten; is er voor deze taal geen
 * versie geüpload, dan valt hij terug op het Nederlandse van dezelfde doelgroep.
 * Ontbreekt ook dat, dan geeft dit `null` terug en vertrekt de mail zonder
 * bijlage; het scherm zegt op voorhand dat er geen contract klaarstaat, zodat
 * niemand denkt dat er wel een meeging.
 */
export async function loadContractAttachment(
  renterType: RenterType,
  locale: "nl" | "en",
): Promise<RentalAttachment | null> {
  const docs = await prisma.theokotRentalContractDoc.findMany({
    where: { audience: renterType },
    select: { locale: true, storageKey: true, fileName: true },
  });
  const doc = docs.find((row) => row.locale === locale) ?? docs.find((row) => row.locale === "nl");
  if (!doc) return null;

  try {
    const content = await getObjectBuffer(doc.storageKey);
    return { filename: doc.fileName, content, contentType: "application/pdf" };
  } catch (err) {
    console.error("[theokot-verhuur] huurcontract niet opgehaald", err);
    Sentry.captureException(err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// De eenmalige sleutel achter de knoppen in de meldingsmail
// -----------------------------------------------------------------------------

/**
 * Hoe lang de knoppen in de meldingsmail blijven werken.
 *
 * Een mail blijft jaren in een mailbox staan; een beslisknop mag dat niet. Dertig
 * dagen is ruim genoeg om een aanvraag te behandelen, en daarna moet je gewoon in
 * het beheer inloggen.
 */
export const DECISION_TOKEN_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Een nieuw token per beslissing; enkel de hash gaat naar de database. */
export async function createDecisionToken(
  rentalId: string,
  action: "APPROVE" | "REJECT",
  now: Date = new Date(),
): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await prisma.theokotRentalActionToken.create({
    data: {
      rentalId,
      action,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + DECISION_TOKEN_DAYS * 86_400_000),
    },
  });
  return token;
}

export type DecisionTokenLookup =
  | { status: "ok"; tokenId: string; rentalId: string; action: "APPROVE" | "REJECT" }
  | { status: "unknown" }
  | { status: "expired" }
  | { status: "used" };

/**
 * Zoekt een token op zonder het te verbruiken; de beslispagina toont daarmee
 * eerst wat er gaat gebeuren. Verbruiken doet `consumeDecisionToken`, en dat
 * gebeurt pas wanneer iemand op een knop drukt: een GET van een mailscanner mag
 * geen beslissing nemen.
 */
export async function lookupDecisionToken(
  token: string,
  now: Date = new Date(),
): Promise<DecisionTokenLookup> {
  const row = await prisma.theokotRentalActionToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, rentalId: true, action: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { status: "unknown" };
  if (row.usedAt) return { status: "used" };
  if (row.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
  return { status: "ok", tokenId: row.id, rentalId: row.rentalId, action: row.action };
}

/**
 * Verbruikt het token. Claimt met een `updateMany` op `usedAt: null`, zodat twee
 * mensen die tegelijk op dezelfde knop drukken niet twee mails versturen.
 */
export async function consumeDecisionToken(
  tokenId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const claimed = await prisma.theokotRentalActionToken.updateMany({
    where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  return claimed.count === 1;
}

/**
 * Trekt de resterende tokens van een aanvraag in.
 *
 * Zodra er beslist is, mag de andere knop uit dezelfde mail niets meer doen: wie
 * de melding later opent, zou anders een goedkeuring kunnen omkeren zonder te
 * zien dat er al geantwoord was.
 */
export async function revokeDecisionTokens(rentalId: string, now: Date = new Date()): Promise<void> {
  await prisma.theokotRentalActionToken.updateMany({
    where: { rentalId, usedAt: null },
    data: { usedAt: now },
  });
}

/** Vergelijkt twee tokens in constante tijd; voor de paden die dat zelf doen. */
export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// -----------------------------------------------------------------------------
// De melding naar wie de aanvragen behandelt
// -----------------------------------------------------------------------------

export type NotifyRentalInput = {
  id: string;
  responsibleName: string;
  email: string;
  phone: string;
  startsAt: Date;
  endsAt: Date;
  purpose: string;
  attendees: number | null;
  depositChoice: DepositChoice;
  remarks: string | null;
  renterType: RenterType;
  locale: "nl" | "en";
  extraAnswers: { label: string; value: string }[];
  /** Aanvragen die met dit venster botsen, al geformatteerd. */
  clashes: string[];
};

/**
 * Seintje naar de mensen die de verhuur regelen, met de twee knoppen erin.
 *
 * Faalt nooit naar buiten toe: gaat deze mail niet weg, dan staat de aanvraag nog
 * altijd in het beheer, en de aanvrager mag daar geen foutmelding voor krijgen.
 *
 * De twee links openen een bevestigingsscherm en versturen zelf niets. Dat is met
 * opzet: een mailclient die links vooruitlaadt zou anders een aanvraag kunnen
 * goedkeuren, en wie klikt hoort eerst te zien welke mail er in zijn naam
 * vertrekt.
 */
export async function notifyNewRental(rental: NotifyRentalInput): Promise<void> {
  try {
    const config = await getRentalConfig();
    if (config.notifyEmails.length === 0) return;

    const start = formatRentalMoment(rental.startsAt, "nl");
    const end = formatRentalMoment(rental.endsAt, "nl");
    const base = siteUrl();

    const [approveToken, rejectToken] = await Promise.all([
      createDecisionToken(rental.id, "APPROVE"),
      createDecisionToken(rental.id, "REJECT"),
    ]);

    const lines = [
      `Verantwoordelijke: ${rental.responsibleName}`,
      `E-mail: ${rental.email}`,
      `Telefoon: ${rental.phone || "—"}`,
      `Taal: ${rental.locale === "nl" ? "Nederlands" : "Engels"}`,
      "",
      `Wanneer: ${start.date} van ${start.time} tot ${end.time}${
        start.date === end.date ? "" : ` (${end.date})`
      }`,
      `Aard van de activiteit: ${rental.purpose}`,
      `Aantal aanwezigen: ${rental.attendees ?? "—"}`,
      `Waarborg: ${depositChoiceLabel(rental.depositChoice, "nl")}`,
      `Vermoedelijk: ${rental.renterType === "INTERNAL" ? "een post of werkgroep van VTK" : "een externe huurder"}`,
    ];

    if (rental.remarks?.trim()) {
      lines.push("", "Opmerkingen:", rental.remarks.trim());
    }
    for (const extra of rental.extraAnswers) {
      lines.push("", `${extra.label}:`, extra.value);
    }
    if (rental.clashes.length > 0) {
      lines.push(
        "",
        "! Let op, dit botst met:",
        ...rental.clashes.map((clash) => `- ${clash}`),
      );
    }

    lines.push(
      "",
      "-------------------------------------------------------------------",
      "BESLISSEN VANUIT DEZE MAIL",
      "",
      "De twee links hieronder openen een bevestigingsscherm. Daar zie je welke",
      "mail er naar de aanvrager vertrekt en kan je ze nog aanpassen. Op datzelfde",
      "scherm staat ook een knop die enkel de status zet, zonder te mailen.",
      "Er vertrekt dus niets door hier te klikken.",
      "",
      `Goedkeuren: ${base}/theokot/verhuur/beslissing/${approveToken}`,
      `Weigeren:   ${base}/theokot/verhuur/beslissing/${rejectToken}`,
      "",
      "Beide links werken eenmalig en vervallen na 30 dagen. Zodra er beslist is,",
      "doet de andere link niets meer.",
      "-------------------------------------------------------------------",
      "",
      `In het beheer: ${base}/admin/theokot/verhuur`,
    );

    await sendMail(
      {
        to: config.notifyEmails.join(", "),
        from: RENTAL_FROM,
        replyTo: rental.email,
        subject: `[Theokot verhuur] ${rental.responsibleName} — ${start.date}`,
        text: lines.join("\n"),
      },
      { source: "theokotRental" },
    );
  } catch (err) {
    console.error("[theokot-verhuur] kon melding van nieuwe aanvraag niet versturen", err);
    Sentry.captureException(err);
  }
}

// -----------------------------------------------------------------------------
// Het logboek
// -----------------------------------------------------------------------------

/** Schrijft weg wat er verstuurd werd; zonder dit is de historiek een gok. */
export async function logRentalMessage(input: {
  rentalId: string;
  kind: "confirmation" | "notify" | "reply";
  templateId?: string | null;
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
  attachmentName?: string | null;
  sentById?: string | null;
  sentViaMail?: boolean;
}): Promise<void> {
  try {
    await prisma.theokotRentalMessage.create({
      data: {
        rentalId: input.rentalId,
        kind: input.kind,
        templateId: input.templateId ?? null,
        to: input.to,
        cc: input.cc ?? null,
        subject: input.subject,
        body: input.body,
        attachmentName: input.attachmentName ?? null,
        sentById: input.sentById ?? null,
        sentViaMail: input.sentViaMail ?? false,
      },
    });
  } catch (err) {
    // Het logboek mag een geslaagde mail niet ongedaan maken.
    console.error("[theokot-verhuur] kon verstuurde mail niet loggen", err);
    Sentry.captureException(err);
  }
}

/** Korte omschrijving van een botsende aanvraag, voor de melding en het scherm. */
export function describeRentalWindow(
  rental: { responsibleName: string; startsAt: Date; endsAt: Date; status: keyof typeof RENTAL_STATUS_META },
  locale: "nl" | "en",
): string {
  const start = formatRentalMoment(rental.startsAt, locale);
  const end = formatRentalMoment(rental.endsAt, locale);
  const status = RENTAL_STATUS_META[rental.status][locale];
  return `${rental.responsibleName} — ${start.date} ${start.time}-${end.time} (${status})`;
}

/** Het label van een waarborgtoestand, voor de plekken die enkel de server heeft. */
export function depositStateLabel(state: keyof typeof DEPOSIT_STATE_META, locale: "nl" | "en"): string {
  return DEPOSIT_STATE_META[state][locale];
}

// -----------------------------------------------------------------------------
// Agenda-feed token
// -----------------------------------------------------------------------------

/**
 * Haalt het geheim token op achter de abonneerbare iCalendar-feed van de
 * Theokot-verhuur. Bestaat het nog niet, dan wordt er direct een cryptografisch
 * willekeurig token aangemaakt en bewaard.
 */
export async function getRentalFeedToken(): Promise<string> {
  const config = await getRentalConfig();
  if (config.feedToken) return config.feedToken;

  const token = randomBytes(24).toString("base64url");
  const nextConfig: RentalConfig = { ...config, feedToken: token };
  try {
    await prisma.setting.upsert({
      where: { key: RENTAL_CONFIG_KEY },
      create: { key: RENTAL_CONFIG_KEY, value: nextConfig },
      update: { value: nextConfig },
    });
  } catch (err) {
    console.error("[theokot-verhuur] kon nieuw feedToken niet bewaren", err);
  }
  return token;
}

/**
 * Controleert of het meegegeven token overeenkomt met het geconfigureerde
 * feedToken van de Theokot-verhuur. Tijdsaanval-bestendig (timingSafeEqual).
 */
export async function verifyRentalFeedToken(token: string): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const config = await getRentalConfig();
  if (!config.feedToken) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(config.feedToken);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

