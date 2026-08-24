import { timingSafeEqual } from "node:crypto";

import { sendTheokotPickupPush } from "@/lib/app-api/notifications";
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

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const theokot = await sendTheokotPickupPush(now);

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Brussels",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  const pruned = hour === PRUNE_HOUR ? await pruneStalePushDevices() : 0;

  return Response.json(
    { theokot, pruned },
    { headers: { "Cache-Control": "no-store" } },
  );
}
