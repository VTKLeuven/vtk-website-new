import { cache } from "react";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { parseWeek, weekToEntries, type HoursEntry, type WeekDay } from "./cursusdienstHoursMap";

/**
 * Cursusdienst-openingsuren komen live van het cursusdienst-platform
 * (cudi.vtk.be), de single source of truth: daar worden ze ingevoerd en
 * genereren ze meteen shiften en tijdsloten. Deze module haalt ze op en mapt
 * ze (via `weekToEntries`) naar de `entries`-vorm die de homepage-kaarten al
 * gebruiken.
 *
 * Fallback in drie trappen, zoals gevraagd:
 *   1. live fetch (via de Next data-cache, ~1×/uur echt over het netwerk);
 *   2. de laatst gecachte waarde uit de DB als het platform onbereikbaar is;
 *   3. `null` (kaart toont dan "momenteel niet beschikbaar") als er zelfs geen
 *      gecachte waarde is (bv. koude cache vlak na een deploy terwijl cudi plat
 *      ligt).
 */

export type { HoursEntry } from "./cursusdienstHoursMap";

/** DB-sleutel waaronder we de laatst succesvol opgehaalde week bewaren. */
const CACHE_KEY = "cursusdienst.weekHoursCache";

const CURSUSDIENST_ORIGIN = process.env.CURSUSDIENST_ORIGIN || "https://cudi.vtk.be";

async function fetchWeek(): Promise<WeekDay[] | null> {
  try {
    const res = await fetch(`${CURSUSDIENST_ORIGIN}/api/opening-hours?association=vtk`, {
      next: { revalidate: 3600, tags: ["cursusdienst-hours"] },
    });
    if (!res.ok) return null;
    return parseWeek(await res.json());
  } catch {
    return null;
  }
}

/** Schrijf de vers opgehaalde week naar de DB-cache, enkel als ze wijzigde. */
async function persistCache(week: WeekDay[]): Promise<void> {
  try {
    const value = { week };
    const existing = await prisma.setting.findUnique({ where: { key: CACHE_KEY } });
    if (existing && JSON.stringify(existing.value) === JSON.stringify(value)) return;
    await prisma.setting.upsert({
      where: { key: CACHE_KEY },
      update: { value },
      create: { key: CACHE_KEY, value },
    });
  } catch {
    // Best-effort: de kaart tonen gaat voor op het bijwerken van de cache.
  }
}

async function readCache(): Promise<WeekDay[] | null> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: CACHE_KEY } });
    return row ? parseWeek(row.value) : null;
  } catch {
    return null;
  }
}

/**
 * De cursusdienst-openingsuren als 7 entries (maandag → zondag), of `null`
 * wanneer er geen live én geen gecachte waarde beschikbaar is.
 *
 * `cache()` dedupliceert binnen één render (Home en Aanbod kunnen dezelfde
 * lezing delen). De fetch zit los in de Next data-cache; de DB-schrijf gebeurt
 * enkel wanneer de waarde effectief wijzigt.
 */
export const getCursusdienstHours = cache(async (locale: Locale): Promise<HoursEntry[] | null> => {
  const live = await fetchWeek();
  if (live) {
    await persistCache(live);
    return weekToEntries(live, locale);
  }
  const cached = await readCache();
  if (cached) return weekToEntries(cached, locale);
  return null;
});
