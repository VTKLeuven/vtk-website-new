import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { markdownToPlainText } from "@/lib/markdown";
import { getMediaContent } from "@/lib/media-content";
import { listImmichGalleryAlbums } from "@/lib/immich-gallery";
import { SITE_CONTENT_TAG } from "@/lib/cachedContent";
import {
  albumInNews,
  albumNewsDate,
  magazinesInNews,
  postInNews,
  signupInNews,
  signupNewsDate,
  ticketInNews,
  ticketNewsDate,
  type NewsComposable,
  type NewsSource,
} from "./rules";
import { NEWS_SETTING, readNewsSetting, type NewsSetting } from "./setting";

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

  const [posts, hiddenRows, tickets, signups, media, gallery] = await Promise.all([
    prisma.newsPost.findMany({
      where: {
        active: true,
        publishedAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.newsHidden.findMany({ select: { source: true, ref: true } }),
    sources.tickets
      ? prisma.ticketEvent.findMany({
          where: {
            status: "PUBLISHED",
            startsAt: { gt: now },
            publishedAt: { not: null },
            OR: [{ salesEndAt: null }, { salesEndAt: { gt: now } }],
          },
          select: {
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
          },
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
    const date = ticketNewsDate(event)!;
    const day = newsDay(event.startsAt, locale);
    entries.push({
      key: `tickets:${event.id}`,
      source: "tickets",
      ref: event.id,
      date: date.toISOString(),
      featured: false,
      title: pick(event.titleNl, event.titleEn, locale),
      line: nl
        ? `Tickets te koop voor ${day}${event.location ? `, ${event.location}` : ""}`
        : `Tickets on sale for ${day}${event.location ? `, ${event.location}` : ""}`,
      body: null,
      href: `/tickets/${event.slug}`,
      ctaLabel: nl ? "Tickets kopen" : "Buy tickets",
      ctaHref: null,
      imageUrl: publicUrl(event.calendarEvent?.imageKey),
      author: null,
    });
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

  return entries.map((entry) => ({ ...entry, hidden: hidden.has(entry.key) }));
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
