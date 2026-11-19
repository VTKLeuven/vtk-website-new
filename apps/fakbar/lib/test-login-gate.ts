/**
 * Wie mag er van test-gebruiker wisselen?
 *
 * Dezelfde regel als de uitleendienst (`apps/logistiek/lib/test-login-gate.ts`).
 * Tot nu toe kende de Fakbar enkel aan of uit, en "aan" liet iedereen die de
 * cookie zette de persona `it` spelen: superadmin, zonder wachtwoord, op de
 * gedeelde database. `.env.example` noemde het toch "zelfde principe" als de
 * uitleendienst, waar `true` enkel beheerders doorlaat. Nu betekent `true` hier
 * ook dat.
 *
 * Puur en zonder `server-only`, zodat de regel zelf te testen valt.
 */

export type TestLoginMode =
  /** Uit: `/test-login` bestaat niet en de cookie wordt genegeerd. */
  | 'off'
  /** Ongegrendeld: iedereen mag een profiel kiezen. Enkel voor een laptop. */
  | 'open'
  /** Enkel wie de fakbar mag beheren (of superadmin is) mag wisselen. */
  | 'gated';

/**
 * De stand uit de env-variabele van deze server. Geen `NODE_ENV`-grendel: de
 * container draait altijd een productie-build, ook op dev.
 */
export function testLoginMode(env: Record<string, string | undefined> = process.env): TestLoginMode {
  if (env.FAKBAR_TEST_LOGIN === 'open') return 'open';
  if (env.FAKBAR_TEST_LOGIN === 'true') return 'gated';
  return 'off';
}

/**
 * `real` is de échte sessie, nooit het gespeelde profiel: anders tilt wie
 * eenmaal binnen is zichzelf in het volgende profiel.
 */
export function mayUseTestLogin(mode: TestLoginMode, real: { canManage: boolean } | null): boolean {
  if (mode === 'off') return false;
  if (mode === 'open') return true;
  return real?.canManage === true;
}
