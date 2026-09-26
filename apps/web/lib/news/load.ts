import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { markdownToPlainText } from "@/lib/markdown";
import { getMediaContent } from "@/lib/media-content";
import { listImmichGalleryAlbums } from "@/lib/immich-gallery";
import { SITE_CONTENT_TAG } from "@/lib/cachedContent";
import type { SessionPayload } from "@vtk/auth";
import { inPresaleAudience } from "@/lib/ticketing/presale";
import { presaleViewerFor } from "@/lib/ticketing/presaleViewer";
import {
  albumInNews,
  albumNewsDate,
  magazinesInNews,
  postInNews,
  signupInNews,
  signupNewsDate,
  ticketInNews,
  ticketNewsDate,
  ticketPresaleInNews,
  ticketPresaleNewsDate,
  type NewsComposable,
  type NewsSource,
} from "./rules";
import {
  NEWS_FEATURED_SETTING,
  NEWS_SETTING,
  readNewsFeatured,
  readNewsSetting,
  type NewsSetting,
} from "./setting";

/**
 * Het nieuws op de homepage lezen: de zelfgeschreven berichten uit `NewsPost`,
 * en de automatische uit hun bron. De regels staan in `rules.ts`; dit bestand
 * haalt enkel op en zet om naar één vorm.
 */

/** Eén bericht, klaar om te tekenen, in de taal van de bezoeker. */
export type NewsEntry = NewsComposable & {
  ref: string;
  title: string;
  /** De regel onder de titel in het register. */
  line: string;
  /** Markdown; enkel bij een zelfgeschreven bericht. */
  body: string | null;
  /**
   * Waar het bericht zelf naartoe gaat: een pad op deze site zonder taalprefix
   * (`/tickets/galabal-2026`) of een volledig adres.
   */
  href: string;
  /** De knop in de uitgelichte kaart. */
  ctaLabel: string;
  /** Waar die knop naartoe gaat, als dat iets anders is dan `href`. */
  ctaHref: string | null;
  imageUrl: string | null;
  author: { name: string; role: string | null; imageUrl: string | null } | null;
};

/** Een bericht zoals het beheer het ziet: ook wat uit het nieuws gehaald is. */
export type NewsCandidate = NewsEntry & { hidden: boolean };

/** Een pdf van de mediapagina, via dezelfde route als de boekenplank daar. */
function publicationHref(id: string): string {
  return `/api/media/publications/${encodeURIComponent(id)}`;
}

function newsDay(date: Date, locale: Locale): string {
  return date
    .toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
      timeZone: "Europe/Brussels",
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replace(/\./g, "");
}

/** Een ISO-datum uit een `yyyy-mm-dd` of een volledig tijdstip. */
function isoDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return date.toISOString();
}

const TICKET_NEWS_SELECT = {
  id: true,
  slug: true,
  titleNl: true,
  titleEn: true,
  location: true,
  status: true,
  startsAt: true,
  salesStartAt: true,
  salesEndAt: true,
  publishedAt: true,
  calendarEvent: { select: { imageKey: true } },
} as const;

type TicketNewsEvent = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  startsAt: Date;
  calendarEvent: { imageKey: string | null } | null;
};

/**
 * Het bericht van een ticketverkoop, publiek of in voorverkoop. Beide dragen
 * dezelfde sleutel (`tickets:<id>`), zodat verbergen en uitlichten in
 * /admin/nieuws voor allebei geldt.
 */
