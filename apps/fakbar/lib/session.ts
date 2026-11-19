import { cache } from 'react';
import { headers, cookies } from 'next/headers';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';
import { mayUseTestLogin, testLoginMode } from './test-login-gate';
import { TEST_USER_COOKIE, buildTestSession, isTestUserKey, type TestUserKey } from './test-users';

/** Wie je écht bent, los van welk test-profiel je speelt. */
export const getRealSession = cache(
  async (): Promise<SessionPayload | null> => fetchSession(await headers())
);

/**
 * Het test-profiel dat deze aanvraag mag spelen, of null. De cookie wordt bij
 * élke aanvraag opnieuw getoetst aan de echte sessie: de server action die hem
 * zet, is een endpoint dat iedereen kan aanroepen, en wie zijn rechten verliest,
 * valt zo vanzelf terug op zichzelf.
 */
async function activeTestUser(): Promise<TestUserKey | null> {
  const mode = testLoginMode();
  if (mode === 'off') return null;
  const key = (await cookies()).get(TEST_USER_COOKIE)?.value;
  if (!isTestUserKey(key)) return null;
  if (mode === 'open') return key;
  const real = await getRealSession();
  if (!mayUseTestLogin(mode, real ? { canManage: canManageFakbar(real) } : null)) return null;
  return key;
}

export async function getSession(): Promise<SessionPayload | null> {
  const key = await activeTestUser();
  if (key) return buildTestSession(key);
  return getRealSession();
}

/** Mag je hier van test-gebruiker wisselen? Voor de picker en zijn server action. */
export async function canUseTestLogin(): Promise<boolean> {
  const mode = testLoginMode();
  if (mode === 'off') return false;
  if (mode === 'open') return true;
  const real = await getRealSession();
  return mayUseTestLogin(mode, real ? { canManage: canManageFakbar(real) } : null);
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
