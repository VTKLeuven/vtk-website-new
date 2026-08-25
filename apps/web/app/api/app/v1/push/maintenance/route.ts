import { timingSafeEqual } from "node:crypto";

import type { NotificationRun } from "@/lib/app-api/notifications";
import {
  sendCalendarFollowPush,
  sendInterestReminderPush,
  sendTheokotOrderOpenPush,
  sendTheokotPickupPush,
} from "@/lib/app-api/notifications";
import { pruneStalePushDevices } from "@/lib/app-api/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Worker-trigger voor de pushberichten die vanzelf vertrekken.
 *
 * Zelfde vorm als de andere onderhoudsroutes: `Authorization: Bearer $SECRET`,
 * en zonder secret staat ze uit. Bedoeld om de paar minuten te draaien.
 *
 * De **shift-herinneringen zitten hier niet in**: die vertrekken samen met hun
 * mail vanuit `/api/shift/maintenance`, binnen dezelfde claim. Twee wekkers voor
 * één herinnering zouden vroeg of laat uit elkaar lopen.
 *
 * Het opruimen van oude toestellen loopt mee, maar hoogstens één keer per dag;
 * daar is geen aparte worker voor nodig en het is goedkoop genoeg om er niet
 * over na te denken.
 *
 * Elk van de vier verzendingen claimt eerst en verstuurt dan, elk met zijn eigen
 * markering. Draait deze route twee keer tegelijk, dan wint er per bericht één en
 * doet de andere niets; dat is precies de bedoeling.
 */

function authorized(request: Request): boolean {
  const secret = process.env.APP_PUSH_MAINTENANCE_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Rond welk uur (Brussel) het opruimen van oude toestellen meeloopt. */
const PRUNE_HOUR = 4;

/** Voert één verzending uit; een fout stopt de andere niet. */
async function guarded(
  label: string,
  run: () => Promise<NotificationRun>,
): Promise<NotificationRun | { error: string }> {
  try {
    return await run();
  } catch (error) {
    console.error(`[push] ${label} mislukt`, error);
    return { error: error instanceof Error ? error.message : "onbekende fout" };
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();

  // Eén voor één en niet in een `Promise.all`: ze claimen alle vier in dezelfde
  // databank. Elk met zijn eigen vangnet, want ze staan los van elkaar: dat de
  // kalender een slechte beurt heeft, is geen reden om broodjes niet aan te
  // kondigen. Wat faalt, gaat naar de logs en probeert het over een paar minuten
  // gewoon opnieuw; de markering staat dan al of nog niet, maar nooit half.
  const theokotPickup = await guarded("theokot.pickup", () => sendTheokotPickupPush(now));
  const theokotOpen = await guarded("theokot.open", () => sendTheokotOrderOpenPush(now));
  const calendarFollow = await guarded("calendar.follow", () => sendCalendarFollowPush(now));
  const calendarInterest = await guarded("calendar.interest", () => sendInterestReminderPush(now));

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const pruned = hour === PRUNE_HOUR ? await pruneStalePushDevices() : 0;

  return Response.json(
    { theokotPickup, theokotOpen, calendarFollow, calendarInterest, pruned },
    { headers: { "Cache-Control": "no-store" } },
  );
}
