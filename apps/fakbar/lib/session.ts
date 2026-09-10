import { headers, cookies } from 'next/headers';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';
import { TEST_USER_COOKIE, buildTestSession, isTestUserKey, testLoginEnabled } from './test-users';

export async function getSession(): Promise<SessionPayload | null> {
  if (testLoginEnabled()) {
    const key = (await cookies()).get(TEST_USER_COOKIE)?.value;
    if (isTestUserKey(key)) return buildTestSession(key);
  }
  return fetchSession(await headers());
}

/**
 * Mag deze gebruiker de fakbar beheren?
 *
 * Eén centrale permissie (`fakbar.manage`) voor het hele beheer van de site, en
 * geen groepslidmaatschap van de post FAKBAR: zo is het op de rollenpagina van
 * vtk.be aan een rol te hangen en af te nemen zonder iemand uit zijn post te
 * zetten. Zelfde patroon als `logistiek.manage` in de uitleendienst.
 * `hasPermission` bevat de superadmin-bypass al.
 */
export function canManageFakbar(session: SessionPayload): boolean {
  return hasPermission(session, 'fakbar.manage');
}
