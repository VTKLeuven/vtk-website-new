import 'server-only';

import type { UitleenFeedScope } from '@prisma/client';
import { userHasPermission } from '@vtk/auth/grants';
import { driverStatus, showsMyTrips } from '../uitleen-server';
import { myGroupIds } from './transport-feed';

/**
 * Mag de eigenaar van een feed hem nu nog lezen?
 *
 * Bij het aanmaken toetst `createFeedTokenAction` dit al, maar dat is één
 * moment. Rechten resetten op 15 juli en een chauffeur kan uit de lijst
 * gehaald worden; het token zelf verandert niet. Zonder deze toets bleef een
 * teamfeed na het werkingsjaar de aanvrager, de nummers, de bijrijders en de
 * adressen van elke rit voor het komende jaar uitgeven. Dus bij elke poll:
 *
 * - `TEAM` vraagt `logistiek.manage`, met dezelfde regels als een sessie
 *   (`@vtk/auth/grants`, superadmin inbegrepen).
 * - `DRIVER` volgt de poort van `/ritten`: in de chauffeurspool, of nog een
 *   komende rit op je naam of op je post.
 *
 * Geen intrekking wanneer het niet meer mag: wie op 15 juli zijn rechten
 * verliest en er een dag later weer bij komt in de nieuwe ploeg, krijgt zijn
 * feed vanzelf terug. Tot dan antwoordt de route 404.
 */
export async function feedOwnerMayRead(scope: UitleenFeedScope, userId: string): Promise<boolean> {
  if (scope === 'TEAM') return userHasPermission(userId, 'logistiek.manage');
  return showsMyTrips(await driverStatus(userId, await myGroupIds(userId)));
}
