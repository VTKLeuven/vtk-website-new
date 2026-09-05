import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';
import { mayUseTestLogin, testLoginMode } from './test-login-gate';
import {
  TEST_USER_COOKIE,
  buildTestSession,
  isTestUserKey,
  testPersonaName,
  type TestUserKey,
} from './test-users';

/**
 * Wie je écht bent, los van welk test-profiel je speelt.
 *
 * In `cache()`: de poort hieronder heeft deze sessie nodig bij elke
 * `getSession()`, en zonder dit belde één pagina er meerdere keren voor naar de
 * hoofdsite.
 */
export const getRealSession = cache(
  async (): Promise<SessionPayload | null> => fetchSession(await headers())
);

/**
 * Het test-profiel dat deze aanvraag mag spelen, of null.
 *
 * De controle staat hier en niet enkel op de picker: `/test-login` verbergen
 * belet niemand om de server action rechtstreeks aan te roepen, en die zet de
 * cookie. De cookie wordt daarom bij élke aanvraag opnieuw getoetst aan de
 * échte sessie. Wie zijn beheerrechten verliest, valt zo vanzelf terug op
 * zichzelf in plaats van vast te blijven zitten in een profiel.
 */
async function activeTestUser(): Promise<TestUserKey | null> {
  const mode = testLoginMode();
  if (mode === 'off') return null;
  const key = (await cookies()).get(TEST_USER_COOKIE)?.value;
  if (!isTestUserKey(key)) return null;
  const real = await getRealSession();
  if (!mayUseTestLogin(mode, real ? { canManage: canManage(real) } : null)) return null;
  return key;
}

/** Sessie of null; voor pagina's die zelf een login-uitnodiging tonen. */
export async function getSession(): Promise<SessionPayload | null> {
  // Speel je een test-profiel, dan doet de hele app alsof je die persoon bent.
  // Zonder (geldige) cookie is dat gewoon je echte sessie, zodat de normale
  // website-login ernaast blijft werken. Zie lib/test-users.ts.
  const key = await activeTestUser();
  if (key) return buildTestSession(key);
  return getRealSession();
}

/**
 * Mag je hier van test-gebruiker wisselen?
 *
 * Voor de picker en voor de plekken die ernaar linken: een menu-item dat 404
 * geeft, is erger dan geen menu-item.
 */
export async function canUseTestLogin(): Promise<boolean> {
  const mode = testLoginMode();
  if (mode === 'off') return false;
  const real = await getRealSession();
  return mayUseTestLogin(mode, real ? { canManage: canManage(real) } : null);
}

/**
 * Speel je iemand anders? Dan wie, en wie ben je zelf.
 *
 * Waarvoor dit bestaat: zonder dit stond nergens op het scherm dát je iemand
 * anders bent, en was terugkeren naar jezelf eerst `/test-login` terugvinden.
 * `real` mag null zijn in de ongegrendelde stand, waar er geen echte login is.
 */
export async function getImpersonation(): Promise<{
  real: SessionPayload | null;
  personaKey: TestUserKey;
  personaName: string;
} | null> {
  const key = await activeTestUser();
  if (!key) return null;
  return { real: await getRealSession(), personaKey: key, personaName: testPersonaName(key) };
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
