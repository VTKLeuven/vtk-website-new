/**
 * Handmatige probe voor de Munisense-koppeling van 't ElixIr.
 *
 * Logt in, loopt de keten af en toont per stap de HTTP-status, de vorm van het
 * antwoord en wat onze parsers ervan maken. Bedoeld om de parsers tegen de
 * echte payloads te leggen wanneer Munisense iets wijzigt. Print nooit
 * credentials.
 *
 *   npm run probe:elixir
 */
import {
  elixirThresholds,
  munisenseApiOrigin,
  munisenseCredentials,
  munisenseGroupId,
  munisenseLoginOrigin,
} from "../apps/web/lib/elixir/config";
import { withMuniSession } from "../apps/web/lib/elixir/munisenseAuth";
import {
  payloadShape,
  pickCurrentEvent,
  pickMeasurementPoint,
  readDecibels,
} from "../apps/web/lib/elixir/munisenseParse";
import { evaluateStatus } from "../apps/web/lib/elixir/barStatus";

const PREVIEW = 500;

async function hop(label: string, path: string, cookie: string): Promise<unknown> {
  console.log(`\n-- ${label}\n   GET ${munisenseApiOrigin()}${path}`);
  const res = await fetch(`${munisenseApiOrigin()}${path}`, {
    method: "GET",
    redirect: "manual",
    headers: {
      cookie,
      accept: "application/json",
      "user-agent": "vtk.be barstatus (https://vtk.be)",
      "x-requested-with": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  console.log(`   status  ${res.status} ${res.headers.get("content-type") ?? ""}`);
  if (res.headers.get("location")) console.log(`   location ${res.headers.get("location")}`);
  try {
    const json: unknown = JSON.parse(body);
    console.log(`   vorm    ${payloadShape(json)}`);
    console.log(`   body    ${body.slice(0, PREVIEW)}${body.length > PREVIEW ? " ..." : ""}`);
    return json;
  } catch {
    console.log(`   GEEN JSON, eerste ${PREVIEW} tekens:`);
    console.log(`   ${body.slice(0, PREVIEW).replace(/\s+/g, " ")}`);
    return null;
  }
}

async function main(): Promise<void> {
  const credentials = munisenseCredentials();
  const now = new Date();
  console.log("Munisense-probe");
  console.log(`  login : ${munisenseLoginOrigin()}`);
  console.log(`  api   : ${munisenseApiOrigin()}`);
  console.log(`  group : ${munisenseGroupId()}`);
  console.log(`  nu    : ${now.toLocaleString("nl-BE")}`);
  if (!credentials) {
    console.error("  user  : ONTBREEKT (zet MUNISENSE_USERNAME en MUNISENSE_PASSWORD)");
    process.exit(1);
  }
  console.log(`  user  : ${credentials.username.slice(0, 2)}*** (${credentials.username.length} tekens)`);

  await withMuniSession(async (cookie) => {
    const names = cookie.split("; ").map((pair) => pair.split("=")[0]).join(", ");
    console.log(`\nOK ingelogd. Cookies: ${names}`);

    const group = munisenseGroupId();
    // Zonder order_field sorteert Munisense op de omschrijving als string, en
    // dan krijg je tien jaar aan "01-..."-events in plaats van vandaag.
    const events = await hop(
      "stap 1: soundevents",
      `/webservices/v2/groups/${group}/soundevents` +
        `?fields=object_id,description,start_timestamp,end_timestamp&order_field=start_timestamp&order_dir=desc&offset=0&rowcount=5`,
      cookie
    );
    const event = pickCurrentEvent(events, now);
    console.log(`   => event: ${event ? `${event.id} "${event.name}" actief=${event.active}` : "GEEN"}`);
    if (event) {
      console.log(
        `      venster ${event.startsAt?.toLocaleString("nl-BE") ?? "?"} -> ${event.endsAt?.toLocaleString("nl-BE") ?? "?"}`
      );
    }
    if (!event) return;

    const points = await hop(
      "stap 2: soundmeasurementpoints",
      `/webservices/v2/soundeventapp/${group}/${encodeURIComponent(event.id)}/soundmeasurementpoints`,
      cookie
    );
    const point = pickMeasurementPoint(points);
    console.log(`   => meetpunt: ${point ? `${point.id} actief=${point.active} reserve=${point.decibels} dB` : "GEEN"}`);
    if (!point) return;

    const realtime = await hop(
      "stap 3: realtimesound",
      `/webservices/v2/soundeventapp/realtimesound/${encodeURIComponent(point.id)}`,
      cookie
    );
    const sample = readDecibels(realtime);
    console.log(`   => meting: ${sample ? `${sample.decibels} dB` : "GEEN"}`);

    const thresholds = elixirThresholds();
    const status = evaluateStatus({
      event,
      meterActive: point.active,
      decibels: sample?.decibels ?? point.decibels,
      sampledAt: sample?.sampledAt ?? now,
      now,
      previous: null,
      thresholds,
    });
    console.log(
      `\n== status: ${status.isOpen ? "OPEN" : "GESLOTEN"} (${status.reason}), drempel ${thresholds.openDb} dB`
    );
  });
}

main().catch((error: unknown) => {
  console.error(`\nMISLUKT: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
