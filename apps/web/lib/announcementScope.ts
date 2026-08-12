import { LOCALES } from "@vtk/i18n";

/**
 * Waar een aankondiging mag verschijnen.
 *
 * Puur, zonder database: de layout kent enkel het pad (uit de `x-pathname`-header
 * die `proxy.ts` zet) en het bereik dat in het beheer gekozen is.
 */

/**
 * Paden waar nooit een venster over het scherm mag komen, ongeacht het bereik.
 *
 * Deze lijst is toevallig dezelfde als die van de statistieken, maar staat er
 * bewust los van: daar gaat het over wat we niet meten, hier over waar we de
 * bezoeker niet onderbreken. Wie aan het afrekenen is voor een ticket of aan de
 * deur tickets staat te scannen, heeft geen reclame nodig; dat is geen
 * aankondiging maar een storing.
 */
export const ANNOUNCEMENT_EXCLUDED_PREFIXES = ["/admin", "/scan", "/tickets/bestelling"];

/** Pad zonder querystring, fragment of afsluitende slash. */
function normalizePath(pathname: string): string {
  const path = (pathname || "/").split("?")[0].split("#")[0];
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

/**
 * Het pad zonder taalvoorvoegsel. `/en/media` en `/nl/media` worden allebei
 * `/media`, en de homepage wordt `""`. `x-pathname` draagt altijd een
 * voorvoegsel, maar een pad zonder werkt evengoed.
 */
function withoutLocale(path: string): string {
  for (const locale of LOCALES) {
    if (path === `/${locale}`) return "";
    if (path.startsWith(`/${locale}/`)) return path.slice(locale.length + 1);
  }
  return path === "/" ? "" : path;
}

export function announcementFits(scope: "HOME" | "SITE", pathname: string): boolean {
  const path = withoutLocale(normalizePath(pathname));
  const excluded = ANNOUNCEMENT_EXCLUDED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (excluded) return false;
  return scope === "SITE" || path === "";
}
