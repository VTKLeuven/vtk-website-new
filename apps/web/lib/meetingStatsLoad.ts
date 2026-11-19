import 'server-only';
import { prisma } from '@vtk/db';
import type { StatsMeeting } from './meetingStats';

/**
 * De bureaus van één werkingsjaar (`Meeting.year`, vanaf 15 juli) met wie er nu
 * ingeschreven is, voor de tab Statistieken. Hier ligt de grens van het jaar:
 * de rekenkant in `meetingStats.ts` telt "terugkerend" binnen de lijst die ze
 * krijgt, dus wie vorig jaar kwam, is bij zijn eerste bureau van dit jaar
 * nieuw. Enkel `ACTIVE`, zoals "Ingeschreven" op de tab Beheer.
 */
export async function loadBureauStatsMeetings(workingYear: number): Promise<StatsMeeting[]> {
  return prisma.meeting.findMany({
    where: { kind: 'BUREAU', year: workingYear },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      startsAt: true,
      opensAt: true,
      location: true,
      reservations: {
        where: { status: 'ACTIVE' },
        select: { userId: true, createdAt: true, source: true, sourceCampaign: true },
      },
    },
  });
}
