import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { Prisma } from "@prisma/client";

import {
  findPianoSlot,
  isPianoSlotBookable,
  pianoWeekRange,
} from "@/lib/piano";
import { getPianoConfig, getPianoRules } from "@/lib/piano-server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import { sendMail } from "@/lib/email";

/**
 * Reserveren en annuleren van een pianoslot, los van het scherm.
 *
 * Verhuisd uit `app/actions/piano.ts` toen de VTK-app dezelfde handeling nodig
 * had. Zelfde afweging als bij Theokot: één implementatie, dus de app kan per
 * definitie niet meer boeken dan de website toelaat. De weeklimiet en het
 * boekbare venster zijn precies waar dat zou mislopen.
 */

export type PianoErrorCode =
  | "NOT_FOUND"
  | "PAST"
  | "BEYOND_HORIZON"
  | "WEEK_LIMIT"
  | "TAKEN";

export class PianoReservationError extends Error {
  constructor(readonly code: PianoErrorCode) {
    super(code);
    this.name = "PianoReservationError";
  }
}

// Gelijk aan de lijsten in `app/actions/piano.ts`; het Engelse adminpad hoort
// erbij, anders blijft dat scherm na een reservatie op de oude stand staan.
const PUBLIC_PATHS = ["/piano", "/en/piano"];
const ADMIN_PATHS = ["/admin/piano", "/en/admin/piano"];

export function revalidatePiano(): void {
  for (const path of [...PUBLIC_PATHS, ...ADMIN_PATHS]) revalidatePath(path);
}

/**
 * Reserveert één tijdslot.
 *
 * **De starttijd wordt niet vertrouwd.** Ze moet terugkomen uit dezelfde
 * slotberekening als degene die het scherm getekend heeft; anders kan je met een
 * zelfgemaakte aanvraag om het even welk uur boeken. Dat is de reden dat
 * `findPianoSlot` hier staat en niet enkel in de UI.
 *
 * De unieke index op `startsAt` vangt de race af waarin twee leden tegelijk
 * hetzelfde slot indrukken: de tweede krijgt een P2002 en dus `TAKEN`.
 */
/**
 * De bevestiging van een pianoreservatie. Puur, los van het versturen: zo toont
 * de voorvertoning in /admin/it/flows dezelfde mail als de speler krijgt.
 *
 * Deze mail is meteen het toegangsbewijs: de bewaking van het kasteel mag ernaar
 * vragen. Zie docs/design-decisions.md, "De bevestigingsmail als bewijs".
 */
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
  mailNoticeBox,
  mailParagraph,
  mailPill,
} from "@/lib/mailDesign";

