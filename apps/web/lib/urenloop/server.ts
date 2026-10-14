import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@vtk/db";
import { SITE_CONTENT_TAG } from "@/lib/cachedContent";
import {
  parseStoredUrenloopStats,
  parseUrenloopConfig,
  URENLOOP_CONFIG_KEY,
  URENLOOP_STATS_KEY,
  type StoredUrenloopStats,
  type UrenloopConfig,
} from "./stats";

export const URENLOOP_TAG = "urenloop";

const TTL_SECONDS = 60;

/**
 * Leest de 24 urenloop-instellingen en de laatst ontvangen tussenstand in één
 * query.
 *
 * Wanneer `urenloop.config` nog nooit opgeslagen werd maar de oude `urenloop`-
 * frontpage al een `startsAt`/`endsAt` in haar `values` had staan, nemen we die
 * over als terugval zodat bestaande instellingen niet verdwijnen.
 */
export async function readUrenloopData(): Promise<{
  config: UrenloopConfig;
  stats: StoredUrenloopStats | null;
}> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: [URENLOOP_CONFIG_KEY, URENLOOP_STATS_KEY] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  let config = parseUrenloopConfig(byKey.get(URENLOOP_CONFIG_KEY));

  if (!config.startsAt && !config.endsAt) {
    const legacy = await prisma.frontpage.findUnique({
      where: { layout: "urenloop" },
      select: { values: true },
    });
    if (legacy?.values && typeof legacy.values === "object" && !Array.isArray(legacy.values)) {
      const legacyConfig = parseUrenloopConfig(legacy.values);
      config = {
        startsAt: legacyConfig.startsAt,
        endsAt: legacyConfig.endsAt,
        showResultsUntil: config.showResultsUntil,
      };
    }
  }

  const stats = parseStoredUrenloopStats(byKey.get(URENLOOP_STATS_KEY));
  return { config, stats };
}

const cachedUrenloopData = unstable_cache(
  async () => readUrenloopData(),
  ["site", "urenloop-data"],
  { revalidate: TTL_SECONDS, tags: [URENLOOP_TAG, SITE_CONTENT_TAG] },
);

/**
 * Gecachete lezing voor de publieke site (`UrenloopFrontpage` en `PageView`).
 * Alle velden in `UrenloopConfig` en `StoredUrenloopStats` zijn ISO-strings,
 * getallen en booleans, en overleven de JSON-serialisatie van `unstable_cache`
 * dus zonder verlies.
 */
export function getCachedUrenloopData(): Promise<{
  config: UrenloopConfig;
  stats: StoredUrenloopStats | null;
}> {
  return cachedUrenloopData();
}

export async function saveUrenloopConfig(config: UrenloopConfig): Promise<void> {
  await prisma.setting.upsert({
    where: { key: URENLOOP_CONFIG_KEY },
    update: { value: config },
    create: { key: URENLOOP_CONFIG_KEY, value: config },
  });
}

export async function saveUrenloopStats(stored: StoredUrenloopStats): Promise<void> {
  await prisma.setting.upsert({
    where: { key: URENLOOP_STATS_KEY },
    update: { value: stored },
    create: { key: URENLOOP_STATS_KEY, value: stored },
  });
}

export async function clearUrenloopStats(): Promise<void> {
  await prisma.setting.deleteMany({
    where: { key: URENLOOP_STATS_KEY },
  });
}
