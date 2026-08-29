import 'server-only';
import { prisma } from '@vtk/db';
import { currentWorkingYear } from '@vtk/auth';

export type Tapper = { id: string; name: string };

/**
 * De mensen die als hoofdtapper gekozen kunnen worden: de leden van de post
 * Fakbar in het lopende werkingsjaar.
 *
 * Bewust niet "alle gebruikers": dat is een keuzelijst van duizenden namen waar
 * je de juiste niet in vindt. Wie er in de loop van het jaar bijkomt, staat er
 * automatisch bij zodra het lidmaatschap in de VTK-admin ingevoerd is.
 *
 * Een avond die al een hoofdtapper heeft die intussen geen lid meer is, houdt
 * die naam: `withCurrent` zet ze terug in de lijst zodat het formulier niet
 * stilzwijgend iemand anders selecteert.
 */
export async function listTappers(withCurrent?: Tapper | null): Promise<Tapper[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { year: currentWorkingYear(), group: { code: 'FAKBAR' } },
    select: { user: { select: { id: true, name: true } } },
  });

  const tappers = memberships.map((membership) => membership.user);
  if (withCurrent && !tappers.some((tapper) => tapper.id === withCurrent.id)) {
    tappers.push(withCurrent);
  }
  return tappers.sort((a, b) => a.name.localeCompare(b.name, 'nl-BE'));
}
