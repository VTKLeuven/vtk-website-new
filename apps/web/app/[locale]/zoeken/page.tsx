import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SiteSearchForm } from "@/components/site/SiteSearchForm";
import { viewerAudiences } from "@/lib/calendar/audience";
import { hasLocale } from "@/lib/locale";
import { RESULT_LIMIT, type SearchResult } from "@/lib/search";
import { searchSite } from "@/lib/search-server";
import { buildMetadata } from "@/lib/seo";

import "@/app/design/vtk-search.css";

type PageProps = {
  params: Promise<{ locale: string }>;
  // In Next 16 komen zowel `params` als `searchParams` als promise binnen.
  searchParams: Promise<{ q?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  const t = getDictionary(locale).search;
  // `noIndex`: een resultatenpagina hoort niet in Google. Ze bestaat pas bij een
  // zoekterm, elke zoekterm is een eigen URL, en die zouden als duizenden dunne
  // pagina's geïndexeerd raken. De canonical wijst daarom ook naar `/zoeken`
  // zonder query.
  return buildMetadata({
    title: t.title,
    description: t.description,
    path: "/zoeken",
    locale,
    noIndex: true,
  });
}

/** Het label boven een resultaat: wat voor ding heeft de bezoeker gevonden? */
function kindLabel(
  kind: SearchResult["kind"],
  t: ReturnType<typeof getDictionary>["search"],
): string {
  if (kind === "event") return t.kindEvent;
  if (kind === "link") return t.kindLink;
  return t.kindPage;
}

/** Het fragment als losse stukjes tekst; de gemarkeerde delen in een `<mark>`. */
function Snippet({ parts }: { parts: SearchResult["snippet"] }) {
  return (
    <p className="vtk-search-snippet">
      {parts.map((part, index) =>
        part.highlight ? (
          <mark key={index}>{part.text}</mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </p>
  );
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const t = getDictionary(locale).search;
  const base = locale === "nl" ? "" : "/en";

  const { q } = await searchParams;
  // `?q=a&q=b` levert een array op; dan telt de eerste. Opschonen doet
  // `searchSite` zelf, zodat het invoerveld en de query dezelfde tekst zien.
  const raw = Array.isArray(q) ? q[0] : q;

  const { query, searched, results } = await searchSite({
    query: raw,
    locale,
    audiences: await viewerAudiences(),
  });

  const summary =
    results.length === 1
      ? t.resultsOne.replace("{query}", query)
      : t.resultsMany.replace("{count}", String(results.length)).replace("{query}", query);

  return (
    <div className="vtk-page vtk-search-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{t.title}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
          {/* Het veld staat in de kop en niet onderaan: verfijnen is hier de
              meest waarschijnlijke volgende handeling. Wie via de knop in de
              sitekop binnenkomt, heeft nog geen zoekterm en kan meteen typen. */}
          <div className="vtk-search-head-form">
            <SiteSearchForm locale={locale} defaultValue={query} autoFocus={query === ""} />
          </div>
        </div>
      </header>

      <div className="vtk-page-shell vtk-page-narrow">
        {!searched ? (
          // Te weinig getypt is iets anders dan niets gevonden: hier valt er nog
          // niets te zeggen over resultaten.
          <p className="vtk-search-note">{query === "" ? t.prompt : t.tooShort}</p>
        ) : results.length === 0 ? (
          <section className="vtk-search-empty">
            <h2>{t.emptyTitle.replace("{query}", query)}</h2>
            <p>{t.emptyBody}</p>
            <div className="vtk-search-empty-links">
              <Link href={`${base}/kalender`} className="vtk-button-ghost">
                {t.emptyCalendar}
              </Link>
              <Link href={`${base}/info`} className="vtk-button-ghost">
                {t.emptyInfo}
              </Link>
            </div>
          </section>
        ) : (
          <>
            <p className="vtk-search-note" aria-live="polite">
              {summary}
            </p>
            {results.length >= RESULT_LIMIT ? (
              <p className="vtk-search-hint">
                {t.limited.replace("{count}", String(RESULT_LIMIT))}
              </p>
            ) : null}

            <ol className="vtk-search-results">
              {results.map((result) => (
                <li key={`${result.kind}:${result.id}`} className="vtk-search-result">
                  <span className="vtk-search-kind">{kindLabel(result.kind, t)}</span>
                  <h2>
                    {result.kind === "link" ? (
                      // Een andere site opent in een nieuw tabblad, net als elders.
                      <a href={result.href} target="_blank" rel="noopener noreferrer">
                        {result.title}
                      </a>
                    ) : (
                      <Link href={result.href}>{result.title}</Link>
                    )}
                  </h2>
                  {result.meta ? <p className="vtk-search-meta">{result.meta}</p> : null}
                  {result.snippet.length > 0 ? <Snippet parts={result.snippet} /> : null}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
