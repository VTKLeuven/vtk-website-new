import Link from "@/components/ui/Link";
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@vtk/i18n";
import { ArrowRight } from "lucide-react";
import { Markdown } from "@/components/ui/Markdown";
import { isExternalUrl, withLocaleBase } from "@/lib/href";
import { magazineEventName, umamiEvent } from "@/lib/analytics";
import { NEWS_LETTER_LINES, composeNews, isFreshNews, type NewsSource } from "@/lib/news/rules";
import type { NewsEntry } from "@/lib/news/load";
import { newsSourceLabel } from "@/lib/news/labels";
import { NewsCarousel } from "./NewsCarousel";
import { NewsLetter } from "./NewsLetter";

import "@/app/design/vtk-eventcard.css";
import "@/app/design/vtk-news.css";

/**
 * De Nieuws-band op de homepage, tussen de donkere zone en de openingsuren.
 *
 * Links het uitgelichte bericht, meestal het woordje van de praeses als brief;
 * rechts de rest als de eventtegel van de kalender (`vtk-eventcard.css`), in een
 * carrousel die per tegel doorschuift. Welke berichten erin staan en welk er
 * uitgelicht wordt, beslist `lib/news/rules.ts`; dit bestand tekent enkel.
 * Zonder berichten tekent het niets, en dan sluiten de openingsuren weer aan op
 * de snelle links.
 *
 * De soort van een bericht is een woord, geen kleur en geen icoon: een
 * gekleurde tegel per soort kwam nergens anders op de site terug. Zie
 * docs/design-decisions.md.
 */

/** Een pad op de site krijgt het taalvoorvoegsel; een pdf-route en een extern adres niet. */
export function newsHref(href: string, base: string): string {
  if (href.startsWith("/api/")) return href;
  return withLocaleBase(href, base);
}

/**
 * Een nummer van het Bakske of IrReëel opent vanuit het nieuws rechtstreeks de
 * pdf, buiten de lezer op /media om, en telde daardoor niet mee. Met dezelfde
 * gebeurtenis en dezelfde gegevens als daar (zie `trackMagazineView`) komt het
 * vanzelf in de cijfers in /admin/media; `vanaf` houdt het onderscheid.
 */
export function magazineTracking(source: NewsSource, ref: string): Record<string, string> | undefined {
  if (source !== "bakske" && source !== "irreeel") return undefined;
  const kind = source === "bakske" ? "bakske" : "ir-reeel";
  return umamiEvent(magazineEventName(kind, "bekeken"), {
    publicatie: kind,
    nummer: ref,
    vanaf: "nieuws",
  });
}

function newsTracking(entry: NewsEntry): Record<string, string> | undefined {
  return magazineTracking(entry.source, entry.ref);
}

/** Een link naar binnen of naar buiten, met dezelfde klasse. */
export function NewsLink({
  href,
  base,
  className,
  style,
  tracking,
  ariaHidden,
  children,
}: {
  href: string;
  base: string;
  className?: string;
  style?: CSSProperties;
  /** Umami-attributen, uit `umamiEvent`. */
  tracking?: Record<string, string>;
  /** Een tweede link naar dezelfde plek: niet nog eens voorlezen, niet nog eens tabben. */
  ariaHidden?: boolean;
  children: ReactNode;
}) {
  const target = newsHref(href, base);
  const hidden = ariaHidden ? { "aria-hidden": true, tabIndex: -1 } : {};
  if (isExternalUrl(target) || target.startsWith("/api/")) {
    return (
      <a
        className={className}
        style={style}
        href={target}
        target="_blank"
        rel="noopener noreferrer"
        {...hidden}
        {...tracking}
      >
        {children}
      </a>
    );
  }
  return (
    <Link className={className} style={style} href={target} {...hidden} {...tracking}>
      {children}
    </Link>
  );
}

function dateTag(locale: Locale): string {
  return locale === "nl" ? "nl-BE" : "en-GB";
}

export function newsDate(date: string, locale: Locale): string {
  return new Date(date)
    .toLocaleDateString(dateTag(locale), {
      timeZone: "Europe/Brussels",
      weekday: "short",
      day: "numeric",
      month: "short",
    })
    .replace(/\./g, "");
}

