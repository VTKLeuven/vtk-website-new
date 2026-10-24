import "server-only";

import { AFTERMOVIE_EVENT, magazineEventName } from "@/lib/analytics";

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
  /** Weergaven per nummer-id, uit de lezer op /media en uit het nieuws samen. */
  views: Record<string, number>;
  /** Downloads per nummer-id; leeg wanneer Umami die uitsplitsing niet gaf. */
  downloads: Record<string, number>;
  /**
   * Hoe vaak een aftermovie gestart is, per video-id, op /media en op de
   * homepage samen. Leeg wanneer Umami die uitsplitsing niet gaf.
   */
  aftermovies: Record<string, number>;
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
 * Lijsten `[{value, total}]` uit Umami naar één tabel, opgeteld per waarde. Alles
 * wat niet die vorm heeft, wordt genegeerd in plaats van de hele pagina te laten
 * struikelen: dit is een externe API die we niet in de hand hebben.
 */
function valueCounts(...lists: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const { value, total } = row as Record<string, unknown>;
      if (typeof value !== "string" || typeof total !== "number") continue;
      counts[value] = (counts[value] ?? 0) + total;
    }
  }
  return counts;
}

type CachedStats = { result: UmamiStatsResult; expiresAt: number };
// Per periode: wie tussen "30 dagen" en "Alles" wisselt, krijgt anders de
// cijfers van de andere periode zolang die nog onderweg zijn.
const statsCache = new Map<UmamiPeriod, CachedStats>();
const inflight = new Map<UmamiPeriod, Promise<UmamiStatsResult>>();

/**
 * De cijfers voor de magazines, alle drie uit gebeurtenissen met het nummer als
 * gegeven: `bakske-bekeken`, `bakske-download` en hun Ir.Reëel-tegenhangers.
 *
 * Weergaven komen bewust niet uit de paginaweergaven op `magazineViewUrl`. Die
 * stuurt enkel de lezer op /media; een nummer dat vanuit het nieuws opent, gaat
 * rechtstreeks naar de pdf en stuurt alleen de gebeurtenis. Bovendien gaf de
 * paginalijst enkel de 500 drukst bezochte adressen terug, en daar viel een
 * nummer met een handvol weergaven al na een maand buiten.
 *
 * Downloads en aftermovies zijn best effort: lukken ze niet, dan tonen we de
 * weergaven zonder in plaats van helemaal niets.
 */
export async function magazineStats(
  period: UmamiPeriod,
  now: Date = new Date(),
): Promise<UmamiStatsResult> {
  const cached = statsCache.get(period);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const pending = inflight.get(period);
  if (pending) return pending;

  const request = loadStats(period, now)
    .then((result) => {
      statsCache.set(period, { result, expiresAt: Date.now() + STATS_TTL_MS });
      return result;
    })
    .finally(() => {
      inflight.delete(period);
    });
  inflight.set(period, request);
  return request;
}

async function loadStats(period: UmamiPeriod, now: Date): Promise<UmamiStatsResult> {
  const config = getConfig();
  if (!config) return { ok: false, error: "not_configured" };

  const share = await getShareToken(config);
  if (!share) return { ok: false, error: "unreachable" };

  const since = periodStart(period, now);
  const range = `startAt=${since.getTime()}&endAt=${now.getTime()}`;
  const base = `${config.url}/api/websites/${encodeURIComponent(share.websiteId)}`;

  // `event=` en niet `eventName=`: Umami 3.x hernoemde die parameter, en de oude
  // naam wordt stil genegeerd. Dan komt er geen fout terug maar een lege lijst,
  // waardoor elk nummer op nul stond zonder dat iets klaagde.
  const values = (event: string, property: string) =>
    fetchJson(
      `${base}/event-data/values?${range}&event=${encodeURIComponent(event)}&propertyName=${property}`,
      share.token,
    );

  const [bakskeViews, irreelViews, bakskeDownloads, irreelDownloads, aftermoviePlays] =
    await Promise.all([
      values(magazineEventName("bakske", "bekeken"), "nummer"),
      values(magazineEventName("ir-reeel", "bekeken"), "nummer"),
      values(magazineEventName("bakske", "download"), "nummer"),
      values(magazineEventName("ir-reeel", "download"), "nummer"),
      values(AFTERMOVIE_EVENT, "video"),
    ]);

  if (bakskeViews === null && irreelViews === null) return { ok: false, error: "umami_error" };

  return {
    ok: true,
    views: valueCounts(bakskeViews, irreelViews),
    downloads: valueCounts(bakskeDownloads, irreelDownloads),
    aftermovies: valueCounts(aftermoviePlays),
    since,
  };
}

/** Enkel voor tests: de gecachete waarden vergeten. */
export function resetUmamiStatsCache(): void {
  statsCache.clear();
  inflight.clear();
  tokenCache = null;
}
