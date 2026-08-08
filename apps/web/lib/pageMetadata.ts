import type { Metadata } from "next";
import { getDictionary, pick, type Dictionary, type Locale } from "@vtk/i18n";
import { markdownToPlainText } from "@/lib/markdown";
import { buildMetadata } from "@/lib/seo";

/**
 * De afleidingen achter `generateMetadata` op de publieke routes.
 *
 * Alles hier is puur: geen database, geen `headers()`. De routes halen hun rij
 * op (via de gedeelde loaders in `lib/pageQueries.ts`, zodat de pagina en haar
 * metadata één query delen) en geven ze hier binnen. Zo blijft de afleiding
 * "welke titel, welke beschrijving, welk deelbeeld" te testen zonder Next.
 *
 * Alle metadata loopt via `buildMetadata()` uit `lib/seo.ts`; schrijf nergens
 * een losse titel, anders lopen canonical en hreflang alsnog uiteen.
 */

// -----------------------------------------------------------------------------
// Vaste routes
// -----------------------------------------------------------------------------

/** Sleutel in de `seo`-namespace van de dictionaries. */
export type SeoKey = keyof Dictionary["seo"];

/**
 * Metadata van een route met een vaste titel (`/kalender`, `/praesidium`, ...).
 * Titel en beschrijving komen uit de dictionaries, zodat de Engelse versie niet
 * per pagina opnieuw uitgevonden wordt.
 */
export function staticMetadata(
  key: SeoKey,
  path: string,
  locale: Locale,
  options: { noIndex?: boolean } = {},
): Metadata {
  const entry = getDictionary(locale).seo[key];
  return buildMetadata({
    title: entry.title,
    description: entry.description,
    path,
    locale,
    noIndex: options.noIndex,
  });
}

// -----------------------------------------------------------------------------
// Afbeeldingen uit de inhoud
// -----------------------------------------------------------------------------

export type ContentImage = { src: string; alt: string };

/** Markdown zonder de afgebakende codeblokken; een `![](...)` daarin is geen beeld. */
function withoutCodeFences(markdown: string): string {
  return markdown.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
}

/**
 * Het eerste beeld in een markdown-document. Vangt zowel `![alt](/foo.jpg)` als
 * de vorm met een titel erachter (`![alt](/foo.jpg "Bijschrift")`) en de
 * spitshaken van een pad met spaties erin.
 */
export function firstImageFromMarkdown(
  markdown: string | null | undefined,
): ContentImage | null {
  if (!markdown) return null;
  const match = /!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\s*\)/.exec(
    withoutCodeFences(markdown),
  );
  if (!match) return null;
  const src = match[2].trim();
  if (!src) return null;
  return { src, alt: match[1].trim() };
}

/**
 * Hetzelfde voor de legacy tiptap-documenten: een pagina die nog nooit in de
 * markdown-editor opgeslagen is, heeft haar beelden enkel daar staan.
 */
export function firstImageFromTiptap(doc: unknown): ContentImage | null {
  if (!doc || typeof doc !== "object") return null;
  const node = doc as {
    type?: unknown;
    attrs?: { src?: unknown; alt?: unknown };
    content?: unknown;
  };

  if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src.trim()) {
    return {
      src: node.attrs.src.trim(),
      alt: typeof node.attrs.alt === "string" ? node.attrs.alt.trim() : "",
    };
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const found = firstImageFromTiptap(child);
      if (found) return found;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Contentpagina's (/p/[slug] en /[headerSlug]/[pageSlug])
// -----------------------------------------------------------------------------

/** De velden van een `Page` die de metadata nodig heeft. */
export type MetadataPage = {
  titleNl: string;
  titleEn: string | null;
  excerptNl: string | null;
  excerptEn: string | null;
  contentMdNl: string | null;
  contentMdEn: string | null;
  contentJsonNl: unknown;
  contentJsonEn: unknown;
  publishedAt: Date | null;
  contentEditedAt: Date | null;
};

/**
 * De taalversie die de bezoeker te zien krijgt. Exact dezelfde terugval als in
 * `PageView`: markdown is de bron van waarheid, en een taal zonder eigen versie
 * valt terug op het Nederlands. Zou dit afwijken, dan beschrijft de metadata een
 * andere tekst dan er op het scherm staat.
 */
function shownContent(page: MetadataPage, locale: Locale): { markdown: string | null; json: unknown } {
  if (locale === "en") {
    if (page.contentMdEn !== null) return { markdown: page.contentMdEn, json: null };
    if (page.contentJsonEn) return { markdown: null, json: page.contentJsonEn };
  }
  if (page.contentMdNl !== null) return { markdown: page.contentMdNl, json: null };
  return { markdown: null, json: page.contentJsonNl };
}

export function pageTitle(page: MetadataPage, locale: Locale): string {
  return pick(page.titleNl, page.titleEn, locale);
}

/**
 * De beschrijving van een contentpagina: het excerpt wanneer de redactie er een
 * schreef, anders de eerste zinnen van de tekst zelf. Een pagina zonder excerpt
 * hoort geen kale sitebeschrijving in Google te krijgen.
 */
export function pageDescription(page: MetadataPage, locale: Locale): string {
  const excerpt = pick(page.excerptNl ?? "", page.excerptEn ?? "", locale).trim();
  if (excerpt) return excerpt;

  const { markdown } = shownContent(page, locale);
  return markdown ? markdownToPlainText(markdown) : "";
}

/** Het eerste beeld uit de getoonde taalversie, of `null` voor het standaardbeeld. */
export function pageImage(page: MetadataPage, locale: Locale): ContentImage | null {
  const { markdown, json } = shownContent(page, locale);
  return markdown !== null ? firstImageFromMarkdown(markdown) : firstImageFromTiptap(json);
}

export function contentPageMetadata(
  page: MetadataPage,
  locale: Locale,
  path: string,
): Metadata {
  const image = pageImage(page, locale);
  return buildMetadata({
    title: pageTitle(page, locale),
    description: pageDescription(page, locale),
    path,
    locale,
    image: image?.src,
    imageAlt: image?.alt || null,
    type: "article",
    publishedTime: page.publishedAt,
    modifiedTime: page.contentEditedAt ?? page.publishedAt,
  });
}

// -----------------------------------------------------------------------------
// Kalender
// -----------------------------------------------------------------------------

export type MetadataEvent = {
  titleNl: string;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  updatedAt: Date;
};

/** De datum zoals ze in een zoekresultaat leest: "zaterdag 14 maart 2026, 20:00". */
export function eventDateLine(event: MetadataEvent, locale: Locale): string {
  const dateLocale = locale === "nl" ? "nl-BE" : "en-GB";
  const day = event.start.toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (event.allDay) return `${day}, ${locale === "nl" ? "hele dag" : "all day"}`;
  const time = event.start.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

/**
 * De beschrijving van een evenement begint met de datum: in een zoekresultaat of
 * een deelvoorbeeld is "wanneer" het eerste wat iemand wil weten.
 */
export function eventDescription(event: MetadataEvent, locale: Locale): string {
  const body = markdownToPlainText(
    pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale),
  );
  const date = eventDateLine(event, locale);
  return body ? `${date} · ${body}` : date;
}

export function eventMetadata(
  event: MetadataEvent,
  locale: Locale,
  path: string,
  image: string | null,
): Metadata {
  const title = pick(event.titleNl, event.titleEn, locale);
  return buildMetadata({
    title,
    description: eventDescription(event, locale),
    path,
    locale,
    image,
    imageAlt: title,
    type: "article",
    modifiedTime: event.updatedAt,
  });
}
