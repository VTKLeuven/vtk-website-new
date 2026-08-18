import type { Locale } from "@vtk/i18n";
import type { FieldValues } from "@/lib/frontpage/fields";

/**
 * What every front page component receives.
 *
 * The shared data (events, partners) is fetched once by `HomeEditorial` and
 * handed down, so a front page that wants the agenda does not open its own
 * database connection, and one that does not want it costs nothing.
 *
 * `values` holds only the fields that this particular front page declared in the
 * registry, already filtered to non-empty strings.
 */
export type FrontpageEvent = {
  id: string;
  start: Date;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  group: { nameNl: string; nameEn: string };
};

export type FrontpagePartner = {
  id: string;
  name: string;
  logoKey: string | null;
};

export type FrontpageProps = {
  values: FieldValues;
  locale: Locale;
  /** "" for Dutch, "/en" for English; prefix for internal links. */
  base: string;
  now: Date;
  upcomingEvents: FrontpageEvent[];
  partners: FrontpagePartner[];
};

/**
 * A link from a field: internal when it starts with "/" (and then it follows the
 * visitor's language), external otherwise. Returns null when either half is
 * missing, because a button without a destination is a dead button.
 */
export function ctaFrom(
  label: string | undefined,
  url: string | undefined,
  base: string,
): { label: string; href: string; external: boolean } | null {
  if (!label || !url) return null;
  if (/^https?:\/\//.test(url)) return { label, href: url, external: true };
  const path = url.startsWith("/") ? url : `/${url}`;
  return { label, href: `${base}${path}`, external: false };
}
