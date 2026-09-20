import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import {
  defaultEventImages,
  readDefaultEventImageRows,
  type DefaultEventImages,
} from "@/lib/defaultEventImage";
import { getVisibleHeaderTabsForNav, type NavHeaderTab } from "@/lib/headerTabs";
import { getMediaContent } from "@/lib/media-content";

/**
 * De gedeelde, onpersoonlijke lezingen van de publieke site.
 *
 * Elke pagina van de site betaalt dezelfde vaste tol voor ze aan haar eigen werk
 * begint: de navigatie (een join over tabs, pagina's en menu-items), de
 * aankondiging, de openingsuren. Die antwoorden zijn voor élke bezoeker
 * identiek, maar ze werden per verzoek opnieuw opgehaald, want er is nergens op
 * de site een cachelaag. Bij 500 gelijktijdige bezoekers is dat honderden keren
 * per seconde dezelfde vraag.
 *
 * ## Waarom hier en niet in de bronmodules
 *
 * `getVisibleHeaderTabsForNav` en `getMediaContent` blijven ongecachet: de
 * beheerschermen lezen ze ook, en die horen te tonen wat er nét opgeslagen is.
 * De app-API (`/api/app/v1/*`) gebruikt ze eveneens rechtstreeks. Deze module is
 * dus bewust een laag erboven, voor de publieke render.
 *
 * ## De val: `unstable_cache` serialiseert naar JSON
 *
 * Een `Date` komt als string terug zodra het antwoord uit de cache komt, terwijl
 * het type nog `Date` zegt. Een vergelijking als `row.startsAt < now` doet het
 * dan stil verkeerd, en enkel bij een cache-hit, wat betekent: niet op je
 * laptop. Daarom staat onder elke lezing hier een expliciete `select` met enkel
 * velden die JSON overleven (strings, getallen, booleans, JSON-kolommen). Voeg
 * je een veld toe, controleer dan of het geen `Date` is; hoort er toch een datum
 * bij, wek ze dan expliciet weer op met `new Date(...)` na het lezen.
 *
 * Om dezelfde reden staat `resolveFrontpage` hier niet: die geeft een
 * registry-module terug en vergelijkt datums, en ze kost één kleine query.
 */

/**
 * Hoe lang een gedeelde lezing hergebruikt wordt.
 *
 * Een minuut, en niet langer: dit is redactionele inhoud die een bestuurslid in
 * het beheer aanpast en meteen wil zien staan. Voor het rekenwerk maakt het geen
 * verschil of dit 60 of 300 seconden is; het verschil tussen 0 en 60 is de hele
 * winst. Wat sneller moet, krijgt een tag hieronder.
 */
const TTL_SECONDS = 60;

/**
 * Alles wat een redacteur in het beheer aanpast. Eén tag volstaat: het gaat om
 * een handvol wijzigingen per week, en over-invalideren kost hier één query.
 */
export const SITE_CONTENT_TAG = "site-content";

/**
 * De aankondiging apart, omdat ze als enige niet mag wachten: dit is het bericht
 * waarmee een activiteit afgelast wordt.
 */
export const ANNOUNCEMENT_TAG = "announcement";

const cachedHeaderTabs = unstable_cache(
  async (locale: Locale) => getVisibleHeaderTabsForNav(locale),
  ["site", "header-tabs"],
  { revalidate: TTL_SECONDS, tags: [SITE_CONTENT_TAG] },
);

/** De navigatie, zoals `getVisibleHeaderTabsForNav` ze oplevert. */
export function getCachedHeaderTabs(locale: Locale): Promise<NavHeaderTab[]> {
  return cachedHeaderTabs(locale);
}

const cachedSettings = unstable_cache(
  async (keys: string[]) =>
    prisma.setting.findMany({
      where: { key: { in: keys } },
      // Enkel key en value: de tijdstempels van de rij zou niemand hier
      // gebruiken, en ze zouden als string terugkomen (zie de val hierboven).
      select: { key: true, value: true },
    }),
  ["site", "settings"],
  { revalidate: TTL_SECONDS, tags: [SITE_CONTENT_TAG] },
);

/**
 * De gevraagde `Setting`-rijen. De sleutels zitten in de cachesleutel, dus twee
 * verschillende lijstjes krijgen elk hun eigen ingang.
 */
export function getCachedSettings(keys: string[]): Promise<{ key: string; value: unknown }[]> {
  return cachedSettings(keys);
}

/** De waarde van één instelling, of `undefined` wanneer ze niet bestaat. */
export async function getCachedSetting(key: string): Promise<unknown> {
  const rows = await cachedSettings([key]);
  return rows[0]?.value ?? undefined;
}

const cachedDefaultEventImageRows = unstable_cache(
  async () => readDefaultEventImageRows(),
  ["site", "default-event-images"],
  { revalidate: TTL_SECONDS, tags: [SITE_CONTENT_TAG] },
);

/**
 * De standaardfoto's voor evenementen zonder eigen affiche: de sitebrede en die
 * per thema. Enkel de ruwe rijen gaan door de cache; de `Map` eromheen wordt na
 * het lezen opgebouwd, want die overleeft de JSON-serialisatie niet.
 */
export async function getCachedDefaultEventImages(): Promise<DefaultEventImages> {
  return defaultEventImages(await cachedDefaultEventImageRows());
}

const cachedPartners = unstable_cache(
  async () =>
    prisma.partner.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      take: 12,
      // Precies de velden van `FrontpagePartner`; zie components/editorial/frontpage/context.tsx.
      select: { id: true, name: true, logoKey: true, url: true },
    }),
  ["site", "partners"],
  { revalidate: TTL_SECONDS, tags: [SITE_CONTENT_TAG] },
);

/** De hoofdpartners voor de balk onderaan de homepage. */
export function getCachedPartners() {
  return cachedPartners();
}

const cachedMediaContent = unstable_cache(async () => getMediaContent(), ["site", "media-content"], {
  revalidate: TTL_SECONDS,
  tags: [SITE_CONTENT_TAG],
});

/** De aftermovies en publicaties, zoals `getMediaContent` ze oplevert. */
export function getCachedMediaContent() {
  return cachedMediaContent();
}

const cachedAnnouncement = unstable_cache(
  async () => {
    // `now` staat bewust binnen de gecachete functie en is geen parameter: als
    // argument zou het in de cachesleutel landen en zou elke milliseconde een
    // eigen ingang krijgen, oftewel nooit een treffer. Gevolg: een geplande
    // aankondiging verschijnt tot een minuut later dan haar startmoment. Dat is
    // voor een gepland bericht prima, en wie een afgelasting publiceert, duwt de
    // tag hieronder meteen om.
    const now = new Date();
    return prisma.announcement.findFirst({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        titleNl: true,
        titleEn: true,
        bodyNl: true,
        bodyEn: true,
        ctaLabelNl: true,
        ctaLabelEn: true,
        ctaUrl: true,
        scope: true,
      },
    });
  },
  ["site", "announcement"],
  { revalidate: TTL_SECONDS, tags: [SITE_CONTENT_TAG, ANNOUNCEMENT_TAG] },
);

/**
 * De aankondiging die nu aan de beurt is, met enkel de velden die de modal
 * toont. De volledige rij (inclusief het venster) leest `getCurrentAnnouncement`
 * in lib/announcements.ts; die blijft het beheer bedienen.
 */
export function getCachedAnnouncement() {
  return cachedAnnouncement();
}
