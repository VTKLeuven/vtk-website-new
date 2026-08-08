import "server-only";

import * as Sentry from "@sentry/nextjs";
import { MUNISENSE_TIMEOUT_MS, munisenseApiOrigin, munisenseGroupId } from "./config";
import { MunisenseUnauthorizedError, withMuniSession } from "./munisenseAuth";
import {
  payloadShape,
  pickCurrentEvent,
  pickMeasurementPoint,
  readDecibels,
  type SoundEvent,
} from "./munisenseParse";

/**
 * De keten van vier calls die van een groep naar een actuele decibelwaarde
 * leidt. Enkel de worker roept dit aan; bezoekers lezen de cache.
 *
 *   1. /webservices/v2/groups/<group>/soundevents
 *   2. het lopende event eruit halen
 *   3. /webservices/v2/soundeventapp/<group>/<event>/soundmeasurementpoints
 *   4. /webservices/v2/soundeventapp/realtimesound/<measurementPoint>
 */

/** De velden die we van een soundevent nodig hebben; scheelt een hoop payload. */
const SOUNDEVENT_FIELDS = "object_id,description,start_timestamp,end_timestamp";

export type LiveSound = {
  event: SoundEvent;
  measurementPointId: string | null;
  /** `is_active` van de meter: false betekent dat er niets binnenkomt. */
  meterActive: boolean;
  decibels: number | null;
  sampledAt: Date | null;
};

async function getJson(path: string, cookie: string): Promise<unknown> {
  const url = `${munisenseApiOrigin()}${path}`;
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: {
      cookie,
      accept: "application/json",
      "user-agent": "vtk.be barstatus (https://vtk.be)",
      "x-requested-with": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(MUNISENSE_TIMEOUT_MS),
  });

  // Een verlopen sessie uit zich als 401/403 of als een redirect terug naar de
  // loginpagina. Beide betekenen: opnieuw inloggen (zie withMuniSession).
  if (res.status === 401 || res.status === 403) throw new MunisenseUnauthorizedError(res.status);
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") ?? "";
    if (/login/i.test(location)) throw new MunisenseUnauthorizedError(res.status);
    throw new Error(`Onverwachte redirect op ${path} (${res.status})`);
  }
  if (!res.ok) throw new Error(`Munisense gaf ${res.status} op ${path}`);

  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // HTML in plaats van JSON is bijna altijd de loginpagina die teruggeserveerd
    // wordt met status 200.
    if (/<html/i.test(text)) throw new MunisenseUnauthorizedError(res.status);
    throw new Error(`Munisense gaf geen JSON op ${path}`);
  }
}

/** Meldt één keer per cyclus dat een payload er anders uitziet dan verwacht. */
function reportShape(step: string, payload: unknown): void {
  const shape = payloadShape(payload);
  console.warn(`[elixir] ${step}: onherkenbare payload ${shape}`);
  Sentry.captureMessage(`elixir: ${step} onherkenbaar`, {
    level: "warning",
    extra: { shape },
  });
}

export async function fetchLiveSound(now = new Date()): Promise<LiveSound | null> {
  const group = munisenseGroupId();

  return withMuniSession(async (cookie) => {
    // De sorteerparameters zijn niet optioneel. Zonder `order_field` sorteert
    // Munisense op `description`, en dat is een string als "01-08-2026", dus dan
    // krijg je alle eerste-van-de-maand-events van tien jaar terug in plaats van
    // de recentste dagen. Met rowcount houden we het antwoord klein.
    const eventsPayload = await getJson(
      `/webservices/v2/groups/${group}/soundevents` +
        `?fields=${SOUNDEVENT_FIELDS}&order_field=start_timestamp&order_dir=desc&offset=0&rowcount=5`,
      cookie
    );
    const event = pickCurrentEvent(eventsPayload, now);
    if (!event) {
      reportShape("soundevents", eventsPayload);
      return null;
    }

    const pointsPayload = await getJson(
      `/webservices/v2/soundeventapp/${group}/${encodeURIComponent(event.id)}/soundmeasurementpoints`,
      cookie
    );
    const point = pickMeasurementPoint(pointsPayload);
    if (!point) {
      reportShape("soundmeasurementpoints", pointsPayload);
      return { event, measurementPointId: null, meterActive: false, decibels: null, sampledAt: null };
    }
    if (!point.active) {
      return { event, measurementPointId: point.id, meterActive: false, decibels: null, sampledAt: null };
    }

    const soundPayload = await getJson(
      `/webservices/v2/soundeventapp/realtimesound/${encodeURIComponent(point.id)}`,
      cookie
    );
    const sample = readDecibels(soundPayload);
    if (!sample) reportShape("realtimesound", soundPayload);

    // Valt de realtime-call weg, dan gebruiken we het niveau dat de
    // meetpuntenlijst zelf al meegaf (laeq_last_period).
    const decibels = sample?.decibels ?? point.decibels;
    return {
      event,
      measurementPointId: point.id,
      meterActive: true,
      decibels,
      // Munisense geeft geen tijdstip mee bij realtimesound. "Nu" is dus de
      // beste benadering; de echte bescherming tegen oude data is de
      // cache-leeftijd in status.ts, niet dit veld.
      sampledAt: sample?.sampledAt ?? now,
    };
  });
}
