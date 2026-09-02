import Link from "next/link";
import type { Locale } from "@vtk/i18n";
import type { FieldValues } from "@/lib/frontpage/fields";
import type { HeroWeekPlacement } from "@/lib/calendar/heroWeek";

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
  /** De URL-naam voor `/kalender/<slug>`; de id blijft de sleutel voor de ster. */
  slug: string;
  start: Date;
  /** Een heledagevenement toont "hele dag" in plaats van een uur. */
  allDay: boolean;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  group: { nameNl: string; nameEn: string };
  /**
   * Hoeveel mensen aanduidden dat ze komen, of `null` zolang het er te weinig
   * zijn. De drempel zit in `lib/calendar/interest.ts`: onder een bepaald aantal
   * leest een getal als "hier komt niemand" en houdt het precies de mensen weg
   * die het had moeten overtuigen.
   */
  interestedCount: number | null;
  /**
   * De kleur van de eerste categorie, voor de stip in het weekoverzicht. Zo
   * draagt een evenement op de homepage dezelfde kleurcode als in de kalender.
   */
  categoryColour: string | null;
  /** Voorrang of uitsluiting in het weekoverzicht; zie lib/calendar/heroWeek.ts. */
  heroWeek: HeroWeekPlacement;
  /**
   * Of de bezoeker zelf al aanduidde dat hij komt. Zonder aanmelding altijd
   * `false`: de ster vraagt dan eerst om aan te melden.
   */
  viewerInterested: boolean;
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
  /**
   * Dezelfde evenementen, maar vanaf het begin van gisteren, voor het
   * weekoverzicht. Apart van `upcomingEvents` omdat dat overal elders "wat er
   * nog komt" betekent, en een front page die een lijst toont geen evenement van
   * gisteren hoort te tonen. Zie lib/calendar/heroWeek.ts.
   */
  weekEvents: FrontpageEvent[];
  /** Of er iemand aangemeld is. De ster van het weekoverzicht hangt eraan. */
  signedIn: boolean;
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

/**
 * One button, rendered the same way by every front page.
 *
 * Shared rather than repeated, because repeating it is how the front pages came
 * to disagree: two of them sent an external URL through a plain `<a>` while the
 * default handed everything to `<Link>`, which is meant for routes inside this
 * app. Now that any of these links is admin-editable, whichever component
 * someone copies next would have inherited whichever half they copied.
 *
 * No `target="_blank"`: the homepage's own external CTAs (the VTK Career
 * buttons) stay in the tab, and a hero button is a main route through the site,
 * not a footnote.
 */
export function Cta({
  cta,
  className,
}: {
  cta: { label: string; href: string; external: boolean } | null;
  className: string;
}) {
  if (!cta) return null;
  if (cta.external) {
    return (
      <a href={cta.href} className={className}>
        {cta.label}
      </a>
    );
  }
  return (
    <Link href={cta.href} className={className}>
      {cta.label}
    </Link>
  );
}
