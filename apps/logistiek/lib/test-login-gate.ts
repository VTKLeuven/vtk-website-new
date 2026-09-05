/**
 * Wie mag er van test-gebruiker wisselen?
 *
 * Puur en zonder `server-only`, los van `lib/test-users.ts`: dat bestand trekt
 * Prisma mee en past dus niet in een unit test, terwijl juist deze regel er een
 * verdient. Ze bepaalt wie superadmin kan worden zonder wachtwoord.
 */

export type TestLoginMode =
  /** Uit: `/test-login` bestaat niet en de cookie wordt genegeerd. */
  | 'off'
  /** Ongegrendeld: iedereen mag een profiel kiezen. Enkel voor een laptop. */
  | 'open'
  /** Enkel wie logistiek mag beheren (IT of Logistiek) mag wisselen. */
  | 'gated';

/**
 * De stand van de test-login.
 *
 * **In productie altijd uit**, ongeacht de env-variabele. Die grendel stond tot
 * nu enkel in `docs/logistiek-ingebruikname.md` beschreven en niet in de code,
 * terwijl datzelfde document vaststelde dat de vlag op de productieserver op
 * `true` stond. Een vergeten regel in een `.env` hoort geen superadmin-picker
 * open te zetten.
 *
 * `open` bestaat voor een laptop waar `vtk.be` niet draait: daar ís er geen
 * echte login om op te gaten, en zonder deze stand kan je lokaal niet meer
 * inloggen. Op een gedeelde testomgeving (dev.vtk.be) hoort `true` te staan.
 */
export function testLoginMode(
  env: { NODE_ENV?: string; LOGISTIEK_TEST_LOGIN?: string } = process.env
): TestLoginMode {
  if (env.NODE_ENV === 'production') return 'off';
  if (env.LOGISTIEK_TEST_LOGIN === 'open') return 'open';
  if (env.LOGISTIEK_TEST_LOGIN === 'true') return 'gated';
  return 'off';
}

/**
 * Mag deze persoon een profiel spelen?
 *
 * `real` is de **echte** sessie, nooit het gespeelde profiel: anders zou wie
 * eenmaal binnen is zichzelf in het volgende profiel kunnen tillen, en dan is de
 * poort een deur die van binnenuit opengaat.
 *
 * De grens is dezelfde als die van het beheer (`canManage`, waarin de
 * superadmin-bypass al zit): Logistiek heeft `logistiek.manage`, IT is
 * superadmin. Geen tweede lijst van postcodes ernaast, want die twee zouden uit
 * elkaar lopen zodra er een post bijkomt.
 */
export function mayUseTestLogin(
  mode: TestLoginMode,
  real: { canManage: boolean } | null
): boolean {
  if (mode === 'off') return false;
  if (mode === 'open') return true;
  return real?.canManage === true;
}
