import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { markdownToPlainText } from "@/lib/markdown";
import { publicUrl } from "@/lib/storage";
import { getMediaContent, type MediaPublication } from "@/lib/media-content";
import { collectNews, publicationHref, readNewsSettingFromDb, type NewsEntry } from "@/lib/news/load";
import { groupNewsByPeriod, type NewsPeriod, type NewsSource } from "@/lib/news/rules";
import {
  NEWS_FILTER_PARAM,
  newsFilterLabel,
  newsSourceFromParam,
  newsSourceLabel,
} from "@/lib/news/labels";
import {
  NewsAuthor,
  NewsLink,
  NewsRow,
  magazineTracking,
  newsDate,
} from "@/components/editorial/NewsBand";

import "@/app/design/vtk-ticket-catalog.css";
import "@/app/design/vtk-news.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("nieuws", "/nieuws", locale);
}

/** Hoeveel eerdere mededelingen en woordjes de pagina nog toont. */
const EARLIER_LIMIT = 20;

/** De volgorde van de filterchips: eerst wat je kan doen, dan wat je kan lezen. */
const FILTER_ORDER: NewsSource[] = ["tickets", "signup", "notice", "praeses", "bakske", "irreeel", "album"];

function periodLabel(period: NewsPeriod<NewsEntry>, locale: Locale): { title: string; range: string | null } {
  const nl = locale === "nl";
  const tag = nl ? "nl-BE" : "en-GB";
  if (period.monday) {
    const monday = new Date(`${period.monday}T12:00:00Z`);
    const sunday = new Date(monday);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    const short = (date: Date, month: boolean) =>
      date
        .toLocaleDateString(tag, { timeZone: "UTC", day: "numeric", ...(month ? { month: "short" } : {}) })
        .replace(/\./g, "");
    const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
    return {
      title: period.key === "this-week" ? (nl ? "Deze week" : "This week") : nl ? "Vorige week" : "Last week",
      range: `${short(monday, !sameMonth)} – ${short(sunday, true)}`,
    };
  }
  const month = new Date(`${period.key}-15T12:00:00Z`).toLocaleDateString(tag, {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  return { title: month.charAt(0).toUpperCase() + month.slice(1), range: null };
}

/** Het nieuwste nummer van elk blad dat al verschenen is, voor de rail. */
function newestIssues(publications: MediaPublication[], now: Date): MediaPublication[] {
  const newest = new Map<string, MediaPublication>();
  for (const item of publications) {
    if (!item.publishedAt || new Date(item.publishedAt) > now) continue;
    const current = newest.get(item.kind);
    if (!current || item.publishedAt > current.publishedAt!) newest.set(item.kind, item);
  }
  return ["bakske", "ir-reeel"].flatMap((kind) => newest.get(kind) ?? []);
}

/**
 * Alle berichten: wat nu in het nieuws staat (zonder de grens van de band op de
 * homepage) en de eerdere mededelingen en woordjes, samen als agenda per week,
 * met chips per soort zoals op /tickets. Rechts een rail met het laatste woordje
 * van de praeses en de laatste nummers van het Bakske en Ir.Reëel, zodat die
 * niet wegzakken tussen de ticketverkoop.
 *
 * De automatische berichten hebben geen historiek: een ticketverkoop van vorig
 * jaar is geen nieuws meer, en zijn bron (het event, het album) staat nog op
 * zijn eigen plek.
 */
export default async function NewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const now = new Date();
  const filter = newsSourceFromParam((await searchParams).soort);

  const setting = await readNewsSettingFromDb();
  const [candidates, earlierPosts, letterPost, media] = await Promise.all([
    collectNews(locale, now, setting),
    prisma.newsPost.findMany({
      where: { active: true, endsAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
      take: EARLIER_LIMIT,
    }),
    prisma.newsPost.findFirst({
      where: { kind: "PRAESES", active: true, publishedAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
    }),
    getMediaContent().catch(() => ({ videos: [], publications: [] })),
  ]);

  const current = candidates.filter((entry) => !entry.hidden);
  const earlier: NewsEntry[] = earlierPosts.map((post) => {
    const praeses = post.kind === "PRAESES";
    return {
      key: `${praeses ? "praeses" : "notice"}:${post.id}`,
      source: praeses ? "praeses" : "notice",
      ref: post.id,
      date: post.publishedAt.toISOString(),
      featured: false,
      title: pick(post.titleNl, post.titleEn, locale),
      line:
        praeses && post.authorName
          ? nl
            ? `Een woordje van ${post.authorName}`
            : `A word from ${post.authorName}`
          : markdownToPlainText(pick(post.bodyNl, post.bodyEn, locale)),
      body: null,
      href: `/nieuws/${post.id}`,
      ctaLabel: "",
      ctaHref: null,
      imageUrl: praeses ? null : publicUrl(post.imageKey),
      author: null,
    };
  });
  const all = [...current, ...earlier];

  const counts = new Map<NewsSource, number>();
  for (const entry of all) counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  const chips = FILTER_ORDER.filter((source) => counts.has(source));
  const shown = filter ? all.filter((entry) => entry.source === filter) : all;
  const periods = groupNewsByPeriod(shown, now);

  const issues = newestIssues(media.publications, now);
  const letter = letterPost
    ? {
        title: pick(letterPost.titleNl, letterPost.titleEn, locale),
        excerpt: markdownToPlainText(pick(letterPost.bodyNl, letterPost.bodyEn, locale)),
        date: letterPost.publishedAt.toISOString(),
        href: `/nieuws/${letterPost.id}`,
        author: letterPost.authorName
          ? {
              name: letterPost.authorName,
              role: pick(letterPost.authorRoleNl ?? "", letterPost.authorRoleEn, locale) || null,
              imageUrl: publicUrl(letterPost.imageKey),
            }
          : null,
      }
    : null;
  const hasRail = Boolean(letter) || issues.length > 0;

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK</div>
          <h1 className="vtk-page-title">{nl ? "Nieuws" : "News"}</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Ticketverkoop, inschrijvingen, het Bakske, nieuwe foto's en mededelingen van het praesidium."
              : "Ticket sales, sign-ups, Het Bakske, new photos and notices from the board."}
          </p>
        </div>
      </header>

      <main className={`vtk-page-shell news-page${hasRail ? "" : " is-solo"}`}>
        <div className="news-main">
          {/* Links en geen knoppen, zoals op /tickets: een filter hoort in de
              URL, zodat je "enkel de inschrijvingen" kan doorsturen. */}
          {chips.length > 1 ? (
            <nav className="tcat-filters" aria-label={nl ? "Filter op soort" : "Filter by kind"}>
              <Link href={`${base}/nieuws`} aria-current={filter ? undefined : "page"}>
                {nl ? "Alles" : "All"} <span>{all.length}</span>
              </Link>
              {chips.map((source) => (
                <Link
                  key={source}
                  href={`${base}/nieuws?soort=${NEWS_FILTER_PARAM[source]}`}
                  aria-current={filter === source ? "page" : undefined}
                >
                  {newsFilterLabel(source, locale)} <span>{counts.get(source)}</span>
                </Link>
              ))}
            </nav>
          ) : null}

          {periods.length === 0 ? (
            <p className="news-page-empty">
              {filter
                ? nl
                  ? `Er is nu niets bij ${newsFilterLabel(filter, locale).toLowerCase()}.`
                  : `There is nothing under ${newsFilterLabel(filter, locale).toLowerCase()} right now.`
                : nl
                  ? "Er is op dit moment geen nieuws."
                  : "There is no news at the moment."}
            </p>
          ) : (
            periods.map((period) => {
              const label = periodLabel(period, locale);
              return (
                <section key={period.key} className="news-period" aria-label={label.title}>
                  <h2>
                    {label.title}
                    {label.range ? <span>{label.range}</span> : null}
                  </h2>
                  <ol className="news-list">
                    {period.entries.map((entry) => (
                      <li key={entry.key}>
                        <NewsRow entry={entry} locale={locale} base={base} now={now} />
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })
          )}
        </div>

        {hasRail ? (
          <aside className="news-rail" aria-label={nl ? "Om te lezen" : "To read"}>
            {letter ? (
              <section>
                <h2>{newsSourceLabel("praeses", locale)}</h2>
                {letter.author ? <NewsAuthor author={letter.author} /> : null}
                <b className="news-rail-title">{letter.title}</b>
                <p>{letter.excerpt}</p>
                <div>
                  <Link href={`${base}${letter.href}`} className="news-more">
                    {nl ? "Lees de brief" : "Read the letter"}
                  </Link>
                </div>
              </section>
            ) : null}
            {issues.length > 0 ? (
              <section>
                <h2>{nl ? "Tijdschriften" : "Magazines"}</h2>
                {issues.map((issue) => {
                  const source: NewsSource = issue.kind === "bakske" ? "bakske" : "irreeel";
                  return (
                    <NewsLink
                      key={issue.id}
                      href={publicationHref(issue.id)}
                      base={base}
                      className="news-mag"
                      tracking={magazineTracking(source, issue.id)}
                    >
                      <span className="news-mag-cover" aria-hidden="true" />
                      <span>
                        <b>
                          {pick(issue.titleNl, issue.titleEn, locale)}, {pick(issue.issueNl, issue.issueEn, locale)}
                        </b>
                        <span>{newsDate(issue.publishedAt!, locale)} · pdf</span>
                      </span>
                    </NewsLink>
                  );
                })}
              </section>
            ) : null}
          </aside>
        ) : null}
      </main>
    </div>
  );
}
