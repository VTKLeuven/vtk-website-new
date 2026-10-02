import { NEWS_AUTO_SOURCES, isNewsAutoSource, type NewsAutoSource } from "./rules";

/**
 * De instelling van de Nieuws-band: staat ze aan, en welke automatische bronnen
 * er in mogen. Beheer via /admin/nieuws.
 *
 * Er stond ook een aantal berichten in (3 tot 8). Dat is weg: de tegels staan in
 * een carrousel, dus er is geen plaats die volloopt, en een maximum liet enkel
 * berichten vallen die wel in het nieuws hoorden ("Band vol"). Een opgeslagen
 * `count` wordt genegeerd.
 */
export const NEWS_SETTING = "home.news";

export type NewsSetting = {
  enabled: boolean;
  sources: Record<NewsAutoSource, boolean>;
};

/**
 * Een site die er nog nooit iets aan instelde, toont de band met alle bronnen:
 * zonder berichten valt hij toch vanzelf weg.
 */
export function defaultNewsSetting(): NewsSetting {
  return {
    enabled: true,
    sources: Object.fromEntries(NEWS_AUTO_SOURCES.map((source) => [source, true])) as Record<
      NewsAutoSource,
      boolean
    >,
  };
}

/** Leest de opgeslagen instelling; wat ontbreekt of niet klopt, wordt de standaard. */
export function readNewsSetting(value: unknown): NewsSetting {
  const base = defaultNewsSetting();
  if (typeof value !== "object" || value === null || Array.isArray(value)) return base;
  const record = value as Record<string, unknown>;
  const rawSources =
    typeof record.sources === "object" && record.sources !== null && !Array.isArray(record.sources)
      ? (record.sources as Record<string, unknown>)
      : {};
  const sources = { ...base.sources };
  for (const source of NEWS_AUTO_SOURCES) {
    if (typeof rawSources[source] === "boolean") sources[source] = rawSources[source] as boolean;
  }
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : base.enabled,
    sources,
  };
}

/**
 * Welk automatisch bericht de redactie uitlichtte, bv. een ticketverkoop die een
 * duwtje nodig heeft. Een zelfgeschreven bericht draagt dat in
 * `NewsPost.featured`; de actions houden de twee exclusief, zodat er hoogstens
 * één keuze tegelijk bestaat.
 *
 * Een eigen sleutel en niet in `home.news`: dat formulier schrijft zijn waarde
 * in één keer weg en zou de keuze bij elk opslaan wissen.
 */
export const NEWS_FEATURED_SETTING = "home.news.featured";

export type NewsFeaturedPick = { source: NewsAutoSource; ref: string };

/** Leest de opgeslagen keuze; wat niet klopt, is geen keuze. */
export function readNewsFeatured(value: unknown): NewsFeaturedPick | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { source, ref } = value as Record<string, unknown>;
  if (typeof source !== "string" || !isNewsAutoSource(source)) return null;
  if (typeof ref !== "string" || ref === "") return null;
  return { source, ref };
}
