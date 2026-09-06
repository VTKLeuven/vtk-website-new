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
 * De stand van de test-login, uit de env-variabele van díé server.
 *
 * **Geen `NODE_ENV`-grendel, en dat is met opzet.** `docs/logistiek-ingebruikname.md`
 * beweerde jarenlang dat die er was; toen ze er echt kwam, viel de test-login uit
 * op de testomgeving zelf. De reden: `infra/docker-compose.yml` zet
 * `NODE_ENV: production` op de logistiek-container, want het is een
 * productie-build. Test (`logistiek.dev.vtk.be`) en productie
 * (`logistiek.vtk.be`) draaien dezelfde build; `NODE_ENV` staat daar dus even
 * hard op `production` en kan de twee onmogelijk uit elkaar houden.
 *
 * Wat ze wél uit elkaar houdt, is de `.env` van elke host. Die is dus de schakelaar,
 * en de échte bescherming is `mayUseTestLogin`: zelfs een vergeten `true` op
 * productie laat enkel nog IT en Logistiek door in plaats van iedereen die de
 * URL kent.
 *
 * `open` bestaat voor een laptop waar `vtk.be` niet draait: daar ís er geen
 * echte login om op te gaten, en zonder deze stand kan je lokaal niet meer
 * inloggen. Op een gedeelde testomgeving (dev.vtk.be) hoort `true` te staan, op
 * productie niets.
 */
export function testLoginMode(
  // `Record` en geen `{ LOGISTIEK_TEST_LOGIN?: string }`: dat laatste is een
  // "weak type", en dan weigert TypeScript `process.env` als standaardwaarde.
  env: Record<string, string | undefined> = process.env
): TestLoginMode {
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
