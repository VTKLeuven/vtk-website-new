import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { pick, type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { markdownToPlainText } from "@/lib/markdown";
import { collectNews, readNewsSettingFromDb, type NewsEntry } from "@/lib/news/load";
import { NewsRow } from "@/components/editorial/NewsBand";

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

/**
 * Alle berichten: wat nu in het nieuws staat (zonder de grens van de band op de
 * homepage), en daaronder de eerdere mededelingen en woordjes. De automatische
 * berichten hebben geen historiek: een ticketverkoop van vorig jaar is geen
 * nieuws meer, en zijn bron (het event, het album) staat nog op zijn eigen plek.
 */
export default async function NewsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const now = new Date();

  const setting = await readNewsSettingFromDb();
  const [candidates, earlierPosts] = await Promise.all([
    collectNews(locale, now, setting),
    prisma.newsPost.findMany({
      where: { active: true, endsAt: { lte: now } },
      orderBy: { publishedAt: "desc" },
      take: EARLIER_LIMIT,
    }),
  ]);

  const current = candidates
    .filter((entry) => !entry.hidden)
    .sort((a, b) => b.date.localeCompare(a.date));

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
      imageUrl: null,
      author: null,
    };
  });

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

      <main className="vtk-page-shell vtk-page-narrow news-page">
        {current.length === 0 ? (
          <p className="news-page-empty">
            {nl ? "Er is op dit moment geen nieuws." : "There is no news at the moment."}
          </p>
        ) : (
          <ol className="news-list">
            {current.map((entry) => (
              <li key={entry.key}>
                <NewsRow entry={entry} locale={locale} base={base} now={now} />
              </li>
            ))}
          </ol>
        )}

        {earlier.length > 0 ? (
          <section className="news-page-earlier" aria-labelledby="news-earlier">
            <h2 id="news-earlier">{nl ? "Eerder" : "Earlier"}</h2>
            <ol className="news-list">
              {earlier.map((entry) => (
                <li key={entry.key}>
                  <NewsRow entry={entry} locale={locale} base={base} now={now} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
    </div>
  );
}
