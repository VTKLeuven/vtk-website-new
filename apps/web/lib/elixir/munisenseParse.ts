/**
 * Parsers voor de Munisense-antwoorden.
 *
 * We hebben geen API-documentatie en geen sleutel: dit zijn de endpoints van hun
 * webapplicatie. Daarom zijn deze functies opzettelijk verdraagzaam: ze
 * accepteren zowel een kale array als een omhulsel (`data`, `result`, ...),
 * kennen meerdere schrijfwijzen per veld en geven `null` terug in plaats van te
 * gooien. Zodra we een echt antwoord gezien hebben, mogen ze strenger worden.
 */

export type SoundEvent = {
  id: string;
  /** Loopt dit event nu (expliciete vlag, of "nu" ligt tussen start en einde). */
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  name: string | null;
};

export type SoundSample = {
  decibels: number;
  sampledAt: Date | null;
};

/** Buiten dit bereik is het geen geluidsniveau maar een sensorfout. */
const MIN_PLAUSIBLE_DB = 1;
const MAX_PLAUSIBLE_DB = 140;

const WRAPPER_KEYS = ["data", "result", "results", "items", "records", "rows", "list"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Haalt de rijen uit een antwoord, of het nu een array of een omhulsel is. */
export function toRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  for (const key of WRAPPER_KEYS) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isRecord);
    // Eén niveau dieper: { data: { soundevents: [...] } }
    if (isRecord(value)) {
      const nested = Object.values(value).find(Array.isArray);
      if (nested) return (nested as unknown[]).filter(isRecord);
    }
  }
  const firstArray = Object.values(payload).find(Array.isArray);
  if (firstArray) return (firstArray as unknown[]).filter(isRecord);

  // /groups/<id>/soundevents geeft geen array maar een map met het event-id als
  // sleutel: { "485566": { object_id, description, _uri }, link_next: "..." }.
  // De link_*-sleutels horen bij de paginering en zijn geen rij.
  return Object.entries(payload)
    .filter(([key, value]) => !key.startsWith("link_") && isRecord(value))
    .map(([, value]) => value as Record<string, unknown>);
}

function firstValue(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  // Case-insensitief tweede kans (LAeq vs laeq).
  const lower = new Map(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asId(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function asDate(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Seconden of milliseconden sinds epoch; alles onder 1e12 lezen we als seconden.
    const ms = value < 1e12 ? value * 1000 : value;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value.trim().replace(" ", "T"));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "active", "running", "ongoing", "started"].includes(normalized)) return true;
    if (["0", "false", "no", "inactive", "stopped", "finished", "ended"].includes(normalized)) return false;
  }
  return null;
}

const ID_KEYS = ["object_id", "id", "event_id", "eventId", "soundevent_id", "soundEventId", "uuid"] as const;
const START_KEYS = ["start_timestamp", "start", "start_time", "startTime", "starts_at", "startsAt", "begin"] as const;
const END_KEYS = ["end_timestamp", "end", "end_time", "endTime", "ends_at", "endsAt", "stop", "until"] as const;
const ACTIVE_KEYS = ["active", "is_active", "isActive", "running", "ongoing", "status", "state"] as const;
const NAME_KEYS = ["name", "title", "label", "description"] as const;

function toSoundEvent(row: Record<string, unknown>, now: Date): SoundEvent | null {
  const id = asId(firstValue(row, ID_KEYS));
  if (!id) return null;
  const rawName = firstValue(row, NAME_KEYS);
  const startsAt = asDate(firstValue(row, START_KEYS));
  const endsAt = asDate(firstValue(row, END_KEYS));
  const flag = asBoolean(firstValue(row, ACTIVE_KEYS));
  // Munisense maakt per dag één soundevent dat van 's ochtends tot de volgende
  // ochtend loopt. "Actief" is dus: nu ligt binnen dat venster.
  const coversNow = startsAt !== null && startsAt <= now && (endsAt === null || endsAt > now);
  return {
    id,
    active: flag ?? coversNow,
    startsAt,
    endsAt,
    name: typeof rawName === "string" && rawName.trim() ? rawName.trim() : null,
  };
}

/**
 * Het soundevent dat nu loopt, of anders het recentste met `active: false`.
 *
 * Er hoort er altijd één te lopen: Munisense maakt elke dag een event aan voor
 * de meter van 't ElixIr. Vinden we er geen, dan is er iets mis met de meter of
 * met onze query, en dat willen we als zodanig zien in plaats van er een oud
 * event voor in de plaats te schuiven.
 */
