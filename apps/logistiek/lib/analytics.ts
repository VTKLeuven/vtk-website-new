/**
 * Bezoekersstatistieken met Umami voor de uitleendienst (apps/logistiek).
 * Leest dezelfde UMAMI_PUBLIC_URL en UMAMI_WEBSITE_ID om te kunnen rapporteren.
 */

export type AnalyticsConfig = {
  url: string;
  websiteId: string;
};

export type AnalyticsScript = {
  src: string;
  websiteId: string;
};

/** Logistiek-gebeurtenissen zoals ze in Umami heten. */
export const LOGISTICS_SEARCH_EVENT = "logistiek-materiaal-zoeksessie";
export const LOGISTICS_VIEW_EVENT = "logistiek-materiaal-bekeken";
export const LOGISTICS_RESERVATION_EVENT = "logistiek-materiaalaanvraag-ingediend";
export const LOGISTICS_VAN_EVENT = "logistiek-vervoeraanvraag-ingediend";
export const LOGISTICS_DRINKS_EVENT = "logistiek-flesserke-aanvraag-ingediend";
export const LOGISTICS_TEMPLATE_EVENT = "logistiek-sjabloon-geladen";

export function analyticsConfigFromEnv(
  env: { UMAMI_PUBLIC_URL?: string; UMAMI_WEBSITE_ID?: string } = {
    UMAMI_PUBLIC_URL: process.env.UMAMI_PUBLIC_URL,
    UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID,
  },
): AnalyticsConfig | null {
  const url = (env.UMAMI_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const websiteId = (env.UMAMI_WEBSITE_ID ?? "").trim();
  if (!url || !websiteId) return null;
  return { url, websiteId };
}

export function analyticsScript(config: AnalyticsConfig | null): AnalyticsScript | null {
  if (!config) return null;
  return {
    src: `${config.url}/script.js`,
    websiteId: config.websiteId,
  };
}

function eventDataKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function umamiEvent(
  name: string,
  data: Record<string, string | null | undefined> = {},
): Record<string, string> {
  const attributes: Record<string, string> = { "data-umami-event": name };
  for (const [key, value] of Object.entries(data)) {
    const clean = (value ?? "").trim();
    const attribute = eventDataKey(key);
    if (!clean || !attribute) continue;
    attributes[`data-umami-event-${attribute}`] = clean;
  }
  return attributes;
}
