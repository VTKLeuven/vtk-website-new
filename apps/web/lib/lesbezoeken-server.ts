import "server-only";

import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { sendMail } from "@vtk/mail";
import { clampNudgeLeadDays } from "@/lib/lesbezoeken";
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
    nudgeLeadDays:
      value.nudgeLeadDays === undefined || value.nudgeLeadDays === null
        ? DEFAULT_LESBEZOEK_CONFIG.nudgeLeadDays
        : clampNudgeLeadDays(value.nudgeLeadDays),
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

// -----------------------------------------------------------------------------
// Ingeplande mails (uitgesteld verzenden)
// -----------------------------------------------------------------------------

/**
 * Zet de stempels die bij een verstuurde geplande mail horen, op elk lesbezoek
 * dat ze dekt.
 *
 * Een gebundelde terugkoppeling staat als één rij in de database maar gaat over
 * meerdere bezoeken (`bundledIds`); zonder deze lus zou alleen het eerste bezoek
 * als "aanvrager verwittigd" gelden en zouden de negentien andere morgen weer in
 * de bundel opduiken.
 */
export async function applyScheduledMailStamps(
  mail: { kind: string; lesbezoekId: string; bundledIds: string[] },
  now: Date,
): Promise<void> {
  const ids = Array.from(new Set([mail.lesbezoekId, ...mail.bundledIds]));

  if (mail.kind === "professor") {
    await prisma.lesbezoek.updateMany({
      where: { id: { in: ids } },
      data: { professorMailedAt: now },
    });
    // De status volgt alleen wanneer er nog niets beslist was: een bezoek dat
    // intussen ingetrokken of afgewezen werd, mag niet terug naar "bij de prof".
    await prisma.lesbezoek.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status: "ASKED" },
    });
    return;
  }

  if (mail.kind === "nudge") {
    await prisma.lesbezoek.updateMany({
      where: { id: { in: ids } },
      data: { professorNudgedAt: now },
    });
    return;
  }

  if (mail.kind === "requester") {
    await prisma.lesbezoek.updateMany({
      where: { id: { in: ids } },
      data: { requesterNotifiedAt: now },
    });
  }
}

/**
 * Verwerkt alle ingeplande lesbezoekenmails waarvan het verzendmoment verstreken is.
 *
 * Claimt eerst via updateMany, verstuurt vervolgens de mail en werkt het lesbezoek bij.
 */
export async function processDueLesbezoekScheduledMails(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number }> {
  try {
    const due = await prisma.lesbezoekScheduledMail.findMany({
      where: {
        sendAt: { lte: now },
        sentAt: null,
        failedAt: null,
      },
      orderBy: { sendAt: "asc" },
    });

    if (due.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;

    for (const item of due) {
      // Claimen zodat gelijktijdige runs (bv. interval + page load) niet dubbel mailen
      const claimed = await prisma.lesbezoekScheduledMail.updateMany({
        where: { id: item.id, sentAt: null, failedAt: null },
        data: { sentAt: now },
      });
      if (claimed.count === 0) continue;

      const delivered = await sendLesbezoekMail({
        to: item.to,
        cc: item.cc ?? undefined,
        subject: item.subject,
        text: item.body,
      });

      if (delivered) {
        await applyScheduledMailStamps(item, now);
        sent += 1;
      } else {
        await prisma.lesbezoekScheduledMail.update({
          where: { id: item.id },
          data: { sentAt: null, failedAt: now, failedReason: "Versturen via mailserver mislukt" },
        });
        failed += 1;
      }
    }

    return { sent, failed };
  } catch (err) {
    console.error("[lesbezoeken] fout bij verwerken van geplande mails:", err);
    Sentry.captureException(err);
    return { sent: 0, failed: 0 };
  }
}
