import "server-only";

import { brusselsMinutesOfDay, brusselsYMD, parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";
import type { AppAlma, AppAlmaRestaurant, AppHoursWindow, AppLocale } from "@/lib/app-api/contract";
import { parseAlmaPage, type AlmaHoursKind, type AlmaPage, type AlmaWindow } from "./parse";

/**
 * De Alma's in Leuven, voor `/api/app/v1/alma`: de vier op campus Arenberg, en
 * op vraag (`?alle=1`) ook Alma 1, Alma 2 en Gasthuisberg.
 *
 * Elke pagina van alma.be gaat door de Next data-cache met een half uur
 * `revalidate`: zo vraagt de site Alma hooguit twee keer per uur per restaurant
 * en per dag, hoeveel telefoons er ook kijken. Lukt een verversing niet, dan
 * blijft de vorige versie in de cache staan. Lukt zelfs de eerste niet, dan
 * krijgt dat restaurant `unavailable` en tekent de app "niet beschikbaar" in
 * plaats van "gesloten".
 *
 * Het lezen zelf staat in `parse.ts`.
 */

/**
 * `arenberg` zegt wie er standaard bij is. Home toont "Alma vandaag" voor de
 * campus waar ingenieurs les hebben; de andere drie staan enkel op het
 * Alma-scherm, dat erom vraagt. Een oudere app vraagt er niet om en krijgt dus
 * niet ineens zeven rijen op Home.
 */
export const ALMA_RESTAURANTS = [
  { slug: "alma-3", name: "Alma 3", shortName: "Alma 3", arenberg: true },
  { slug: "alma-quadrivium", name: "Alma Quadrivium", shortName: "Quadrivium", arenberg: true },
  { slug: "de-moete", name: "De Moete", shortName: "De Moete", arenberg: true },
  { slug: "esat2", name: "ESAT2", shortName: "ESAT2", arenberg: true },
  { slug: "alma-1", name: "Alma 1", shortName: "Alma 1", arenberg: false },
  { slug: "alma-2", name: "Alma 2", shortName: "Alma 2", arenberg: false },
  { slug: "alma-gasthuisberg", name: "Alma Gasthuisberg", shortName: "Gasthuisberg", arenberg: false },
] as const satisfies readonly (Pick<AppAlmaRestaurant, "slug" | "name" | "shortName"> & { arenberg: boolean })[];

const ORIGIN = process.env.ALMA_ORIGIN || "https://www.alma.be";

function pageUrl(slug: string, locale: AppLocale, date?: string): string {
  const url = new URL(`/${locale}/restaurants/${slug}`, ORIGIN);
  if (date) url.searchParams.set("date", date);
  return url.toString();
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "VTK-app (vtk.be)", Accept: "text/html" },
      next: { revalidate: 1800, tags: ["alma"] },
      // alma.be is traag: een pagina die niet in hun cache zit, duurt al snel twee
      // seconden, en we vragen er vier tegelijk. Na tien seconden liever "niet
      // beschikbaar" dan een draaiend wiel; de app wacht vijftien.
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60) % 24;
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** De vensters van één dag over alle soorten heen, samengevoegd waar ze overlappen. */
function windowsOn(hours: AlmaHoursKind[], date: string): AlmaWindow[] {
  const all = hours
    .flatMap((kind) => kind.days.find((day) => day.date === date)?.windows ?? [])
    .sort((a, b) => a.start - b.start);
  const merged: AlmaWindow[] = [];
  for (const window of all) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
}

const SHORT_DAYS: Record<AppLocale, string[]> = {
  nl: ["ma", "di", "wo", "do", "vr", "za", "zo"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

/**
 * Open of niet, en de regel die erbij hoort. Dezelfde woorden als bij Theokot en
 * cudi op Home (`serviceStatus.ts`), zodat de twee lijsten één taal spreken.
 */
export function almaStatus(
  hours: AlmaHoursKind[],
  now: Date,
  locale: AppLocale,
): { openNow: boolean; detail: string; today: AppHoursWindow[] } {
  const todayYmd = brusselsYMD(now);
  const today = ymdKey(todayYmd);
  const minutes = brusselsMinutesOfDay(now);
  const todayWindows = windowsOn(hours, today);

  const running = todayWindows.find((window) => minutes >= window.start && minutes < window.end);
  if (running) {
    return { openNow: true, detail: locale === "en" ? `until ${clock(running.end)}` : `tot ${clock(running.end)}`, today: todayWindows };
  }

  const later = todayWindows.find((window) => window.start > minutes);
  if (later) {
    return { openNow: false, detail: locale === "en" ? `opens ${clock(later.start)}` : `opent ${clock(later.start)}`, today: todayWindows };
  }

  for (let offset = 1; offset < 8; offset += 1) {
    const ymd = shiftYMD(todayYmd, offset);
    const first = windowsOn(hours, ymdKey(ymd))[0];
    if (!first) continue;
    const weekday = (new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)).getUTCDay() + 6) % 7;
    const day = offset === 1 ? (locale === "en" ? "tomorrow" : "morgen") : SHORT_DAYS[locale][weekday];
    return { openNow: false, detail: `${day} ${clock(first.start)}`, today: todayWindows };
  }

  return { openNow: false, detail: locale === "en" ? "closed" : "gesloten", today: todayWindows };
}

/**
 * De vier van Arenberg (met `all` alle zeven), met het menu van `date` (of van
 * vandaag). Eén aanvraag per restaurant: de pagina met `?date=` draagt naast dat
 * menu ook de uren en het adres, die niet van de gekozen dag afhangen.
 */
export async function loadAlma(
  locale: AppLocale,
  requestedDate: string | null,
  now = new Date(),
  { all = false }: { all?: boolean } = {},
): Promise<AppAlma> {
  const today = ymdKey(brusselsYMD(now));
  const date = requestedDate && parseYMD(requestedDate) ? requestedDate : today;

  const pages = await Promise.all(
    ALMA_RESTAURANTS.filter((entry) => all || entry.arenberg).map(async ({ slug, name, shortName }) => {
      const restaurant = { slug, name, shortName };
      const html = await fetchPage(pageUrl(restaurant.slug, locale, date));
      return { restaurant, page: html ? parseAlmaPage(html, today) : null };
    }),
  );

  const restaurants = pages.map(({ restaurant, page }): AppAlmaRestaurant => {
    const usable: AlmaPage | null = page && (page.hours.length > 0 || page.menu.length > 0) ? page : null;
    const status = usable
      ? almaStatus(usable.hours, now, locale)
      : { openNow: false, detail: locale === "en" ? "Hours unavailable" : "Uren niet beschikbaar", today: [] };
    // Alma toont een andere dag wanneer de gevraagde geen menu heeft; dat menu
    // hoort dan niet onder deze datum.
    const menuMatches = usable?.menuDate === date;
    return {
      ...restaurant,
      address: usable?.address ?? null,
      location: usable?.location ?? null,
      url: pageUrl(restaurant.slug, locale),
      ...status,
      hours: usable?.hours ?? [],
      menuDate: menuMatches ? date : null,
      menu: menuMatches ? usable.menu : [],
      unavailable: !usable,
    };
  });

  const dates = [...new Set(pages.flatMap(({ page }) => page?.dates ?? []))].filter((day) => day >= today).sort();
  return { date, dates, restaurants };
}
