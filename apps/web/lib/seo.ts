import type { Metadata } from "next";
import { LOCALES, type Locale } from "@vtk/i18n";

/**
 * Eén plek voor de metadata van elke publieke pagina.
 *
 * De site draait op twee URL-vormen voor dezelfde inhoud: Nederlands leeft op de
 * root (`/kalender`) maar `/nl/kalender` rendert exact dezelfde pagina, want
 * `proxy.ts` laat een pad met taalvoorvoegsel gewoon door. Zonder canonical is
 * dat duplicate content over de hele site. Daarom leidt alles hier af van één
 * genormaliseerd pad: Nederlands krijgt de voorvoegselloze URL, Engels `/en/...`,
 * en beide vormen wijzen naar elkaar met hreflang.
 *
 * Gebruik dit vanuit `generateMetadata` of een `metadata`-export; schrijf geen
 * losse titel per pagina, anders lopen canonical en hreflang alsnog uiteen.
 */

export const SITE_NAME = "VTK";

/** Volledige naam, voor de plekken waar de afkorting te kaal is. */
export const SITE_LONG_NAME = "Vlaamse Technische Kring";

/**
 * Titelsjabloon van de site. Staat in de root layout, zodat een pagina enkel
 * haar eigen titel hoeft te zetten en `<title>` toch overal hetzelfde achtervoegsel
 * krijgt.
 */
export const SITE_TITLE_TEMPLATE = `%s · ${SITE_NAME}`;

export const SITE_DESCRIPTION =
  "De officiële website van VTK, de studentenvereniging van de faculteit ingenieurswetenschappen aan de KU Leuven.";

/**
 * Standaard deelbeeld. Ligt als bestandsconventie op `app/opengraph-image.jpg`,
 * dus Next bedient hem op dit pad en zet hem vanzelf op elke route die zelf geen
 * `openGraph.images` opgeeft. We verwijzen er hier ook expliciet naar: een pagina
 * die `openGraph` zet, vervangt dat hele object (Next merget ondiep), en dan valt
 * de bestandsconventie weg.
 */
export const DEFAULT_OG_IMAGE = "/opengraph-image.jpg";

/** Zoekresultaten kappen rond de 160 tekens af; langer schrijven is verspild werk. */
export const MAX_DESCRIPTION_LENGTH = 160;

/**
 * `og:locale` wil de vorm taal_LAND. Engels krijgt `en_GB` en niet `en_US`: het
 * publiek zijn internationale studenten in Europa.
 */
const OG_LOCALE: Record<Locale, string> = { nl: "nl_BE", en: "en_GB" };

/**
 * Hreflang gebruikt bewust de kale taalcode, terwijl `<html lang>` `nl-BE` zegt.
 * `hreflang="nl-BE"` betekent voor een zoekmachine "enkel Nederlandstaligen in
 * België"; wie vanuit Nederland zoekt valt dan buiten de match. De taal alleen is
 * de bredere en juistere signalering.
 */
const HREFLANG: Record<Locale, string> = { nl: "nl", en: "en" };

