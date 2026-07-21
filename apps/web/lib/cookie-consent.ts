export const COOKIE_CONSENT_NAME = "vtk_cookie_consent";
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
export const COOKIE_CONSENT_EVENT = "vtk:cookie-consent-changed";
export const OPEN_COOKIE_PREFERENCES_EVENT = "vtk:open-cookie-preferences";

export type CookieConsentChoice = "essential" | "analytics";

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
