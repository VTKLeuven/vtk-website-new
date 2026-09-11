import type { ShiftRosterEntry } from '@/lib/shift';

/**
 * Wat een shiftlijst per deelnemer ophaalt om te tonen wie er al ingeschreven
 * is. Enkel de naam: geen e-mail, geen r-nummer en ook geen profielfoto, want
 * "Mijn account" belooft dat die foto enkel op de praesidium- en POC-pagina
 * verschijnt.
 */
export const ROSTER_PARTICIPANT_SELECT = {
  userId: true,
  registeredAt: true,
  user: { select: { name: true } },
} as const;

type RosterParticipant = {
  userId: string;
  registeredAt: Date;
  user: { name: string };
};

/**
 * Zet de deelnemers van een shift om naar de lijst op `/shift`: in de volgorde
 * waarin ze zich inschreven, met `isSelf` voor wie kijkt.
 *
 * Gewiste accounts staan er nooit tussen: `eraseUserData` verwijdert hun
 * inschrijvingen, dus de lijst en de teller van bezette plaatsen lopen gelijk.
 */
export function toRoster(participants: RosterParticipant[], viewerId: string): ShiftRosterEntry[] {
  return [...participants]
    .sort((a, b) => a.registeredAt.getTime() - b.registeredAt.getTime())
    .map((participant) => ({
      name: participant.user.name,
      isSelf: participant.userId === viewerId,
    }));
}
