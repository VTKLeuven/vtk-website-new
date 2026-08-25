import { apiFetch, ApiError, baseUrl } from '../api/client';
import { clearCache } from '../storage';
import type { AppViewer } from '../api/contract';

/**
 * Inloggen, en de twee poorten die daarna nog komen.
 *
 * De app houdt geen token bij. De weblogin in de WebView zet het better-auth
 * sessiecookie in de cookie-opslag van het toestel, en `fetch` deelt die opslag;
 * "ben ik ingelogd" is dus altijd een vraag aan de server en nooit een vlag die
 * uit de pas kan lopen. De sessie leeft dertig dagen.
 *
 * Na het inloggen kunnen er nog twee schermen tussen zitten, en dat is het stuk
 * dat de scanner niet had: `proxy.ts` op de website stuurt een lid zonder
 * afgewerkt profiel naar `/onboarding` en een lid dat zijn studie nog niet
 * bevestigde naar `/studie-bevestigen`. Die gate staat op pagina's en niet op
 * `/api`, dus de app ziet er niets van tenzij ze er zelf naar kijkt. Doen we dat
 * niet, dan zit een nieuw lid in een app die overal leeg blijft zonder te zeggen
 * waarom.
 */

/** Waar de WebView na het inloggen op uitkomt. Kort, en van ons. */
const LOGIN_LANDING = '/account';

export function loginUrl(): string {
  return `${baseUrl()}/inloggen?next=${encodeURIComponent(LOGIN_LANDING)}`;
}

/**
 * De URL waaraan we zien dat de login klaar is.
 *
 * De weblogin stuurt na afloop door naar `next`, maar de gate in `proxy.ts` kan
 * daar nog voor gaan staan. Zowel de landing als de twee gate-pagina's tellen
 * dus als "de login zelf is gelukt"; wat er daarna nog moet gebeuren, leest de
 * app uit `bootstrap`.
 */
export function isLoginDoneUrl(url: string): boolean {
  const path = pathOf(url);
  return /^\/(?:nl\/|en\/)?(?:account|onboarding|studie-bevestigen)(?:\/|\?|$)/.test(path);
}

/** Waar de WebView heen moet wanneer er nog een poort openstaat. */
export function gateUrl(gate: 'onboarding' | 'studie-bevestigen'): string {
  return `${baseUrl()}/${gate}`;
}

/** Die poort is dicht zodra de website je ergens anders naartoe laat gaan. */
export function isGateDoneUrl(url: string, gate: 'onboarding' | 'studie-bevestigen'): boolean {
  const path = pathOf(url);
  return !new RegExp(`^/(?:nl/|en/)?${gate}(?:/|\\?|$)`).test(path);
}

function pathOf(url: string): string {
  const withoutBase = url.startsWith(baseUrl()) ? url.slice(baseUrl().length) : url;
  return withoutBase.startsWith('/') ? withoutBase : `/${withoutBase}`;
}

/**
 * Uitloggen op de server; het cookie verdwijnt daarmee ook uit de WebView. De
 * leescache gaat mee weg, want die hoort bij het account dat net vertrok.
 */
export async function signOut(): Promise<void> {
  try {
    await apiFetch('/api/auth/better/sign-out', { method: 'POST', body: {} });
  } catch (error) {
    // Al uitgelogd of geen netwerk: het scherm hierna vertelt de waarheid.
    if (!(error instanceof ApiError)) console.warn('Uitloggen mislukte', error);
  }
  clearCache();
}

/** Welke poort er nu openstaat, of `null` wanneer alles in orde is. */
export function pendingGate(viewer: AppViewer | null): 'onboarding' | 'studie-bevestigen' | null {
  if (!viewer) return null;
  if (viewer.needsOnboarding) return 'onboarding';
  if (viewer.needsStudyConfirmation) return 'studie-bevestigen';
  return null;
}
