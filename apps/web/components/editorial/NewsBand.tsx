import Link from "@/components/ui/Link";
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  Images,
  Megaphone,
  Newspaper,
  Quote,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { isExternalUrl, withLocaleBase } from "@/lib/href";
import { NEWS_LETTER_LINES, composeNews, isFreshNews, type NewsSource } from "@/lib/news/rules";
import type { NewsEntry } from "@/lib/news/load";
import { newsSourceLabel } from "@/lib/news/labels";
import { NewsLetter } from "./NewsLetter";

import "@/app/design/vtk-news.css";

/**
 * De Nieuws-band op de homepage, tussen de donkere zone en de openingsuren.
 *
 * Eén uitgelicht bericht links, de rest als register ernaast: soort, titel en
 * één regel. Welke berichten erin staan en welk er uitgelicht wordt, beslist
 * `lib/news/rules.ts`; dit bestand tekent enkel. Zonder berichten tekent het
 * niets, en dan sluiten de openingsuren weer aan op de snelle links.
 */

const ICONS: Record<NewsSource, LucideIcon> = {
  notice: Megaphone,
  praeses: Quote,
  tickets: Ticket,
  signup: ClipboardCheck,
  bakske: Newspaper,
  irreeel: BookOpen,
  album: Images,
};

/** Een pad op de site krijgt het taalvoorvoegsel; een pdf-route en een extern adres niet. */
export function newsHref(href: string, base: string): string {
  if (href.startsWith("/api/")) return href;
  return withLocaleBase(href, base);
}

