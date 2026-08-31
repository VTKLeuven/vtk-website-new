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

/**
 * Mag deze persoon nu iets indienen?
 *
 * De uitleendienst is in het semester 2026-2027 in gebruik genomen bij de posten
 * en de werkgroepen; externe aanvragen lopen zolang nog per mail. Zonder deze
 * poort zou een externe student intussen indienen in een systeem waar niemand
 * naar kijkt, en dan staat zijn materiaal er niet.
 *
 * Kijken blijft wel toegestaan: de catalogus en de voertuigen zijn geen geheim,
 * en wie ziet wát er is, weet waarvoor hij mailt. `externalRequestsOpen` op
 * /beheer/instellingen zet het open.
 */
export function externalRequestsBlocked(
  session: { groups: Array<unknown> },
  settings: { externalRequestsOpen: boolean }
): boolean {
  return requestsAsExternal(session) && !settings.externalRequestsOpen;
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