function ticketEntry(event: TicketNewsEvent, date: Date, locale: Locale, presale: boolean): NewsEntry {
  const nl = locale === "nl";
  const day = newsDay(event.startsAt, locale);
  const where = event.location ? `, ${event.location}` : "";
  return {
    key: `tickets:${event.id}`,
    source: "tickets",
    ref: event.id,
    date: date.toISOString(),
    featured: false,
    title: pick(event.titleNl, event.titleEn, locale),
    line: presale
      ? nl
        ? `Voorverkoop voor ${day}${where}, jij kan al bestellen`
        : `Presale for ${day}${where}, you can already order`
      : nl
        ? `Tickets te koop voor ${day}${where}`
        : `Tickets on sale for ${day}${where}`,
    body: null,
    href: `/tickets/${event.slug}`,
    ctaLabel: nl ? "Tickets kopen" : "Buy tickets",
    ctaHref: null,
    imageUrl: publicUrl(event.calendarEvent?.imageKey),
    author: null,
  };
}

/**
 * Alle berichten die nu in het nieuws kunnen staan, met of ze uit het nieuws
 * gehaald zijn. Ongecachet: het beheer hoort te tonen wat er nét veranderde.
 */
export async function collectNews(
  locale: Locale,
  now: Date,
  setting: NewsSetting,
): Promise<NewsCandidate[]> {
  const nl = locale === "nl";
  const { sources } = setting;

  const [posts, hiddenRows, featuredRow, tickets, signups, media, gallery] = await Promise.all([
    prisma.newsPost.findMany({
      where: {
        active: true,
        publishedAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.newsHidden.findMany({ select: { source: true, ref: true } }),
    prisma.setting.findUnique({ where: { key: NEWS_FEATURED_SETTING } }),
    sources.tickets
      ? prisma.ticketEvent.findMany({
          where: {
            status: "PUBLISHED",
            startsAt: { gt: now },
            publishedAt: { not: null },
            OR: [{ salesEndAt: null }, { salesEndAt: { gt: now } }],
          },
          select: TICKET_NEWS_SELECT,
        })
      : Promise.resolve([]),
    sources.signup
      ? prisma.calendarEvent.findMany({
          where: {
            registrationNewsAt: { not: null },
            publishedAt: { not: null },
            url: { not: null },
            start: { gt: now },
          },
          select: {
            id: true,
            slug: true,
            titleNl: true,
            titleEn: true,
            url: true,
            urlLabelNl: true,
            urlLabelEn: true,
            location: true,
            start: true,
            imageKey: true,
            publishedAt: true,
            registrationNewsAt: true,
          },
        })
      : Promise.resolve([]),
    sources.bakske || sources.irreeel
      ? getMediaContent().catch(() => ({ videos: [], publications: [] }))
      : Promise.resolve({ videos: [], publications: [] }),
    // Immich kan onbereikbaar zijn; dan valt enkel het album weg, niet de homepage.
    sources.album
      ? listImmichGalleryAlbums().catch(() => ({ albums: [] }))
      : Promise.resolve({ albums: [] }),
  ]);

  const hidden = new Set(hiddenRows.map((row) => `${row.source}:${row.ref}`));
  const entries: NewsEntry[] = [];

  for (const post of posts) {
    if (!postInNews(post, now)) continue;
    const praeses = post.kind === "PRAESES";
    const source: NewsSource = praeses ? "praeses" : "notice";
    const body = pick(post.bodyNl, post.bodyEn, locale);
    const authorRole = pick(post.authorRoleNl ?? "", post.authorRoleEn, locale) || null;
    entries.push({
      key: `${source}:${post.id}`,
      source,
      ref: post.id,
      date: post.publishedAt.toISOString(),
      featured: post.featured,
      title: pick(post.titleNl, post.titleEn, locale),
      line: praeses && post.authorName
        ? nl
          ? `Een woordje van ${post.authorName}`
          : `A word from ${post.authorName}`
        : markdownToPlainText(body),
      body,
      href: `/nieuws/${post.id}`,
      ctaLabel:
        pick(post.ctaLabelNl ?? "", post.ctaLabelEn, locale) ||
        (praeses ? (nl ? "Lees de hele brief" : "Read the whole letter") : nl ? "Lees verder" : "Read more"),
      ctaHref: post.ctaUrl || null,
      // Bij een woordje is de foto het portret, niet de kop van de kaart.
      imageUrl: praeses ? null : publicUrl(post.imageKey),
      author: praeses && post.authorName
        ? { name: post.authorName, role: authorRole, imageUrl: publicUrl(post.imageKey) }
        : null,
    });
  }

  for (const event of tickets) {
    if (!ticketInNews(event, now)) continue;
    entries.push(ticketEntry(event, ticketNewsDate(event)!, locale, false));
  }

  for (const event of signups) {
    if (!signupInNews(event, now)) continue;
    const date = signupNewsDate(event)!;
    const day = newsDay(event.start, locale);
    entries.push({
      key: `signup:${event.id}`,
      source: "signup",
      ref: event.id,
      date: date.toISOString(),
      featured: false,
      title: pick(event.titleNl, event.titleEn, locale),
      line: nl
        ? `Inschrijven kan tot ${day}${event.location ? `, ${event.location}` : ""}`
        : `Sign up before ${day}${event.location ? `, ${event.location}` : ""}`,
      body: null,
      href: `/kalender/${event.slug}`,
      ctaLabel: pick(event.urlLabelNl ?? "", event.urlLabelEn, locale) || (nl ? "Inschrijven" : "Sign up"),
      ctaHref: event.url,
      imageUrl: publicUrl(event.imageKey),
      author: null,
    });
  }

  const magazines = magazinesInNews(
    media.publications.filter(
      (item) =>
        (item.kind === "bakske" && sources.bakske) || (item.kind === "ir-reeel" && sources.irreeel),
    ),
    now,
  );
  for (const item of magazines) {
    const source: NewsSource = item.kind === "bakske" ? "bakske" : "irreeel";
    const issue = pick(item.issueNl, item.issueEn, locale);
    entries.push({
      key: `${source}:${item.id}`,
      source,
      ref: item.id,
      date: isoDate(item.publishedAt!),
      featured: false,
      title: `${pick(item.titleNl, item.titleEn, locale)}, ${issue}`,
      line: nl ? "Nieuw nummer, als pdf" : "New issue, as a pdf",
      body: null,
      href: publicationHref(item.id),
      ctaLabel: nl ? "Lees het nummer" : "Read the issue",
      ctaHref: null,
      imageUrl: null,
      author: null,
    });
  }

  for (const album of gallery.albums) {
    if (!albumInNews(album, now)) continue;
    const date = albumNewsDate(album)!;
    entries.push({
      key: `album:${album.id}`,
      source: "album",
      ref: album.id,
      date: date.toISOString(),
      featured: false,
      title: album.title,
      line: nl
        ? `${album.photoCount} ${album.photoCount === 1 ? "foto" : "foto's"} van ${newsDay(date, locale)}`
        : `${album.photoCount} ${album.photoCount === 1 ? "photo" : "photos"} from ${newsDay(date, locale)}`,
      body: null,
      href: `/media/${album.slug}`,
      ctaLabel: nl ? "Bekijk het album" : "View the album",
      ctaHref: null,
      imageUrl: album.coverPhoto?.thumbnailUrl ?? null,
      author: null,
    });
  }

  // Een automatisch bericht is uitgelicht wanneer de redactie het zo aanduidde;
  // een zelfgeschreven bericht draagt dat al zelf.
  const choice = readNewsFeatured(featuredRow?.value);
  const picked = choice ? `${choice.source}:${choice.ref}` : null;
  return entries.map((entry) => ({
    ...entry,
    featured: entry.featured || entry.key === picked,
    hidden: hidden.has(entry.key),
  }));
}

export async function readNewsSettingFromDb(): Promise<NewsSetting> {
  const row = await prisma.setting.findUnique({ where: { key: NEWS_SETTING } });
  return readNewsSetting(row?.value);
}

/** De tag waarmee het beheer het nieuws meteen ververst. */
export const NEWS_TAG = "news";

/**
 * Het nieuws van de homepage, gedeeld over alle bezoekers.
 *
 * Alles hierin overleeft JSON (de datums staan als ISO-strings), want
 * `unstable_cache` serialiseert; zie de kop van lib/cachedContent.ts. `now` staat
 * binnen de functie om dezelfde reden als daar: als argument zou elke
 * milliseconde een eigen cache-ingang krijgen.
 */
const cachedNews = unstable_cache(
  async (locale: Locale) => {
    const setting = await readNewsSettingFromDb();
    if (!setting.enabled) return { enabled: false, count: setting.count, entries: [] as NewsEntry[] };
    const candidates = await collectNews(locale, new Date(), setting);
    const entries: NewsEntry[] = candidates.flatMap(({ hidden, ...entry }) => (hidden ? [] : [entry]));
    return { enabled: true, count: setting.count, entries };
  },
  ["site", "news"],
  { revalidate: 60, tags: [SITE_CONTENT_TAG, NEWS_TAG] },
);

export function getCachedNews(locale: Locale) {
  return cachedNews(locale);
}

/**
 * De ticketverkopen die nu in voorverkoop staan, enkel voor wie erin mag.
 *
 * Bewust naast het gedeelde nieuws en niet erin: wie in de voorverkoop zit,
 * hangt aan de sessie (post, shiften) of aan het cookie van de private link, en
 * `cachedNews` is voor iedereen hetzelfde. Een voorverkoop die in dat gedeelde
 * nieuws stond, zou dus ook bij wie niet mag kopen verschijnen, met een knop naar
 * een shop die "Binnenkort" zegt.
 *
 * Kost voor een gewone bezoeker één kleine lezing: pas wanneer er een
 * voorverkoop loopt, wordt de bezoeker, de verborgen lijst en de uitgelichte
 * keuze erbij gehaald.
 */
export async function getPresaleNews(
  locale: Locale,
  session: SessionPayload | null | undefined,
  now: Date,
): Promise<NewsEntry[]> {
  const candidates = await prisma.ticketEvent.findMany({
    where: {
      status: "PUBLISHED",
      startsAt: { gt: now },
      publishedAt: { not: null },
      salesStartAt: { gt: now },
      presaleLeadMinutes: { gt: 0 },
      OR: [{ salesEndAt: null }, { salesEndAt: { gt: now } }],
    },
    select: {
      ...TICKET_NEWS_SELECT,
      presaleLeadMinutes: true,
      presalePraesidium: true,
      presaleHelpers: true,
      presaleToken: true,
      presaleGroups: { select: { groupId: true } },
    },
  });
  const running = candidates.filter((event) => ticketPresaleInNews(event, now));
  if (running.length === 0) return [];

  const setting = await readNewsSettingFromDb();
  if (!setting.enabled || !setting.sources.tickets) return [];

  // Per event, want de private link geldt enkel voor het event waarvan ze is.
  const allowed: typeof running = [];
  for (const event of running) {
    const viewer = await presaleViewerFor(session, [event]);
    if (inPresaleAudience(viewer, event)) allowed.push(event);
  }
  if (allowed.length === 0) return [];

  const [hiddenRows, featuredRow] = await Promise.all([
    prisma.newsHidden.findMany({
      where: { source: "tickets", ref: { in: allowed.map((event) => event.id) } },
      select: { ref: true },
    }),
    prisma.setting.findUnique({ where: { key: NEWS_FEATURED_SETTING } }),
  ]);
  const hidden = new Set(hiddenRows.map((row) => row.ref));
  const choice = readNewsFeatured(featuredRow?.value);
  return allowed
    .filter((event) => !hidden.has(event.id))
    .map((event) => ({
      ...ticketEntry(event, ticketPresaleNewsDate(event)!, locale, true),
      featured: choice?.source === "tickets" && choice.ref === event.id,
    }));
}