/** Een link naar binnen of naar buiten, met dezelfde klasse. */
export function NewsLink({
  href,
  base,
  className,
  style,
  children,
}: {
  href: string;
  base: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const target = newsHref(href, base);
  if (isExternalUrl(target) || target.startsWith("/api/")) {
    return (
      <a className={className} style={style} href={target} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={className} style={style} href={target}>
      {children}
    </Link>
  );
}

function newsDate(date: string, locale: Locale): string {
  return new Date(date)
    .toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
      timeZone: "Europe/Brussels",
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replace(/\./g, "");
}

function datePin(date: string, locale: Locale) {
  const d = new Date(date);
  const tag = locale === "nl" ? "nl-BE" : "en-GB";
  const part = (options: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString(tag, { timeZone: "Europe/Brussels", ...options }).replace(/\./g, "");
  return (
    <span className="news-pin" aria-hidden="true">
      <small>{part({ weekday: "short" })}</small>
      <b>{part({ day: "numeric" })}</b>
      <small>{part({ month: "short" })}</small>
    </span>
  );
}

/** De soortkleur als CSS-variabele; de kleuren zelf staan in vtk-news.css. */
export function newsTypeStyle(source: NewsSource): CSSProperties {
  return { "--news-type": `var(--news-${source})` } as CSSProperties;
}

/** Soort, datum en eventueel "Nieuw": de regel boven elke titel. */
export function NewsKicker({
  entry,
  locale,
  now,
  icon = true,
}: {
  entry: NewsEntry;
  locale: Locale;
  now: Date;
  icon?: boolean;
}) {
  const Icon = ICONS[entry.source];
  return (
    <div className="news-kick">
      <span className="news-type">
        {icon ? <Icon size={14} aria-hidden="true" /> : null}
        {newsSourceLabel(entry.source, locale)}
      </span>
      <time dateTime={entry.date}>{newsDate(entry.date, locale)}</time>
      {isFreshNews(entry.date, now) ? (
        <span className="news-new">{locale === "nl" ? "Nieuw" : "New"}</span>
      ) : null}
    </div>
  );
}

function Initials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return <span className="news-avatar">{initials}</span>;
}

export function NewsAuthor({ author }: { author: NonNullable<NewsEntry["author"]> }) {
  return (
    <div className="news-who">
      {author.imageUrl ? (
        // Een upload uit de eigen /api/media-route, vierkant bijgesneden.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="news-avatar" src={author.imageUrl} alt="" />
      ) : (
        <Initials name={author.name} />
      )}
      <div>
        <b>{author.name}</b>
        {author.role ? <span>{author.role}</span> : null}
      </div>
    </div>
  );
}

function Featured({
  entry,
  locale,
  base,
  now,
}: {
  entry: NewsEntry;
  locale: Locale;
  base: string;
  now: Date;
}) {
  const nl = locale === "nl";
  const style = newsTypeStyle(entry.source);

  if (entry.source === "praeses") {
    return (
      <article className="news-feat is-letter" style={style}>
        <div className="news-feat-body">
          <Quote className="news-quote" size={30} aria-hidden="true" />
          <NewsKicker entry={entry} locale={locale} now={now} icon={false} />
          <h3 className="news-title">{entry.title}</h3>
          <NewsLetter
            lines={NEWS_LETTER_LINES}
            labels={{
              more: nl ? "Lees de hele brief" : "Read the whole letter",
              less: nl ? "Minder tonen" : "Show less",
            }}
          >
            <Markdown locale={locale}>{entry.body ?? ""}</Markdown>
          </NewsLetter>
          <div className="news-feat-foot">
            {entry.author ? <NewsAuthor author={entry.author} /> : <span />}
            {entry.ctaHref ? (
              <NewsLink href={entry.ctaHref} base={base} className="news-go">
                {entry.ctaLabel} <ArrowRight size={15} aria-hidden="true" />
              </NewsLink>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={`news-feat${entry.imageUrl ? "" : " is-plain"}`} style={style}>
      {entry.imageUrl ? (
        <div className="news-feat-media">
          {/* Posters en albumcovers komen uit de eigen media-routes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.imageUrl} alt="" />
          {datePin(entry.date, locale)}
        </div>
      ) : null}
      <div className="news-feat-body">
        <NewsKicker entry={entry} locale={locale} now={now} />
        <h3 className="news-title">
          <NewsLink href={entry.href} base={base} className="news-feat-link">
            {entry.title}
          </NewsLink>
        </h3>
        <p className="news-excerpt">{entry.line}</p>
        <div className="news-feat-foot">
          <span />
          <NewsLink href={entry.ctaHref ?? entry.href} base={base} className="news-go is-primary">
            {entry.ctaLabel} <ArrowRight size={15} aria-hidden="true" />
          </NewsLink>
        </div>
      </div>
    </article>
  );
}

export function NewsRow({
  entry,
  locale,
  base,
  now,
}: {
  entry: NewsEntry;
  locale: Locale;
  base: string;
  now: Date;
}) {
  const Icon = ICONS[entry.source];
  return (
    <NewsLink href={entry.href} base={base} className="news-row" style={newsTypeStyle(entry.source)}>
      <span className="news-ico">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="news-row-text">
        <NewsKicker entry={entry} locale={locale} now={now} icon={false} />
        <b>{entry.title}</b>
        <span className="news-row-line">{entry.line}</span>
      </span>
      <ArrowRight className="news-row-arrow" size={16} aria-hidden="true" />
    </NewsLink>
  );
}

export function NewsBand({
  entries,
  count,
  locale,
  base,
  now,
}: {
  entries: NewsEntry[];
  count: number;
  locale: Locale;
  base: string;
  now: Date;
}) {
  const { featured, rest } = composeNews(entries, count);
  if (!featured) return null;
  const nl = locale === "nl";

  return (
    <section className="news-band" aria-labelledby="news-band-title">
      <div className="sec-head">
        <h2 id="news-band-title">{nl ? "Nieuws." : "News."}</h2>
        <div className="meta">
          <Link href={`${base}/nieuws`}>{nl ? "Alle berichten" : "All news"}</Link>
        </div>
      </div>
      <div className={`news-grid${rest.length ? "" : " is-solo"}`}>
        <Featured entry={featured} locale={locale} base={base} now={now} />
        {rest.length ? (
          <ol className="news-list">
            {rest.map((entry) => (
              <li key={entry.key}>
                <NewsRow entry={entry} locale={locale} base={base} now={now} />
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
