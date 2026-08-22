import { cookies, headers } from 'next/headers';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';
import { TEST_USER_COOKIE, buildTestSession, isTestUserKey, testLoginEnabled } from './test-users';

/** Sessie of null; voor pagina's die zelf een login-uitnodiging tonen. */
export async function getSession(): Promise<SessionPayload | null> {
  // Test-login (enkel als de env-toggle aan staat): als er een geldige
  // test-gebruiker-cookie is, doen we alsof die persoon is ingelogd. Zonder
  // cookie vallen we terug op de echte sessie, zodat de gewone website-login
  // naast de test-login blijft werken. Zie lib/test-users.ts.
  if (testLoginEnabled()) {
    const key = (await cookies()).get(TEST_USER_COOKIE)?.value;
    if (isTestUserKey(key)) return buildTestSession(key);
  }
  return fetchSession(await headers());
}

/**
 * Vraagt dit lid aan als externe? Dat is zo zodra het bij geen enkele groep
 * hoort; `deriveMemberRequester` in app/actions/uitleen.ts volgt dezelfde regel
 * bij het indienen.
 *
 * Een externe krijgt geen evenementen en geen sjablonen te zien (B3): hij kan er
 * toch niet aan koppelen, en de namen van de evenementen zijn werking van de
 * kring die niet bij een buitenstaander hoeft te belanden. Daarom valt die keuze
 * op de server, en worden ze niet enkel verborgen in het formulier.
 */
export function requestsAsExternal(session: { groups: Array<unknown> }): boolean {
  return session.groups.length === 0;
}

/** Elk ingelogd vtk.be-lid mag de uitleendienst gebruiken. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) {
    throw new Error('UNAUTHENTICATED');
  }
  return session;
}

/** hasPermission bevat de superadmin-bypass al. */
export function canManage(session: SessionPayload): boolean {
  return hasPermission(session, 'logistiek.manage');
}

/** Beheer (inventaris, aanvragen, vervoer) vraagt logistiek.manage. */
export async function requireManage(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!canManage(session)) {
    throw new Error('FORBIDDEN');
  }
  return session;
}
