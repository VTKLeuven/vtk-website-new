import { timingSafeEqual } from "node:crypto";
import { processDueInterestReminderMails } from "@/lib/calendar/interestReminderMailer";
import { processDueDiscordPosts } from "@/lib/discord/posts";
import { closeExpiredPollsOnDiscord } from "@/lib/discord/pollPosts";
import { syncPocDiscordRoles } from "@/lib/discord/pocAccess";
import { processDueLesbezoekScheduledMails } from "@/lib/lesbezoeken-server";
import { recordMailingListCounts } from "@/lib/mailingListHistory";
import { processDueNoShows } from "@/lib/theokot-server";
import { backfillMagazineCovers } from "@/lib/magazineCover";
import { processDuePalPlusReminders } from "@/lib/palPlusNotify";
import { runNightlyStorageCleanup } from "@/lib/storage-cleanup";
import { refreshDueBudgetPrices } from "@/lib/bo/budget/priceRound";

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
  const [theokot, lesbezoeken, mailinglijsten, kaften, palPlus, discord, interesse, opruiming, peilingen, pocRollen, budgetprijzen] = await Promise.allSettled([
    processDueNoShows(now),
    processDueLesbezoekScheduledMails(now),
    // De stand van de mailinglijsten van vandaag, voor de grafiek in
    // /admin/mailinglijsten; zie lib/mailingListHistory.ts.
    recordMailingListCounts(now),
    // Kaften van Bakske en Ir.Reëel die er nog geen hebben; zie lib/magazineCover.ts.
    backfillMagazineCovers(),
    // De herinnering van de dag voor een PAL+-sessie; zie lib/palPlusNotify.ts.
    // Hier en niet in de shift-worker: het is één query per ronde, en een eigen
    // worker zou een eigen secret op de server vragen.
    processDuePalPlusReminders(now),
    // Het vangnet voor de Discord-posts van nieuwe evenementen: wat na het
    // bewaren niet vertrok, en wat Discord tijdelijk weigerde. Zie
    // lib/discord/posts.ts.
    processDueDiscordPosts(now),
    // De herinneringsmail om 12u de dag voor een evenement waarin een lid
    // interesse aanduidde; zie lib/calendar/interestReminderMailer.ts.
    processDueInterestReminderMails(now),
    // Eén keer per nacht de bucket opruimen: bestanden waar de database al 30
    // dagen niet meer naar verwijst. Doet zelf niets tot het 3u is, en daarna
    // niets meer die dag; zie lib/storage-cleanup.ts.
    runNightlyStorageCleanup(now),
    // POC-peilingen voorbij hun deadline: de knoppen op Discord gaan uit.
    closeExpiredPollsOnDiscord(now),
    // De POC-rollen op Discord lopen mee met richting en studiebevestiging; zie
    // lib/discord/pocAccess.ts.
    syncPocDiscordRoles(now),
    // De prijzen bij de webshops in de budgetten van het eerstvolgende BO, om
    // de vier uur per budget, ook als niemand het opent; zie
    // lib/bo/budget/priceRound.ts.
    refreshDueBudgetPrices(now),
  ]);

  // 502 zodra een van de taken viel: de healthcheck van de worker ziet dan dat
  // er iets scheelt in plaats van stil niets te doen. De andere taken zijn wel
  // gedraaid, en alle zijn idempotent, dus de volgende ronde haalt het in.
  const failed = [theokot, lesbezoeken, mailinglijsten, kaften, palPlus, discord, interesse, opruiming, peilingen, pocRollen, budgetprijzen].some(
    (task) => task.status === "rejected",
  );
  if (failed) {
    console.error("[background] periodieke verwerking deels mislukt:", {
      theokot: describe(theokot),
      lesbezoeken: describe(lesbezoeken),
      mailinglijsten: describe(mailinglijsten),
      kaften: describe(kaften),
      palPlus: describe(palPlus),
      discord: describe(discord),
      interesse: describe(interesse),
      opruiming: describe(opruiming),
      peilingen: describe(peilingen),
      pocRollen: describe(pocRollen),
      budgetprijzen: describe(budgetprijzen),
    });
  }

  return Response.json(
    {
      theokot: describe(theokot),
      lesbezoeken: describe(lesbezoeken),
      mailinglijsten: describe(mailinglijsten),
      kaften: describe(kaften),
      palPlus: describe(palPlus),
      discord: describe(discord),
      interesse: describe(interesse),
      opruiming: describe(opruiming),
      peilingen: describe(peilingen),
      pocRollen: describe(pocRollen),
      budgetprijzen: describe(budgetprijzen),
    },
    { status: failed ? 502 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
