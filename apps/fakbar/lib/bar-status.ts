import 'server-only';
import { prisma } from '@vtk/db';

/**
 * "Is de bar nu open?" Enkel lezen.
 *
 * De worker van de hoofdsite meet dat via de geluidsmeter van Munisense en
 * schrijft het resultaat in `Setting["elixir.barStatus"]` (zie
 * `docs/elixir-barstatus.md`). Deze app leest die rij en meer niet: een
 * bezoeker raakt Munisense nooit, en er mag maar één ding met die dienst
 * praten.
 *
 * Is de cache ouder dan de maximumleeftijd, dan ligt de worker er
 * waarschijnlijk uit. We melden dan niets in plaats van "open": een verouderde
 * "open" is erger dan geen antwoord.
 */

const CACHE_KEY = 'elixir.barStatus';
const DEFAULT_MAX_AGE_MINUTES = 15;

export type BarStatus = {
  isOpen: boolean;
  currentDecibels: number | null;
  lastUpdated: string;
};

function maxAgeMs(): number {
  const raw = Number(process.env.ELIXIR_STATUS_MAX_AGE_MINUTES);
  const minutes = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MINUTES;
  return minutes * 60_000;
}

export async function readBarStatus(now: Date = new Date()): Promise<BarStatus | null> {
  let row;
  try {
    row = await prisma.setting.findUnique({ where: { key: CACHE_KEY } });
  } catch {
    // De statusbadge is een extraatje; een databankhik mag de pagina niet
    // omver halen.
    return null;
  }
  const value = row?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  const stored = value as Record<string, unknown>;
  const lastUpdated = typeof stored.lastUpdated === 'string' ? stored.lastUpdated : null;
  if (!lastUpdated) return null;
  const updatedAt = new Date(lastUpdated).getTime();
  if (Number.isNaN(updatedAt) || now.getTime() - updatedAt > maxAgeMs()) return null;

  return {
    isOpen: stored.isOpen === true,
    currentDecibels: typeof stored.currentDecibels === 'number' ? stored.currentDecibels : null,
    lastUpdated,
  };
}
