import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { hasPermission, type SessionPayload } from '@vtk/auth';
import { fetchSession } from '@vtk/auth/remote';
import { FORBIDDEN_DIGEST, SIGNED_OUT_DIGEST, recognizableActionError } from '@vtk/ui/action-errors';
import { mayUseTestLogin, testLoginMode } from './test-login-gate';
import {
  TEST_USER_COOKIE,
  buildTestSession,
  isTestUserKey,
  testPersonaName,
  type TestUserKey,
} from './test-users';

/** Wie je écht bent, los van een test-profiel; in `cache()`, één vraag aan vtk.be per request. */
export const getRealSession = cache(
  async (): Promise<SessionPayload | null> => fetchSession(await headers())
);

/**
 * Het test-profiel dat deze aanvraag mag spelen, of null. De cookie wordt bij
 * elke aanvraag opnieuw aan de échte sessie getoetst, niet enkel op de picker:
 * de server action die haar zet, kan iedereen rechtstreeks aanroepen.
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
  // Met een geldig test-profiel doet de hele app alsof je die persoon bent;
  // anders je echte sessie. Zie lib/test-users.ts.
  const key = await activeTestUser();
  if (key) return buildTestSession(key);
  return getRealSession();
}

/** Mag je hier van test-gebruiker wisselen? Ook voor wie ernaar linkt: liever geen link dan een 404. */
export async function canUseTestLogin(): Promise<boolean> {
  const mode = testLoginMode();
  if (mode === 'off') return false;
  const real = await getRealSession();
  return mayUseTestLogin(mode, real ? { canManage: canManage(real) } : null);
}

/**
 * Speel je iemand anders? Dan wie, en wie ben je zelf (voor de banner bovenaan).
 * `real` is null in de ongegrendelde stand, zonder echte login.
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
 * Vraagt dit lid aan als externe, omdat het bij geen enkele groep hoort? Dezelfde
 * regel als `deriveMemberRequester`. Een externe krijgt geen evenementen of
 * sjablonen te zien (B3), en dat beslist de server, niet enkel het formulier.
 */
export function requestsAsExternal(session: { groups: Array<unknown> }): boolean {
  return session.groups.length === 0;
}

/**
 * Mag deze persoon nu niets indienen? Een externe niet, zolang
 * `externalRequestsOpen` op /beheer/instellingen uit staat; externe aanvragen
 * lopen dan per mail. Kijken naar de catalogus en de voertuigen mag wel.
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
    // Met een digest die de client herkent: een rode melding en het formulier
    // blijft ingevuld, in plaats van de foutpagina (R1, `@vtk/ui/action-errors`).
    throw recognizableActionError(SIGNED_OUT_DIGEST);
  }
  return session;
}

/** hasPermission bevat de superadmin-bypass al. */
export function canManage(session: SessionPayload): boolean {
  return hasPermission(session, 'logistiek.manage');
}

/**
 * Mag deze persoon zien wát een rit is, en niet enkel dát het voertuig bezet is?
 *
 * Wie in een praesidiumpost, werkgroep of jaarwerking zit, het team
 * (`canManage`, met de superadmin-bypass) en wie `logistiek.helpers` heeft, want
 * die moet weten over welke rit het gaat. Een lid zonder groep ziet enkel het
 * raster met titel en chauffeur. Ook met deze laag laat
 * `transportWeekForPraesidium` telefoonnummers, ophaaladres en nota's weg; enkel
 * `transportRange` (het team) toont ze.
 */
export function canSeeTripDetails(session: SessionPayload): boolean {
  return (
    canManage(session) ||
    hasPermission(session, 'logistiek.helpers') ||
    session.groups.some(
      (group) =>
        group.type === 'PRAESIDIUM' || group.type === 'WERKGROEP' || group.type === 'JAARWERKING'
    )
  );
}

/** Beheer (inventaris, aanvragen, vervoer) vraagt logistiek.manage. */
export async function requireManage(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!canManage(session)) {
    throw recognizableActionError(FORBIDDEN_DIGEST);
  }
  return session;
}

/** Zit deze persoon dit werkingsjaar in een praesidiumpost? Een werkgroep of jaarwerking telt niet mee. */
export function isPraesidiumMember(session: Pick<SessionPayload, 'groups'>): boolean {
  return session.groups.some((group) => group.type === 'PRAESIDIUM');
}

/**
 * Mag deze persoon bij élke rit een bijrijder toevoegen (F6.24)? Elk
 * praesidiumlid, plus `canEditAllHelpers`. Weghalen mag enkel bij de eigen
 * toevoegingen (`removeTripHelperAction`).
 */
export function canAddHelpersEverywhere(session: SessionPayload): boolean {
  return canEditAllHelpers(session) || isPraesidiumMember(session);
}

/**
 * Mag deze persoon de bijrijders van élke rit aanpassen? Het team, en wie
 * `logistiek.helpers` heeft: hetzelfde recht zonder de rest van het beheer, in
 * het ritkaartje op /vervoer/bezetting. Zie docs/design-decisions.md.
 */
export function canEditAllHelpers(session: SessionPayload): boolean {
  return canManage(session) || hasPermission(session, 'logistiek.helpers');
}
