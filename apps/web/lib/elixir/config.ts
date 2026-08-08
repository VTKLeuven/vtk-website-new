import "server-only";

/**
 * Configuratie voor de live geluidsstatus van 't ElixIr (Munisense).
 *
 * Alles is env-gestuurd met werkbare defaults, zodat de site blijft draaien
 * zonder credentials: `munisenseEnabled()` is dan false, de worker weigert en de
 * homepage-kaart valt terug op het vaste uurrooster.
 */

const DEFAULT_LOGIN_ORIGIN = "https://login.munisense.net";
const DEFAULT_API_ORIGIN = "https://leuven-geluid.munisense.net";
const DEFAULT_GROUP_ID = "81";

/**
 * Drempels in dB(A). Openen op 65, sluiten pas onder 60: die marge (hysterese)
 * voorkomt dat de badge knippert tijdens een stil moment tussen twee nummers.
 * Beide zijn een schatting tot we een echte donderdagavond gemeten hebben.
 */
const DEFAULT_OPEN_DB = 65;
const DEFAULT_CLOSE_DB = 60;
/** Aantal opeenvolgende stille cycli voor we een open bar toch sluiten. */
const DEFAULT_QUIET_CYCLES_TO_CLOSE = 2;

/** Een meting ouder dan dit zegt niets meer over "nu". */
const DEFAULT_SAMPLE_MAX_AGE_MINUTES = 15;
/** Ligt de worker plat, dan is de cache na dit interval niet meer bruikbaar. */
const DEFAULT_STATUS_MAX_AGE_MINUTES = 15;
/** De sessiecookies van Munisense verlopen; ruim daarvoor opnieuw inloggen. */
const DEFAULT_SESSION_TTL_MINUTES = 30;

/** Timeout per HTTP-call richting Munisense. */
export const MUNISENSE_TIMEOUT_MS = 10_000;

function positiveNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimmed(raw: string | undefined): string {
  return raw?.trim() ?? "";
}

function origin(raw: string | undefined, fallback: string): string {
  const value = trimmed(raw) || fallback;
  try {
    return new URL(value).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

export type MunisenseCredentials = { username: string; password: string };

/** De credentials, of null wanneer de integratie niet geconfigureerd is. */
export function munisenseCredentials(): MunisenseCredentials | null {
  const username = trimmed(process.env.MUNISENSE_USERNAME);
  const password = trimmed(process.env.MUNISENSE_PASSWORD);
  if (!username || !password) return null;
  return { username, password };
}

export function munisenseEnabled(): boolean {
  return munisenseCredentials() !== null;
}

export function munisenseLoginOrigin(): string {
  return origin(process.env.MUNISENSE_LOGIN_ORIGIN, DEFAULT_LOGIN_ORIGIN);
}

export function munisenseApiOrigin(): string {
  return origin(process.env.MUNISENSE_API_ORIGIN, DEFAULT_API_ORIGIN);
}

export function munisenseGroupId(): string {
  return trimmed(process.env.MUNISENSE_GROUP_ID) || DEFAULT_GROUP_ID;
}

export function munisenseSessionTtlMs(): number {
  return positiveNumber(process.env.MUNISENSE_SESSION_TTL_MINUTES, DEFAULT_SESSION_TTL_MINUTES) * 60_000;
}

export type ElixirThresholds = {
  openDb: number;
  closeDb: number;
  quietCyclesToClose: number;
  sampleMaxAgeMs: number;
};

export function elixirThresholds(): ElixirThresholds {
  const openDb = positiveNumber(process.env.ELIXIR_OPEN_DB_THRESHOLD, DEFAULT_OPEN_DB);
  const closeDb = positiveNumber(process.env.ELIXIR_CLOSE_DB_THRESHOLD, DEFAULT_CLOSE_DB);
  return {
    openDb,
    // Een sluitdrempel boven de opendrempel is geen hysterese maar een bug;
    // in dat geval vallen beide samen.
    closeDb: Math.min(openDb, closeDb),
    quietCyclesToClose: Math.max(
      1,
      Math.round(
        positiveNumber(process.env.ELIXIR_QUIET_CYCLES_TO_CLOSE, DEFAULT_QUIET_CYCLES_TO_CLOSE)
      )
    ),
    sampleMaxAgeMs:
      positiveNumber(process.env.ELIXIR_SAMPLE_MAX_AGE_MINUTES, DEFAULT_SAMPLE_MAX_AGE_MINUTES) *
      60_000,
  };
}

export function elixirStatusMaxAgeMs(): number {
  return (
    positiveNumber(process.env.ELIXIR_STATUS_MAX_AGE_MINUTES, DEFAULT_STATUS_MAX_AGE_MINUTES) *
    60_000
  );
}

export function elixirMaintenanceSecret(): string {
  return trimmed(process.env.ELIXIR_MAINTENANCE_SECRET);
}
