import { timingSafeEqual } from "node:crypto";
import { processDueHeroWeekNotices } from "@/lib/calendar/heroWeekNoticeMailer";
import { processDueLesbezoekScheduledMails } from "@/lib/lesbezoeken-server";
import { processDueNoShows } from "@/lib/theokot-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Worker-trigger: de periodieke verwerking die vroeger in het renderproces zat.
 *
 * Bedoeld voor de `background-worker` in docker-compose (elke vijf minuten) met
 * `Authorization: Bearer $BACKGROUND_MAINTENANCE_SECRET`. Geen secret = uit
 * (401), zoals bij de andere maintenance-routes.
 *
 * Dit stond als `setInterval` in `apps/web/instrumentation.ts`. Een timer daar
 * draait mee in élke instance, dus zodra de website op meer dan één container
 * draait vertrekt elke mail meervoudig, en hij deelt het event loop met de
 * paginaweergaven. Zie docs/design-decisions.md, "Scheduler-caveat".
 *
 * De taken draaien naast elkaar en niet na elkaar: ze hebben niets met elkaar te
 * maken, en een Theokot die blijft hangen hoort de lesbezoekmails niet mee te
 * sleuren (dat deed de oude lus wel, want die stond in één try-blok).
 */

function authorized(request: Request): boolean {
  const secret = process.env.BACKGROUND_MAINTENANCE_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function describe(result: PromiseSettledResult<unknown>): unknown {
  return result.status === "fulfilled"
    ? result.value
    : { error: result.reason instanceof Error ? result.reason.message : "onbekende fout" };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const [theokot, lesbezoeken, kalender] = await Promise.allSettled([
    processDueNoShows(now),
    processDueLesbezoekScheduledMails(now),
    processDueHeroWeekNotices(now),
  ]);

  // 502 zodra een van de twee viel: de healthcheck van de worker ziet dan dat er
  // iets scheelt in plaats van stil niets te doen. De andere taak is wel
  // gedraaid, en beide zijn idempotent, dus de volgende ronde haalt het in.
  const failed = [theokot, lesbezoeken, kalender].some((task) => task.status === "rejected");
  if (failed) {
    console.error("[background] periodieke verwerking deels mislukt:", {
      theokot: describe(theokot),
      lesbezoeken: describe(lesbezoeken),
      kalender: describe(kalender),
    });
  }

  return Response.json(
    {
      theokot: describe(theokot),
      lesbezoeken: describe(lesbezoeken),
      kalender: describe(kalender),
    },
    { status: failed ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