export function pianoConfirmationMail(input: {
  name: string;
  locale: "NL" | "EN";
  startsAt: Date;
  endsAt: Date;
}): { subject: string; text: string; html: string } {
  const isNl = input.locale !== "EN";
  const dateLocale = isNl ? "nl-BE" : "en-GB";
  const dayFmt = new Intl.DateTimeFormat(dateLocale, {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(dateLocale, {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = dayFmt.format(input.startsAt);
  const timeStr = `${timeFmt.format(input.startsAt)} - ${timeFmt.format(input.endsAt)}`;
  const subject = isNl
    ? `Bevestiging reservatie piano: ${dateStr}`
    : `Piano booking confirmation: ${dateStr}`;

  const text = isNl
    ? [
        `Dag ${input.name},`,
        "",
        `Je reservatie voor de piano in lokaal 01.52 van het kasteel Arenberg is bevestigd:`,
        "",
        `• Datum: ${dateStr}`,
        `• Tijdstip: ${timeStr}`,
        `• Locatie: Lokaal 01.52, kasteel Arenberg`,
        "",
        `Hou deze bevestigingsmail bij tijdens het spelen: de bewaking kan ernaar vragen als bewijs.`,
        "",
        `Groeten,`,
        `VTK`,
      ].join("\n")
    : [
        `Hi ${input.name},`,
        "",
        `Your reservation for the piano in room 01.52 of Arenberg castle has been confirmed:`,
        "",
        `• Date: ${dateStr}`,
        `• Time: ${timeStr}`,
        `• Location: Room 01.52, Arenberg castle`,
        "",
        `Please keep this confirmation email with you while playing: security may ask for it as proof.`,
        "",
        `Best regards,`,
        `VTK`,
      ].join("\n");

  const card = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border:1px solid ${MAIL_COLOR.line};border-radius:18px;overflow:hidden"><tr>${mailDateStub(
    { date: input.startsAt, locale: isNl ? "nl" : "en" },
  )}<td valign="middle" style="padding:18px 20px;font-family:${MAIL_FONT}"><div style="font-size:12px;font-weight:600;color:${MAIL_COLOR.muted}">${isNl ? "Pianoreservatie" : "Piano booking"}</div><div style="margin:4px 0 6px;font-size:18px;font-weight:650;letter-spacing:-.02em;color:${MAIL_COLOR.ink}">${isNl ? "Lokaal 01.52 (Kasteel Arenberg)" : "Room 01.52 (Arenberg Castle)"}</div><div style="font-size:13px;line-height:1.5;color:${MAIL_COLOR.body}"><strong>${escapeHtml(
    dateStr,
  )}</strong><br>${isNl ? "Tijdstip:" : "Time:"} <strong>${escapeHtml(
    timeStr,
  )}</strong></div><div style="margin-top:10px">${mailPill(isNl ? "Geldig bewijs" : "Valid proof", "yellow")}</div></td></tr></table>`;

  const html = mailDocument({
    lang: isNl ? "nl" : "en",
    title: subject,
    rows: `${mailHeaderRow({ kicker: "VTK Piano" })}${mailContentRow(
      `${mailHeading(isNl ? "Pianoreservatie bevestigd" : "Piano booking confirmed")}${mailParagraph(
        isNl ? `Dag ${input.name},` : `Hi ${input.name},`,
      )}${mailParagraph(
        isNl
          ? "Je reservatie voor de piano in lokaal 01.52 van het kasteel Arenberg is bevestigd:"
          : "Your reservation for the piano in room 01.52 of Arenberg castle has been confirmed:",
      )}${card}${mailNoticeBox(
        isNl
          ? "Hou deze bevestigingsmail bij tijdens het spelen: de bewaking van het kasteel kan ernaar vragen als bewijs van reservatie."
          : "Please keep this confirmation email with you while playing: castle security may ask for it as proof of booking.",
        isNl ? "Toegangsbewijs" : "Proof of booking",
      )}<div style="margin:22px 0 10px">${mailButton(
        "https://vtk.be/cultuur/piano",
        isNl ? "Bekijk pianokalender" : "View piano schedule",
      )}</div>`,
    )}${mailFooterRow(
      isNl
        ? "VTK Cultuur · Lokaal 01.52 Kasteel Arenberg · vtk.be"
        : "VTK Culture · Room 01.52 Arenberg Castle · vtk.be",
    )}`,
  });

  return { subject, text, html };
}

export async function reservePianoSlot(
  userId: string,
  startsAt: Date,
  now: Date = new Date(),
): Promise<{ startsAt: Date; endsAt: Date }> {
  if (Number.isNaN(startsAt.getTime())) throw new PianoReservationError("NOT_FOUND");

  const config = await getPianoConfig();
  const { windows, closures } = await getPianoRules();

  const slot = findPianoSlot(windows, closures, startsAt, config.slotMinutes);
  if (!slot) throw new PianoReservationError("NOT_FOUND");
  if (startsAt.getTime() <= now.getTime()) throw new PianoReservationError("PAST");
  if (!isPianoSlotBookable(startsAt, now, config)) {
    throw new PianoReservationError("BEYOND_HORIZON");
  }

  // Weeklimiet: enkel slots die nog moeten komen tellen mee. Een slot dat al
  // gespeeld is, mag je week niet blokkeren.
  const week = pianoWeekRange(startsAt);

  try {
    const outcome = await withSerializableTransaction(async (tx) => {
      const thisWeek = await tx.pianoReservation.count({
        where: {
          userId,
          startsAt: { gte: week.from, lt: week.to },
          endsAt: { gt: now },
        },
      });
      if (thisWeek >= config.maxPerWeek) return "WEEK_LIMIT" as const;

      await tx.pianoReservation.create({
        data: { userId, startsAt: slot.startsAt, endsAt: slot.endsAt },
      });
      return "OK" as const;
    });
    if (outcome === "WEEK_LIMIT") throw new PianoReservationError("WEEK_LIMIT");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PianoReservationError("TAKEN");
    }
    throw error;
  }

  revalidatePiano();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, name: true, locale: true },
    });
    if (user?.email) {
      const mail = pianoConfirmationMail({
        name: user.firstName || user.name || "student",
        locale: user.locale === "EN" ? "EN" : "NL",
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      await sendMail({ to: user.email, ...mail }, { source: "website", throwOnError: false });
    }
  } catch {
    // Een mislukte mail mag de reservatie zelf nooit blokkeren.
  }

  return slot;
}

/**
 * Annuleert een eigen reservatie. Een slot dat al begonnen is, blijft staan: dat
 * uur is voorbij en teruggeven verandert daar niets aan.
 *
 * Geeft geen fout wanneer er niets te wissen viel; het resultaat is dan wat de
 * gebruiker wou, en het onderscheid zou verklappen of een id van iemand anders is.
 */
export async function cancelPianoReservation(userId: string, id: string): Promise<void> {
  await prisma.pianoReservation.deleteMany({
    where: { id, userId, startsAt: { gt: new Date() } },
  });
  revalidatePiano();
}
