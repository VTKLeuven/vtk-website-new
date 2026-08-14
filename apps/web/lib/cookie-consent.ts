export const COOKIE_CONSENT_NAME = "vtk_cookie_consent";
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const COOKIE_CONSENT_EVENT = "vtk:cookie-consent-changed";
export const OPEN_COOKIE_PREFERENCES_EVENT = "vtk:open-cookie-preferences";

export type CookieConsentChoice = "essential" | "analytics";

/**
 * Paden waar de cookiebanner niet getoond wordt. De linkpagina staat in onze
 * social-media-bio's en is precies één scherm hoog: de banner dekte daar de
 * volledige inhoud af, zodat een bezoeker eerst iets moest wegklikken voor hij
 * ook maar één link zag.
 *
 * Niet vragen mag, zolang er ook niets gebeurt. Zonder keuze blijft de
 * consent-cookie leeg, en zowel Umami (`lib/analytics.ts`) als Sentry
 * (`instrumentation-client.ts`) starten enkel na een expliciete
 * "analytics"-keuze. Wie die elders op de site al maakte, wordt hier dus wel
 * gemeten; wie ze nog niet maakte krijgt de vraag zodra hij op de gewone site
 * komt. Zet hier dus nooit een pagina bij die zelf niet-noodzakelijke cookies
 * plaatst.
 */
export const COOKIE_BANNER_HIDDEN_PATHS = ["/links"] as const;

/**
 * De locales staan hier letterlijk en niet via `@vtk/i18n`: dit bestand wordt
 * door `instrumentation-client.ts` geladen voor de hydratie, en dat is geen
 * plek om de vertalingen voor binnen te trekken. `/links` bestaat sowieso enkel
 * zonder taalvoorvoegsel (zie proxy.ts); dit is verdediging tegen later.
 */
export function hidesCookieBanner(pathname: string | null | undefined): boolean {
  const raw = (pathname || "/").split("?")[0].split("#")[0];
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
  const withoutLocale = normalized.replace(/^\/(?:nl|en)(?=\/|$)/, "") || "/";
  return COOKIE_BANNER_HIDDEN_PATHS.some((hidden) => withoutLocale === hidden);
}

export function parseCookieConsent(value: string | null | undefined): CookieConsentChoice | null {
  return value === "essential" || value === "analytics" ? value : null;
}

export function browserCookieConsent(): CookieConsentChoice | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_CONSENT_NAME}=`))
    ?.slice(COOKIE_CONSENT_NAME.length + 1);
  return parseCookieConsent(raw ? decodeURIComponent(raw) : null);
}

export function analyticsConsentGranted(): boolean {
  return browserCookieConsent() === "analytics";
}
