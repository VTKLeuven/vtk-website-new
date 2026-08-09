import "server-only";

/**
 * De leeskant van de statistieken: hoe vaak een nummer van 't Bakske of Ir.Reëel
 * geopend is. `lib/analytics.ts` en `lib/analytics-client.ts` sturen de cijfers
 * naar Umami, dit haalt ze weer op.
 *
 * De toegang loopt via een **share-token** en niet via een wachtwoord. In Umami
 * zet je voor de website een Share URL aan; het id daaruit is genoeg om de
 * cijfers te lezen, en één klik in Umami trekt die toegang weer in. Zo staat er
 * geen beheerderswachtwoord in de omgeving van de website.
 *
 * Niets hier gooit. Een ontbrekende configuratie of een trage statistiekserver
 * mag het mediabeheer niet stukmaken: dan staat er "geen cijfers" en werkt de
 * rest van de pagina gewoon.
 */

const TIMEOUT_MS = 5000;
/** Hoe lang we cijfers hergebruiken. Ze bewegen traag; dit is beheer, geen live dashboard. */
const STATS_TTL_MS = 5 * 60 * 1000;
/** Het share-token blijft langer geldig dan de cijfers zelf. */
const TOKEN_TTL_MS = 30 * 60 * 1000;

export type UmamiPeriod = "30d" | "jaar" | "alles";

export type UmamiStatsError = "not_configured" | "unreachable" | "umami_error";

export type UmamiMagazineStats = {
  ok: true;
  /** Weergaven per adres, bv. `/media/bakske/2025-2026-s2w6`. */
  views: Record<string, number>;
  /** Downloads per nummer-id; leeg wanneer Umami die uitsplitsing niet gaf. */
  downloads: Record<string, number>;
  /** Vanaf wanneer geteld is, voor het bijschrift. */
  since: Date;
};

export type UmamiStatsResult = UmamiMagazineStats | { ok: false; error: UmamiStatsError };

type Config = { url: string; shareId: string };

function getConfig(): Config | null {
  const url = process.env.UMAMI_PUBLIC_URL?.trim().replace(/\/+$/, "");
  const shareId = process.env.UMAMI_SHARE_ID?.trim();
  return url && shareId ? { url, shareId } : null;
}

/**
 * Het begin van de meetperiode. "alles" is niet echt alles maar de start van
 * Umami zelf; een `startAt` van 1970 laat de statistiekserver onnodig ver
 * terugkijken in een tabel die per dag gepartitioneerd is.
 */
const UMAMI_EPOCH = new Date("2026-08-01T00:00:00.000Z");

export function periodStart(period: UmamiPeriod, now: Date = new Date()): Date {
  if (period === "alles") return UMAMI_EPOCH;
  if (period === "jaar") {
    // Het werkingsjaar loopt van 15 juli tot 15 juli, dezelfde grens als de
    // rollen en posten (zie docs/permissions.md).
    const year = now.getUTCFullYear();
    const start = new Date(Date.UTC(year, 6, 15));
    return start <= now ? start : new Date(Date.UTC(year - 1, 6, 15));
  }
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

type CachedToken = { websiteId: string; token: string; expiresAt: number };
let tokenCache: CachedToken | null = null;

/**
 * Wisselt het share-id om voor een token plus het website-id. Umami geeft die
 * twee samen terug; het website-id uit de omgeving hebben we hier dus niet nodig.
 */
async function getShareToken(config: Config): Promise<CachedToken | null> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache;

  const body = await fetchJson(`${config.url}/api/share/${encodeURIComponent(config.shareId)}`);
  if (!body || typeof body !== "object") return null;

  // Umami 3.2 noemt dit veld `websiteId`; oudere versies gaven `id` terug.
  const { websiteId, id, token } = body as {
    websiteId?: unknown;
    id?: unknown;
    token?: unknown;
  };
  const website = typeof websiteId === "string" ? websiteId : id;
  if (typeof website !== "string" || typeof token !== "string") return null;

  tokenCache = { websiteId: website, token, expiresAt: now + TOKEN_TTL_MS };
  return tokenCache;
}

/** Eén GET, met tijdslimiet. `null` betekent: onbereikbaar of geen geldige JSON. */
async function fetchJson(url: string, token?: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      // Het token alleen volstaat niet: Umami weigert een share-token dat
      // "buiten een share-context" gebruikt wordt, en die context is niets meer
      // dan de aanwezigheid van deze tweede header. Zonder haar krijg je 401.
      headers: token
        ? { "x-umami-share-token": token, "x-umami-share-context": "1" }
        : {},
      // Umami's eigen antwoorden cachen we hierboven zelf; de fetch-cache van
      // Next zou daar een tweede, onzichtbare laag bovenop leggen.
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Een lijst `[{x, y}]` uit Umami naar een gewone tabel. Alles wat niet die vorm
 * heeft, wordt genegeerd in plaats van de hele pagina te laten struikelen: dit
 * is een externe API die we niet in de hand hebben.
 */
function toCounts(value: unknown, keyField: string, countField: string): Record<string, number> {
  if (!Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const key = (row as Record<string, unknown>)[keyField];
    const count = (row as Record<string, unknown>)[countField];
    if (typeof key !== "string" || typeof count !== "number") continue;
    counts[key] = (counts[key] ?? 0) + count;
  }
  return counts;
}

type CachedStats = { period: UmamiPeriod; result: UmamiStatsResult; expiresAt: number };
let statsCache: CachedStats | null = null;
let inflight: Promise<UmamiStatsResult> | null = null;

/**
 * De cijfers voor de magazines. Weergaven komen uit de paginaweergaven (elk
 * geopend nummer krijgt een eigen adres, zie `magazineViewUrl`), downloads uit
 * de gebeurtenis `magazine-download`.
 *
 * Die tweede is best effort: lukt ze niet, dan tonen we de weergaven zonder
 * downloads in plaats van helemaal niets.
 */
export async function magazineStats(
  period: UmamiPeriod,
  now: Date = new Date(),
): Promise<UmamiStatsResult> {
  const cached = statsCache;
  if (cached && cached.period === period && cached.expiresAt > Date.now()) return cached.result;
  if (inflight) return inflight;

  inflight = loadStats(period, now)
    .then((result) => {
      statsCache = { period, result, expiresAt: Date.now() + STATS_TTL_MS };
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function loadStats(period: UmamiPeriod, now: Date): Promise<UmamiStatsResult> {
  const config = getConfig();
  if (!config) return { ok: false, error: "not_configured" };

  const share = await getShareToken(config);
  if (!share) return { ok: false, error: "unreachable" };

  const since = periodStart(period, now);
  const range = `startAt=${since.getTime()}&endAt=${now.getTime()}`;
  const base = `${config.url}/api/websites/${encodeURIComponent(share.websiteId)}`;

  // `type=path` en niet `type=url`: Umami 3.x hernoemde die metriek, en de oude
  // naam geeft een 400 terug in plaats van een lege lijst.
  const urls = await fetchJson(`${base}/metrics?${range}&type=path&limit=500`, share.token);
  if (urls === null) return { ok: false, error: "umami_error" };

  const events = await fetchJson(
    `${base}/event-data/values?${range}&eventName=magazine-download&propertyName=nummer`,
    share.token,
  );

  return {
    ok: true,
    views: toCounts(urls, "x", "y"),
    downloads: toCounts(events, "value", "total"),
    since,
  };
}

/** Enkel voor tests: de gecachete waarden vergeten. */
export function resetUmamiStatsCache(): void {
  statsCache = null;
  tokenCache = null;
  inflight = null;
}
