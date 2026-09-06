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
      const isNl = user.locale !== "EN";
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
      const dateStr = dayFmt.format(slot.startsAt);
      const timeStr = `${timeFmt.format(slot.startsAt)} - ${timeFmt.format(slot.endsAt)}`;
      const name = user.firstName || user.name || "student";
      const subject = isNl
        ? `Bevestiging reservatie piano: ${dateStr}`
        : `Piano booking confirmation: ${dateStr}`;
      const text = isNl
        ? [
            `Dag ${name},`,
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
            `Hi ${name},`,
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

      await sendMail(
        { to: user.email, subject, text },
        { source: "website", throwOnError: false },
      );
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
