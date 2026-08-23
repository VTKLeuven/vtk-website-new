import "server-only";

import { prisma } from "@vtk/db";
import {
  evaluateStatus,
  isStale,
  parseStoredStatus,
  type BarStatus,
  type BarStatusState,
} from "./barStatus";
import { elixirStatusMaxAgeMs, elixirThresholds, munisenseEnabled } from "./config";
import { fetchLiveSound } from "./munisenseClient";
import { elixirScheduleFromSetting, withinOpeningWindow } from "./openingWindow";

/**
 * De cachelaag tussen Munisense en de bezoeker.
 *
 * Belangrijk: een bezoeker raakt Munisense nooit. `readBarStatus` leest het
 * geheugen (of één Setting-rij na een herstart), `refreshBarStatus` is de enige
 * functie die het netwerk op gaat en wordt enkel door de worker aangeroepen.
 *
 * Twee lagen, zoals bij de cursusdienst-uren:
 *   1. procesgeheugen, zodat een pageview nul I/O kost;
 *   2. de `Setting`-tabel, zodat een deploy of herstart niet met een lege status
 *      begint.
 */

const CACHE_KEY = "elixir.barStatus";

/**
 * Hoe lang een pageview de waarde uit het geheugen mag hergebruiken. De worker
 * werkt het geheugen van zijn eigen proces bij, maar niet dat van een ander
 * proces (of van de dev-server, waar de refresh los draait). Zonder deze TTL
 * blijft zo'n proces zijn eerste lezing eeuwig herhalen.
 */
const MEMORY_TTL_MS = 60_000;

let memory: BarStatusState | null = null;
let memoryReadAt = 0;

async function readStored(): Promise<BarStatusState | null> {
  if (memory && Date.now() - memoryReadAt < MEMORY_TTL_MS) return memory;
  try {
    const row = await prisma.setting.findUnique({ where: { key: CACHE_KEY } });
    const parsed = row ? parseStoredStatus(row.value) : null;
    if (parsed) {
      memory = parsed;
      memoryReadAt = Date.now();
    }
    return parsed;
  } catch {
    // Database onbereikbaar: liever de laatst gekende waarde dan niets.
    return memory;
  }
}

async function persist(state: BarStatusState): Promise<void> {
  memory = state;
  memoryReadAt = Date.now();
  try {
    const value = { ...state };
    await prisma.setting.upsert({
      where: { key: CACHE_KEY },
      update: { value },
      create: { key: CACHE_KEY, value },
    });
  } catch {
    // Best-effort: het geheugen is bijgewerkt, de volgende cyclus probeert de
    // schrijf opnieuw. Een DB-hik mag de status niet omver halen.
  }
}

/**
 * De status voor de UI, of `null` wanneer er nooit iets gemeten is (dan valt de
 * kaart terug op het vaste uurrooster).
 *
 * Is de cache ouder dan `ELIXIR_STATUS_MAX_AGE_MINUTES`, dan ligt de worker er
 * waarschijnlijk uit. We melden dat als `stale` en zeggen niet dat de bar open
 * is: een verouderde "open" is erger dan geen antwoord.
 */
export async function readBarStatus(now = new Date()): Promise<BarStatus | null> {
  const stored = await readStored();
  if (!stored) return null;
  const stale = isStale(stored.lastUpdated, now, elixirStatusMaxAgeMs());
  return {
    isOpen: stale ? false : stored.isOpen,
    currentDecibels: stored.currentDecibels,
    lastUpdated: stored.lastUpdated,
    stale,
  };
}

export type RefreshResult =
  | { ok: true; isOpen: boolean; decibels: number | null; reason: string; eventId: string | null }
  | { ok: false; error: string };

/**
 * Haalt één verse meting op en werkt de cache bij. Enkel de worker roept dit
 * aan. Mislukt de call, dan blijft de vorige waarde staan: die veroudert vanzelf
 * naar `stale` in plaats van meteen te verdwijnen.
 */
export async function refreshBarStatus(now = new Date()): Promise<RefreshResult> {
  if (!munisenseEnabled()) return { ok: false, error: "NOT_CONFIGURED" };

  const previous = await readStored();
  const scheduleRow = await prisma.setting.findUnique({ where: { key: "home.openingHours.elixir" } });
  const schedule = elixirScheduleFromSetting(scheduleRow?.value);

  // Buiten de openingsuren bellen we Munisense niet: de status staat dan toch
  // op dicht. Dat scheelt het grootste deel van de calls en de logins, en houdt
  // `lastUpdated` toch fris zodat het endpoint niet als "stale" leest.
  if (!withinOpeningWindow(now, schedule)) {
    const state = evaluateStatus({
      event: null,
      meterActive: false,
      decibels: null,
      sampledAt: null,
      now,
      previous,
      thresholds: elixirThresholds(),
      schedule,
    });
    await persist(state);
    return { ok: true, isOpen: false, decibels: null, reason: state.reason, eventId: null };
  }

  let live: Awaited<ReturnType<typeof fetchLiveSound>>;
  try {
    live = await fetchLiveSound(now);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "FETCH_FAILED" };
  }

  const state = evaluateStatus({
    event: live?.event ?? null,
    meterActive: live?.meterActive ?? false,
    decibels: live?.decibels ?? null,
    sampledAt: live?.sampledAt ?? null,
    now,
    previous,
    thresholds: elixirThresholds(),
    schedule,
  });
  await persist(state);

  return {
    ok: true,
    isOpen: state.isOpen,
    decibels: state.currentDecibels,
    reason: state.reason,
    eventId: state.eventId,
  };
}

/** Enkel voor tests: leegt het procesgeheugen. */
export function resetBarStatusMemory(): void {
  memory = null;
  memoryReadAt = 0;
}
