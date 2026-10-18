import { localDateTimeToUtc } from "@/lib/ticketing/time";

/**
 * Wanneer de herinneringsmail vertrekt voor een evenement waarin een lid
 * interesse aanduidde.
 *
 * Puur, zonder database en zonder mail, zodat de regels te testen zijn. Het
 * versturen staat in `interestReminderMailer.ts`, het bericht in
 * `interestReminderMail.ts`, de kringkeuze in docs/design-decisions.md.
 *
 * - **De dag ervoor om 12u**, Brusselse tijd. Dat is een uur waarop je nog iets
 *   kan regelen (een ticket, je avond vrijhouden, met iemand afspreken) en
 *   waarop je de mail ook leest; om middernacht verdwijnt hij onder de rest.
 * - **De dag van het moment, niet van het evenement.** Wie bij een loopweek
 *   enkel donderdag aanduidde, krijgt woensdag zijn mail en niet maandag.
 * - **Wie pas na 12u interesse aanduidt, krijgt geen herinnering meer.** Die
 *   heeft net zelf beslist; een mail vijf minuten later is geen herinnering.
 * - **Gemist is gemist zodra het begint.** Lag de worker plat, dan vertrekt de
 *   mail nog later die dag of 's ochtends, maar nooit meer voor iets dat al
 *   bezig is.
 */

export const INTEREST_REMINDER_TIME_ZONE = "Europe/Brussels";

/** Het uur (Brussel) waarop de herinnering de dag ervoor vertrekt. */
export const INTEREST_REMINDER_HOUR = 12;

/** "2026-11-14": de kalenderdag van dit moment in Brussel. */
function brusselsDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INTEREST_REMINDER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function previousDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Wanneer de mail vertrekt voor iets dat op `start` begint. */
export function interestReminderSendAt(start: Date): Date {
  const hour = String(INTEREST_REMINDER_HOUR).padStart(2, "0");
  return localDateTimeToUtc(`${previousDay(brusselsDay(start))}T${hour}:00`, INTEREST_REMINDER_TIME_ZONE);
}

export type InterestReminderCandidate = {
  /** Het begin van het moment, of van het evenement zonder momenten. */
  start: Date;
  /** Wanneer het lid interesse aanduidde. */
  createdAt: Date;
};

/** Hoort deze herinnering nu te vertrekken? */
export function interestReminderDue(candidate: InterestReminderCandidate, now: Date): boolean {
  const sendAt = interestReminderSendAt(candidate.start);
  if (now.getTime() < sendAt.getTime()) return false;
  if (now.getTime() >= candidate.start.getTime()) return false;
  return candidate.createdAt.getTime() < sendAt.getTime();
}

/**
 * Hoe ver vooruit de worker hoogstens kijkt. Een evenement van morgen om 23u59
 * valt om 12u vandaag binnen 36 uur; ruimer zoeken levert enkel kandidaten op
 * die `interestReminderDue` toch weer weggooit.
 */
export const INTEREST_REMINDER_HORIZON_MS = 36 * 60 * 60 * 1000;
