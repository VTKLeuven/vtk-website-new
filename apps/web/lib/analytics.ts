import { LOCALES } from "@vtk/i18n";
import type { CookieConsentChoice } from "./cookie-consent";

/**
 * Bezoekersstatistieken met Umami, op onze eigen server (zie
 * infra/docker-compose.yml). Dit bestand bevat enkel de beslissing: staat het
 * script er, en met welke attributen. Geen React, geen `next/headers`, zodat
 * ze in een unittest te controleren is.
 *
 * Twee regels sturen alles:
 * 1. Het script laadt pas na een expliciete "analytics"-keuze in de
 *    cookiebanner (`lib/cookie-consent.ts`), net zoals Sentry dat doet in
 *    `instrumentation-client.ts`.
 * 2. Beheer- en bestelschermen worden niet gemeten. Dat gebeurt op twee
 *    plaatsen: de server rendert het script daar niet, en het script zelf
 *    krijgt een filter mee voor de navigaties die daarna nog in de browser
 *    gebeuren (App Router navigeert client-side, dus zonder die filter zou een
 *    klik van de homepage naar /admin alsnog een paginaweergave opleveren).
 */

/**
 * Paden die nooit gemeten worden, zonder taalvoorvoegsel. `/admin` en `/scan`
 * zijn intern; `/tickets/bestelling/<id>` draagt een bestelnummer in het pad en
 * dat is een persoonsgegeven, hoe cookieloos de meting verder ook is.
 */
export const ANALYTICS_EXCLUDED_PATHS = ["/admin", "/scan", "/tickets/bestelling"] as const;

/** Naam van de globale functie die Umami via `data-before-send` aanroept. */
export const ANALYTICS_BEFORE_SEND_FUNCTION = "__vtkAnalyticsFilter";

export type AnalyticsConfig = {
  /** Publieke URL van onze eigen Umami, zonder afsluitende slash. */
  url: string;
  /** Website-ID uit het Umami-dashboard. */
  websiteId: string;
};

export type AnalyticsScript = {
  src: string;
  websiteId: string;
  /** Waarde voor `data-before-send`: de naam van de globale filterfunctie. */
  beforeSend: string;
  /** Inline script dat die functie definieert, voor het tracker-script laadt. */
  filterSource: string;
};

/**
 * De uitgesloten paden in elke vorm waarin ze in de adresbalk kunnen staan. NL
 * leeft op de voorvoegselloze URL, maar `/nl/...` rendert dezelfde pagina en
 * `/en/...` is de Engelse tegenhanger.
 */
export function excludedAnalyticsPaths(): string[] {
  const prefixes = ["", ...LOCALES.map((locale) => `/${locale}`)];
  return prefixes.flatMap((prefix) =>
    ANALYTICS_EXCLUDED_PATHS.map((path) => `${prefix}${path}`),
  );
}

/** Pad zonder querystring, fragment of afsluitende slash. */
function normalizePath(pathname: string): string {
  const path = (pathname || "/").split("?")[0].split("#")[0];
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function isExcludedFromAnalytics(pathname: string): boolean {
  const path = normalizePath(pathname);
  return excludedAnalyticsPaths().some(
    (excluded) => path === excluded || path.startsWith(`${excluded}/`),
  );
}

/**
 * Het inline script dat Umami's `data-before-send`-haak invult. Het krijgt de
 * payload voor die verstuurd wordt en geeft `false` terug om ze te laten
 * vallen. De lijst met paden komt uit dezelfde bron als
 * `isExcludedFromAnalytics`, zodat server en browser niet uiteen kunnen lopen.
 */
export function analyticsFilterSource(): string {
  const excluded = JSON.stringify(excludedAnalyticsPaths());
  return (
    `window.${ANALYTICS_BEFORE_SEND_FUNCTION}=function(type,payload){` +
    `var excluded=${excluded},path;` +
    `try{path=new URL((payload&&payload.url)||location.href,location.href).pathname}` +
    `catch(e){path=location.pathname}` +
    `if(path.length>1){path=path.replace(/\\/+$/,"")}` +
    `for(var i=0;i<excluded.length;i++){` +
    `if(path===excluded[i]||path.indexOf(excluded[i]+"/")===0){return false}}` +
    `return payload};`
  );
}

/**
 * Leest de configuratie uit de omgeving. Beide waarden zijn publiek (ze staan
 * straks in de HTML), maar we lezen ze server-side zodat een wijziging geen
 * nieuwe build vraagt; vandaar geen `NEXT_PUBLIC_`-voorvoegsel. Leeg = geen
 * statistieken.
 */
export function analyticsConfigFromEnv(
  env: { UMAMI_PUBLIC_URL?: string; UMAMI_WEBSITE_ID?: string } = {
    UMAMI_PUBLIC_URL: process.env.UMAMI_PUBLIC_URL,
    UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID,
  },
): AnalyticsConfig | null {
  const url = (env.UMAMI_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const websiteId = (env.UMAMI_WEBSITE_ID ?? "").trim();
  if (!url || !websiteId) return null;
  return { url, websiteId };
}

/**
 * Het script voor deze aanvraag, of `null` wanneer er niets gemeten mag worden.
 */
export function analyticsScript(input: {
  config: AnalyticsConfig | null;
  consent: CookieConsentChoice | null;
  pathname: string;
}): AnalyticsScript | null {
  const { config, consent, pathname } = input;
  if (!config) return null;
  if (consent !== "analytics") return null;

  // Onbekend pad betekent niet meten. `proxy.ts` zet `x-pathname` op elke route
  // die door de locale-rewrite gaat, maar `/scan` slaat die bewust over en heeft
  // de header dus niet. Zonder deze regel valt zo'n aanvraag door de uitsluiting
  // heen (een lege string matcht geen enkel patroon) en zou het script daar juist
  // wél renderen. Falen doen we dan liever dicht.
  if (pathname.trim() === "") return null;

  if (isExcludedFromAnalytics(pathname)) return null;

  return {
    src: `${config.url}/script.js`,
    websiteId: config.websiteId,
    beforeSend: ANALYTICS_BEFORE_SEND_FUNCTION,
    filterSource: analyticsFilterSource(),
  };
}
