import 'server-only';

import { prisma } from '@vtk/db';
import { ROSTER_PARTICIPANT_SELECT, toRoster } from '@/lib/shift/roster';

/*
 * De twee lijsten op /shift. Eén bron voor de API-routes (`GET /api/shift` en
 * `GET /api/shift/register`) en voor de pagina, die ze al op de server meegeeft:
 * anders rendert /shift eerst een lege week en springt ze open zodra de fetch
 * binnenkomt.
 */

/**
 * De huidige shiften waarvoor `viewerId` zich kan registreren.
 *
 * Alle shiften worden doorgestuurd, ook als shift al volzet is. Enkel shiften
 * waar de user al voor geregistreerd is worden weggelaten.
 *
 * Per shift gaat `roster` mee: de namen van wie er al ingeschreven is. De
 * `participants` zelf, met hun user-id's, blijven op de server.
 */
export async function availableShifts(viewerId: string) {
  const now = new Date();
  const shifts = await prisma.shift.findMany({
    where: { endTime: { gte: now }, manualGrantId: null },
    orderBy: { startTime: 'asc' },
    include: { participants: { select: ROSTER_PARTICIPANT_SELECT } },
  });

  return shifts
    .map(({ participants, ...shift }) => {
      const takenSpots = participants.length;
      return {
        ...shift,
        takenSpots,
        availableSpots: Math.max(0, shift.maxParticipants - takenSpots),
        isRegistered: participants.some((p) => p.userId === viewerId),
        roster: toRoster(participants, viewerId),
      };
    })
    .filter((shift) => !shift.isRegistered);
}

/**
 * Alle huidige of toekomstige shiften waarvoor `targetUserId` geregistreerd is,
 * zoals `viewerId` ze ziet (die bepaalt `isSelf` in de roster).
 */
export async function registeredShifts(targetUserId: string, viewerId: string) {
  const now = new Date();
  const shifts = await prisma.shift.findMany({
    where: {
      endTime: { gte: now },
      participants: { some: { userId: targetUserId } },
    },
    orderBy: { startTime: 'asc' },
    include: { participants: { select: { ...ROSTER_PARTICIPANT_SELECT, payedOut: true } } },
  });

  // `registeredAt` van deze user apart meegeven: de tabel bepaalt daarmee of de
  // bedenktijd nog loopt en of de uitschrijfknop dus actief mag zijn. De namen
  // gaan enkel via `roster` mee, niet in `participants`.
  //
  // Als ISO-string en niet als `Date`: de API gaf altijd een string, en de
  // pagina geeft dit zonder JSON-omweg aan de browser door.
  return shifts.map(({ participants, ...shift }) => {
    const takenSpots = participants.length;
    return {
      ...shift,
      takenSpots,
      availableSpots: Math.max(0, shift.maxParticipants - takenSpots),
      participants: participants.map(({ userId, payedOut, registeredAt }) => ({
        userId,
        payedOut,
        registeredAt,
      })),
      registeredAt:
        participants
          .find((participant) => participant.userId === targetUserId)
          ?.registeredAt.toISOString() ?? null,
      roster: toRoster(participants, viewerId),
    };
  });
}