/** Weekdag, dag en maand in Brussel, zoals de datumpin ze draagt. */
export function pinParts(date: string, locale: Locale) {
  const d = new Date(date);
  const part = (options: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString(dateTag(locale), { timeZone: "Europe/Brussels", ...options }).replace(/\./g, "");
  return {
    weekday: part({ weekday: "short" }),
    day: part({ day: "numeric" }),
    month: part({ month: "short" }),
  };
}

/** De gele datumpin van de eventtegel, hangend over de onderrand van de foto. */
function CardPin({ date, locale }: { date: string; locale: Locale }) {
  const { weekday, day, month } = pinParts(date, locale);
  return (
    <span className="ev-card-pin" aria-hidden="true">
      <i>{weekday}</i>
      <b>{day}</b>
      <i>{month}</i>
    </span>
  );
}

/** Soort, datum en eventueel "Nieuw": de regel boven een titel. */
export function NewsKicker({
  entry,
  locale,
  now,
  date = true,
}: {
  entry: NewsEntry;
  locale: Locale;
  now: Date;
  /** Uit wanneer een datumpin de datum al draagt. */
  date?: boolean;
}) {
  return (
    <div className="news-kick">
      <span className="news-kind">{newsSourceLabel(entry.source, locale)}</span>
      {date ? (
        <time dateTime={entry.shownDate ?? entry.date}>
          {newsDate(entry.shownDate ?? entry.date, locale)}
        </time>
      ) : null}
      {isFreshNews(entry.date, now) ? (
        <span className="news-new">{locale === "nl" ? "Nieuw" : "New"}</span>
      ) : null}
    </div>
  );
}

export function newsInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function NewsAuthor({ author }: { author: NonNullable<NewsEntry["author"]> }) {
  return (
    <div className="news-who">
      {author.imageUrl ? (
        // Een upload uit de eigen /api/media-route, vierkant bijgesneden.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="news-avatar" src={author.imageUrl} alt="" />
      ) : (
        <span className="news-avatar" aria-hidden="true">
          {newsInitials(author.name)}
        </span>
      )}
      <div>
        <b>{author.name}</b>
        {author.role ? <span>{author.role}</span> : null}
      </div>
    </div>
  );
}

/**
 * Het woordje van de praeses als brief: wie schrijft, de titel, en de eerste
 * negen regels met "Lees de hele brief" om de rest ter plekke te openen.
 */
function FeaturedLetter({
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
  return (
    <article className="news-feat is-letter">
      <div className="news-feat-body">
        {entry.author ? (
          <div className="news-letter-head">
            <NewsAuthor author={entry.author} />
            <time dateTime={entry.date}>{newsDate(entry.date, locale)}</time>
          </div>
        ) : (
          <NewsKicker entry={entry} locale={locale} now={now} />
        )}
        <h3 className="news-title">
          <NewsLink href={entry.href} base={base} className="news-title-link">
            {entry.title}
          </NewsLink>
        </h3>
        <NewsLetter
          lines={NEWS_LETTER_LINES}
          labels={{
            more: nl ? "Lees de hele brief" : "Read the whole letter",
            less: nl ? "Minder tonen" : "Show less",
          }}
        >
          <Markdown locale={locale}>{entry.body ?? ""}</Markdown>
        </NewsLetter>
        {entry.ctaHref ? (
          <div className="news-feat-foot">
            <NewsLink href={entry.ctaHref} base={base} className="news-go">
              {entry.ctaLabel} <ArrowRight size={15} aria-hidden="true" />
            </NewsLink>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Elk ander uitgelicht bericht: de foto met de pin, en een echte knop. */
function FeaturedPost({
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
  return (
    <article className={`news-feat${entry.imageUrl ? "" : " is-plain"}`}>
      {entry.imageUrl ? (
        <div className="news-feat-media">
          {/* Posters en albumcovers komen uit de eigen media-routes. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={entry.imageUrl} alt="" />
          <CardPin date={entry.shownDate ?? entry.date} locale={locale} />
        </div>
      ) : null}
      <div className="news-feat-body">
        <NewsKicker entry={entry} locale={locale} now={now} date={!entry.imageUrl} />
        <h3 className="news-title">
          <NewsLink href={entry.href} base={base} className="news-feat-link" tracking={newsTracking(entry)}>
            {entry.title}
          </NewsLink>
        </h3>
        <p className="news-excerpt">{entry.line}</p>
        <div className="news-feat-foot">
          <NewsLink
            href={entry.ctaHref ?? entry.href}
            base={base}
            className="news-go is-primary"
            tracking={newsTracking(entry)}
          >
            {entry.ctaLabel} <ArrowRight size={15} aria-hidden="true" />
          </NewsLink>
        </div>
      </div>
    </article>
  );
}

/** De korte knop op een tegel; de lange (`ctaLabel`) staat in de uitgelichte kaart. */
function tileAction(entry: NewsEntry, nl: boolean): string {
  switch (entry.source) {
    case "tickets":
      return "Tickets";
    case "signup":
      return entry.ctaLabel;
    case "album":
      return nl ? "Bekijk" : "View";
    case "notice":
      return entry.ctaHref ? entry.ctaLabel : nl ? "Lezen" : "Read";
    default:
      return nl ? "Lezen" : "Read";
  }
}

/**
 * Eén bericht als eventtegel: dezelfde kaart als op /kalender en in de band
 * "Aankomende evenementen", uit hetzelfde stylesheet. Een bericht zonder foto
 * krijgt het streepjesvlak, zoals overal waar een foto ontbreekt.
 */
function NewsTile({
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
  const tracking = newsTracking(entry);
  // Gaat de knop ergens anders heen dan de titel (een externe inschrijflink),
  // dan is het een echte link; anders een tweede ingang naar dezelfde plek.
  const ownTarget = Boolean(entry.ctaHref && entry.ctaHref !== entry.href);
  return (
    <article className="ev-card news-tile">
      <div className={`ev-card-shot${entry.imageUrl ? "" : " is-blank"}`}>
        {entry.imageUrl ? (
          // Posters en albumcovers komen uit de eigen media-routes.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.imageUrl} alt="" loading="lazy" />
        ) : null}
        <CardPin date={entry.shownDate ?? entry.date} locale={locale} />
      </div>
      <div className="ev-card-body">
        <div className="ev-card-tags">
          <NewsKicker entry={entry} locale={locale} now={now} date={false} />
        </div>
        <h3 className="ev-card-title">
          <NewsLink href={entry.href} base={base} className="ev-card-link" tracking={tracking}>
            {entry.title}
          </NewsLink>
        </h3>
        <div className="ev-card-foot">
          <span className="ev-card-when">{entry.place || entry.line}</span>
          <span className="ev-card-actions">
            <NewsLink
              href={ownTarget ? entry.ctaHref! : entry.href}
              base={base}
              className="news-go is-small"
              tracking={tracking}
              ariaHidden={!ownTarget}
            >
              {tileAction(entry, nl)}
            </NewsLink>
          </span>
        </div>
      </div>
    </article>
  );
}

/**
 * Een regel op /nieuws: de datumpin, soort, titel en één regel, en rechts een
 * klein beeld. De pin is geel voor een dag die nog moet komen (het evenement
 * van een ticketverkoop of inschrijving) en grijs voor een datum die voorbij
 * is, zoals een afgelopen event op /kalender terugtreedt.
 */
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
  const shown = entry.shownDate ?? entry.date;
  const { weekday, day, month } = pinParts(shown, locale);
  const ahead = new Date(shown) > now;
  return (
    <NewsLink href={entry.href} base={base} className="news-row" tracking={newsTracking(entry)}>
      <span className={`news-pin${ahead ? "" : " is-muted"}`} aria-hidden="true">
        <small>{weekday}</small>
        <b>{day}</b>
        <small>{month}</small>
      </span>
      <span className="news-row-text">
        <NewsKicker entry={entry} locale={locale} now={now} />
        <b>{entry.title}</b>
        <span className="news-row-line">{entry.line}</span>
      </span>
      <span className={`news-thumb${entry.imageUrl ? "" : " is-blank"}`} aria-hidden="true">
        {entry.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.imageUrl} alt="" loading="lazy" />
        ) : null}
      </span>
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
  const Featured = featured.source === "praeses" ? FeaturedLetter : FeaturedPost;

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
          <NewsCarousel
            items={rest.map((entry) => (
              <NewsTile key={entry.key} entry={entry} locale={locale} base={base} now={now} />
            ))}
            labels={{
              region: nl ? "Meer nieuws" : "More news",
              prev: nl ? "Vorig bericht" : "Previous post",
              next: nl ? "Volgend bericht" : "Next post",
              pause: nl ? "Pauzeren" : "Pause",
              play: nl ? "Automatisch doorschuiven" : "Play",
              slide: nl ? "{n} van {total}" : "{n} of {total}",
            }}
          />
        ) : null}
      </div>
    </section>
  );
}
