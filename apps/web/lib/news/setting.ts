import {
  NEWS_AUTO_SOURCES,
  NEWS_COUNT_DEFAULT,
  NEWS_COUNT_MAX,
  NEWS_COUNT_MIN,
  type NewsAutoSource,
} from "./rules";

/**
 * De instelling van de Nieuws-band: staat ze aan, hoeveel berichten, en welke
 * automatische bronnen er in mogen. Beheer via /admin/nieuws.
 */
export const NEWS_SETTING = "home.news";

export type NewsSetting = {
  enabled: boolean;
  count: number;
  sources: Record<NewsAutoSource, boolean>;
};

/**
 * Een site die er nog nooit iets aan instelde, toont de band met alle bronnen:
 * zonder berichten valt hij toch vanzelf weg.
 */
export function defaultNewsSetting(): NewsSetting {
  return {
    enabled: true,
    count: NEWS_COUNT_DEFAULT,
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
  const count =
    typeof record.count === "number" && Number.isInteger(record.count)
      ? Math.min(NEWS_COUNT_MAX, Math.max(NEWS_COUNT_MIN, record.count))
      : base.count;
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
    count,
    sources,
  };
}
