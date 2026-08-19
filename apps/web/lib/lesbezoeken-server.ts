import "server-only";

import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { sendMail } from "@vtk/mail";
import {
  DEFAULT_LESBEZOEK_CONFIG,
  DEFAULT_LESBEZOEK_TEMPLATES,
  parseLesbezoekTemplates,
  type LesbezoekConfig,
  type LesbezoekTemplates,
} from "@/lib/lesbezoekenMail";

/**
 * Server-only kant van de lesbezoeken: de database, de instellingen en het
 * versturen van de mails. De zuivere logica staat in `lib/lesbezoeken.ts` en
 * `lib/lesbezoekenMail.ts`, zodat prisma nooit in een clientbundel belandt.
 */

export const LESBEZOEK_MAIL_KEY = "lesbezoeken.mail";
export const LESBEZOEK_CONFIG_KEY = "lesbezoeken.config";

/**
 * De afzender van elke lesbezoekenmail.
 *
 * Bewust niet `MAIL_FROM` (dat staat op de ticket-/Theokot-afzender): een vraag
 * aan een professor hoort niet als "Theokot VTK" in zijn inbox te landen. En
 * bewust niet het adres van de aanvrager: dan spooft onze mailserver een domein
 * dat hij niet mag ondertekenen en belandt de vraag in de spam.
 */
const LESBEZOEK_FROM =
  process.env.MAIL_FROM_LESBEZOEKEN?.trim() || "VTK Onderwijs <lesbezoeken@vtk.be>";

export async function getLesbezoekTemplates(): Promise<LesbezoekTemplates> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: LESBEZOEK_MAIL_KEY } });
    return parseLesbezoekTemplates(row?.value);
  } catch {
    return DEFAULT_LESBEZOEK_TEMPLATES;
  }
}

export async function getLesbezoekConfig(): Promise<LesbezoekConfig> {
  const row = await prisma.setting.findUnique({ where: { key: LESBEZOEK_CONFIG_KEY } });
  const value = (row?.value ?? {}) as Partial<LesbezoekConfig>;
  return {
    signature:
      typeof value.signature === "string" && value.signature.trim()
        ? value.signature
        : DEFAULT_LESBEZOEK_CONFIG.signature,
    notifyEmail:
      typeof value.notifyEmail === "string" && value.notifyEmail.trim()
        ? value.notifyEmail.trim()
        : DEFAULT_LESBEZOEK_CONFIG.notifyEmail,
  };
}

// -----------------------------------------------------------------------------
// Mailen
// -----------------------------------------------------------------------------

/** Datum en uur zoals ze in de mail moeten staan, altijd in Brussel-tijd. */
export function formatMailMoment(
  start: Date,
  locale: "nl" | "en",
): { date: string; time: string } {
  const date = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(start);
  return { date, time };
}

/**
 * Verstuurt één lesbezoekenmail.
 *
 * `replyTo` staat op de lesbezoekenmailbox en niet op de aanvrager: met de
 * faculteit is afgesproken dat VTK Onderwijs het verkeer met de professoren doet,
 * dus een antwoord hoort daar toe te komen en niet bij de organisatie.
 */
export async function sendLesbezoekMail(input: {
  to: string;
  subject: string;
  text: string;
  cc?: string;
}): Promise<boolean> {
  const config = await getLesbezoekConfig();
  const delivered = await sendMail({
    to: input.to,
    cc: input.cc,
    from: LESBEZOEK_FROM,
    replyTo: config.notifyEmail,
    subject: input.subject,
    text: input.text,
  });

  if (!delivered) {
    // Enkel dát het misging: de inhoud is post van en naar een professor en hoort
    // niet in onze monitoring.
    Sentry.captureMessage("Lesbezoeken: mail versturen mislukt", "error");
  }
  return delivered;
}

/**
 * Seintje naar de lesbezoekenmailbox dat er een aanvraag binnenkwam.
 *
 * Faalt nooit naar buiten toe: als deze mail niet vertrekt, staat de aanvraag nog
 * altijd in het beheer, en de aanvrager mag daar geen foutmelding voor krijgen.
 */
export async function notifyNewLesbezoek(visit: {
  startsAt: Date;
  course: string;
  audience: string;
  subject: string;
  teacherEmail: string;
  requesterEmail: string | null;
  organisation: { name: string };
}): Promise<void> {
  try {
    const config = await getLesbezoekConfig();
    const { date, time } = formatMailMoment(visit.startsAt, "nl");
    await sendMail({
      to: config.notifyEmail,
      from: LESBEZOEK_FROM,
      replyTo: visit.requesterEmail ?? undefined,
      subject: `[Lesbezoek] ${visit.organisation.name} — ${visit.course} op ${date}`,
      text: [
        `Organisatie: ${visit.organisation.name}`,
        `Onderwerp: ${visit.subject}`,
        `Doelgroep: ${visit.audience}`,
        `Vak: ${visit.course}`,
        `Wanneer: ${date} om ${time}`,
        `Professor: ${visit.teacherEmail}`,
        `Aanvrager: ${visit.requesterEmail ?? "—"}`,
        "",
        "Beoordelen doe je in het beheer onder Lesbezoeken.",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[lesbezoeken] kon melding van nieuwe aanvraag niet versturen", err);
    Sentry.captureException(err);
  }
}