export function pickCurrentEvent(payload: unknown, now: Date): SoundEvent | null {
  const events = toRows(payload)
    .map((row) => toSoundEvent(row, now))
    .filter((event): event is SoundEvent => event !== null);
  if (events.length === 0) return null;

  const byStartDesc = (a: SoundEvent, b: SoundEvent) =>
    (b.startsAt?.getTime() ?? 0) - (a.startsAt?.getTime() ?? 0);

  const live = events.filter((event) => event.active);
  if (live.length > 0) return live.sort(byStartDesc)[0] ?? null;

  // De volgorde waarin de API ze teruggeeft, vertrouwen we niet.
  return [...events].sort(byStartDesc)[0] ?? null;
}

const POINT_ID_KEYS = [
  "object_id",
  "id",
  "measurement_point_id",
  "measurementPointId",
  "soundmeasurementpoint_id",
  "point_id",
  "pointId",
  "uuid",
] as const;

export type MeasurementPoint = {
  id: string;
  /** `is_active` van de meter zelf: false betekent dat er niets binnenkomt. */
  active: boolean;
  /** `laeq_last_period` uit dezelfde payload, als reserve voor stap 4. */
  decibels: number | null;
};

/**
 * Het meetpunt waarvan we de realtime waarde halen. Zijn er meerdere, dan het
 * eerste actieve; 't ElixIr heeft er in de praktijk één.
 *
 * Deze payload draagt zelf al een niveau (`laeq_last_period`). We houden dat bij
 * als reserve, zodat een falende realtime-call niet meteen "geen meting" betekent.
 */
export function pickMeasurementPoint(payload: unknown): MeasurementPoint | null {
  const points = toRows(payload)
    .map((row) => ({
      id: asId(firstValue(row, POINT_ID_KEYS)),
      active: asBoolean(firstValue(row, ACTIVE_KEYS)),
      decibels: plausibleDecibels(asNumber(firstValue(row, DB_KEYS))),
    }))
    .filter((point): point is { id: string; active: boolean | null; decibels: number | null } =>
      point.id !== null
    );
  if (points.length === 0) return null;
  const chosen = points.find((point) => point.active === true) ?? points[0];
  if (!chosen) return null;
  // Geen expliciete vlag: dan gaan we ervan uit dat de meter meedoet, anders
  // zou een ontbrekend veld de hele status stilleggen.
  return { id: chosen.id, active: chosen.active !== false, decibels: chosen.decibels };
}

const DB_KEYS = [
  "laeq",
  "laeq_last_period",
  "laeq_longterm",
  "la_eq",
  "laeq1s",
  "db",
  "dba",
  "decibels",
  "decibel",
  "sound_level",
  "soundLevel",
  "noise_level",
  "level",
  "value",
  "avg",
  "average",
  "last_value",
  "lastValue",
] as const;

const SAMPLED_AT_KEYS = [
  "timestamp",
  "time",
  "measured_at",
  "measuredAt",
  "sampled_at",
  "sampledAt",
  "datetime",
  "date",
  "last_update",
  "lastUpdate",
  "updated_at",
  "updatedAt",
] as const;

/** Afgerond op 0,1 dB, of null wanneer de waarde geen geluidsniveau kan zijn. */
function plausibleDecibels(value: number | null): number | null {
  if (value === null || value < MIN_PLAUSIBLE_DB || value > MAX_PLAUSIBLE_DB) return null;
  return Math.round(value * 10) / 10;
}

function toSample(row: Record<string, unknown>): SoundSample | null {
  const decibels = plausibleDecibels(asNumber(firstValue(row, DB_KEYS)));
  if (decibels === null) return null;
  return { decibels, sampledAt: asDate(firstValue(row, SAMPLED_AT_KEYS)) };
}

/**
 * De meest recente meting. Het realtime-endpoint kan één waarde teruggeven of
 * een reeks; in dat laatste geval nemen we de jongste meting.
 */
export function readDecibels(payload: unknown): SoundSample | null {
  const rows = toRows(payload);
  if (rows.length > 0) {
    const samples = rows
      .map(toSample)
      .filter((sample): sample is SoundSample => sample !== null);
    if (samples.length > 0) {
      return samples.reduce((latest, sample) =>
        (sample.sampledAt?.getTime() ?? 0) >= (latest.sampledAt?.getTime() ?? 0) ? sample : latest
      );
    }
  }
  // Geen rijen: dan staat de waarde mogelijk los in het object zelf.
  if (isRecord(payload)) {
    const direct = toSample(payload);
    if (direct) return direct;
    for (const value of Object.values(payload)) {
      if (isRecord(value)) {
        const nested = toSample(value);
        if (nested) return nested;
      }
    }
  }
  return null;
}

/** Sleutels van een payload, voor diagnostiek zonder meetwaarden te loggen. */
export function payloadShape(payload: unknown): string {
  if (Array.isArray(payload)) {
    const first = payload.find(isRecord);
    return `array(${payload.length})${first ? `[${Object.keys(first).join(",")}]` : ""}`;
  }
  if (isRecord(payload)) return `object[${Object.keys(payload).join(",")}]`;
  return typeof payload;
}