/** Publieke basis-URL van de site, zonder afsluitende slash. */
export function siteUrl(): string {
  const raw =
    process.env.VTK_MAIN_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** `metadataBase` voor de root layout; hiermee mogen relatieve paden in metadata. */
export function siteMetadataBase(): URL {
  return new URL(siteUrl());
}

/**
 * Het pad zonder taalvoorvoegsel en zonder afsluitende slash: de vorm waarin we
 * intern over een pagina praten. `/nl/kalender/` en `/en/kalender` worden allebei
 * `/kalender`.
 */
export function canonicalPath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  const withoutQuery = withSlash.split(/[?#]/)[0];
  const withoutLocale = withoutQuery.replace(
    new RegExp(`^/(?:${LOCALES.join("|")})(?=/|$)`),
    "",
  );
  const trimmed = withoutLocale.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Het pad zoals het in de adresbalk hoort te staan voor deze taal. */
export function localizedPath(path: string, locale: Locale): string {
  const base = canonicalPath(path);
  if (locale === "nl") return base;
  return base === "/" ? "/en" : `/en${base}`;
}

/** Absolute URL van een pagina in een bepaalde taal. */
export function localizedUrl(path: string, locale: Locale): string {
  return `${siteUrl()}${localizedPath(path, locale)}`;
}

/**
 * De hreflang-tabel voor een pagina: beide talen plus `x-default`. Die laatste
 * wijst naar het Nederlands, want dat is waar een bezoeker zonder taalvoorkeur
 * hoort te landen.
 */
export function hreflangAlternates(path: string): Record<string, string> {
  return {
    [HREFLANG.nl]: localizedUrl(path, "nl"),
    [HREFLANG.en]: localizedUrl(path, "en"),
    "x-default": localizedUrl(path, "nl"),
  };
}

/**
 * Maakt van vrije tekst een beschrijving: opmaakruis eruit, één spatie tussen de
 * woorden, en afgekapt op een woordgrens zodat er geen half woord in het
 * zoekresultaat staat.
 */
export function truncateDescription(
  text: string | null | undefined,
  max: number = MAX_DESCRIPTION_LENGTH,
): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = (lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?-]+$/, "");
  return `${body}…`;
}

export type BuildMetadataInput = {
  /** Titel van de pagina, zonder sitenaam: het sjabloon van de root layout plakt die eraan. */
  title: string;
  /** Wordt afgekapt op `MAX_DESCRIPTION_LENGTH`. Leeg = de sitebeschrijving. */
  description?: string | null;
  /** Pad van de pagina, met of zonder taalvoorvoegsel (`/kalender`, `/en/kalender`). */
  path: string;
  locale: Locale;
  /** Deelbeeld: een absolute URL of een pad op deze site. Leeg = het standaardbeeld. */
  image?: string | null;
  imageAlt?: string | null;
  /** `article` voor inhoud met een publicatiedatum (een pagina, een evenement). */
  type?: "website" | "article";
  publishedTime?: Date | string | null;
  modifiedTime?: Date | string | null;
  /** Zet op een pagina die niet in de zoekresultaten hoort (bestellingen, gated schermen). */
  noIndex?: boolean;
};

function isoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function absoluteImageUrl(image: string | null | undefined): string {
  const raw = image?.trim();
  if (!raw) return `${siteUrl()}${DEFAULT_OG_IMAGE}`;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${siteUrl()}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

/**
 * De metadata van één publieke pagina: titel, beschrijving, canonical, hreflang
 * en de OG-/Twitter-velden.
 *
 * Alle URL's komen er absoluut uit. Dat is niet strikt nodig (`metadataBase` zou
 * relatieve paden aanvullen), maar het maakt de uitkomst testbaar zonder dat we
 * Next's resolutie hoeven na te bootsen, en het houdt canonicals leesbaar in de
 * broncode van een pagina.
 */
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const { title, path, locale } = input;
  const description = truncateDescription(input.description || SITE_DESCRIPTION);
  const url = localizedUrl(path, locale);
  const image = absoluteImageUrl(input.image);
  const imageAlt = input.imageAlt?.trim() || title;
  const type = input.type ?? "website";
  const otherLocale: Locale = locale === "nl" ? "en" : "nl";

  const shared = {
    url,
    title,
    description,
    siteName: SITE_NAME,
    locale: OG_LOCALE[locale],
    alternateLocale: OG_LOCALE[otherLocale],
    images: [{ url: image, width: 1200, height: 630, alt: imageAlt }],
  };
  const openGraph: Metadata["openGraph"] =
    type === "article"
      ? {
          ...shared,
          type: "article",
          publishedTime: isoDate(input.publishedTime),
          modifiedTime: isoDate(input.modifiedTime),
        }
      : { ...shared, type: "website" };

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: hreflangAlternates(path),
    },
    openGraph,
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    ...(input.noIndex ? { robots: { index: false, follow: false } } : {}),
  };
}
