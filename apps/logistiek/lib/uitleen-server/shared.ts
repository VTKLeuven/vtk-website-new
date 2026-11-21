/**
 * Wat de queries van de uitleendienst onder elkaar delen (T1 uit de audit van
 * november 2026).
 */

import 'server-only';
import { prisma } from '@vtk/db';
import { currentWorkingYear, workingYearOf } from '@vtk/auth';

/** Van het jongste werkingsjaar tot het oudste, het lopende altijd erbij. */
export function yearsBetween(first: Date | undefined, last: Date | undefined): number[] {
  const now = currentWorkingYear();
  const from = Math.min(first ? workingYearOf(first) : now, now);
  const to = Math.max(last ? workingYearOf(last) : now, now);
  const years: number[] = [];
  for (let year = to; year >= from; year--) years.push(year);
  return years;
}

/**
 * Historiek, oudste eerst. Enkel op een detailpagina opgehaald: in de lijst van
 * tweehonderd aanvragen zou dit per rij een extra query kosten voor iets dat
 * daar toch niet getoond wordt.
 */
export const auditLogInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: { actor: { select: { name: true } } },
};

/** De grenzen van een werkingsjaar: 15 juli, middernacht op de Brusselse klok. */
export function workingYearBounds(year: number): { from: Date; to: Date } {
  // 15 juli valt altijd in de zomertijd (UTC+2), dus 22:00 UTC de dag ervoor.
  return { from: new Date(Date.UTC(year, 6, 14, 22)), to: new Date(Date.UTC(year + 1, 6, 14, 22)) };
}

/** Leden van de post Logistiek dit werkingsjaar. */
export async function logistiekTeamMembers() {
  return prisma.user.findMany({
    where: {
      active: true,
      deletedAt: null,
      memberships: { some: { group: { code: 'LOGISTIEK' }, year: currentWorkingYear() } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
}
