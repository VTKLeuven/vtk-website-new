import { normalizeLocale, type Locale } from "@/lib/locale";
import type { FeedScope } from "./feeds";

/**
 * Agenda-clients hangen graag een `.ics` aan de URL, en sommige tonen de feed
 * anders niet. De suffix is puur cosmetisch, dus zowel `/feed/c/eerstejaars` als
 * `/feed/c/eerstejaars.ics` moeten dezelfde kalender geven.
 */
export function stripIcsSuffix(value: string): string {
  return value.replace(/\.ics$/i, "");
}

/** Taal van een feed via `?lang=`; alles wat geen geldige locale is, valt terug op NL. */
export function feedLocale(url: URL): Locale {
  return normalizeLocale(url.searchParams.get("lang"));
}

/**
 * Een publieke feed mag een kwartier gecachet worden: clients pollen toch maar om
 * de paar uur, en een wijziging in de admin hoeft niet binnen de seconde door te
 * komen. Persoonlijke feeds dragen een geheim in de URL en mogen nergens blijven
 * hangen, ook niet in een tussenliggende proxy.
 */
export function icsResponse(
  body: string,
  filename: string,
  options: { private?: boolean; download?: boolean } = {},
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `${options.download ? "attachment" : "inline"}; filename="${filename}"`,
  };

  if (options.private) {
    headers["Cache-Control"] = "private, no-store";
    headers["X-Robots-Tag"] = "noindex";
  } else {
    headers["Cache-Control"] = "public, max-age=900";
  }

  return new Response(body, { headers });
}

/**
 * De scope van de hoofdfeed, uit de query.
 *
 * - niets: alles, zoals altijd;
 * - `?c=alumni`: enkel die categorie;
 * - `?c=alumni&algemeen=1`: de algemene evenementen plus die categorie;
 * - `?c=sport&c=cultuur`: die twee categorieën samen.
 *
 * De parameters zitten bewust in de bestaande feed-URL en niet in een nieuw pad.
 * Een agenda-abonnement is een URL die jaren in iemands telefoon blijft staan;
 * hoe minder verschillende vormen daarvan rondzwerven, hoe minder er ooit stil
 * kapotgaat. `/feed/c/<slug>.ics` blijft bestaan voor wie zich al abonneerde.
 */
export function feedScopeFromQuery(url: URL): FeedScope {
  const slugs = [...new Set(url.searchParams.getAll("c").map(stripIcsSuffix).filter(Boolean))];
  const includeGeneral = url.searchParams.get("algemeen") === "1";
  if (slugs.length === 0 && !includeGeneral) return { kind: "all" };
  return { kind: "mix", slugs, includeGeneral };
}
