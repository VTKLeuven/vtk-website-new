import { pick } from "@vtk/i18n";
import { z } from "zod";

import { listCalendarCategories } from "@/lib/calendar/categories";
import { corsPreflight } from "@/lib/cors";
import { requireSession } from "@/lib/session";
import { appLocaleFrom, type AppNotificationSettings } from "@/lib/app-api/contract";
import { followedCategorySlugs, setCategoryFollow } from "@/lib/app-api/interest";
import {
  notificationPreferences,
  setNotificationPreference,
} from "@/lib/app-api/notificationPrefs";
import { appErrorResponse, appJson, appNotFound, readAppJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Welke berichten je wil, en welke kalendercategorieën je volgt.
 *
 * Die twee staan bewust in één scherm en dus in één endpoint. Ze horen bij
 * elkaar in het hoofd van wie ze instelt ("waarvoor gaat mijn telefoon af"), en
 * apart zetten zou betekenen dat je twee schermen moet bezoeken om te snappen
 * waarom je iets kreeg.
 *
 * De schakelaars gaan **niet** over de toestemming van het besturingssysteem.
 * Wie push helemaal uitzet op zijn telefoon, krijgt niets, ongeacht wat hier
 * staat; dat verschil staat ook in de app bij de knop.
 */

const patchSchema = z.union([
  z.object({ topic: z.string().min(1).max(64), enabled: z.boolean() }),
  z.object({ category: z.string().min(1).max(120), follow: z.boolean() }),
]);

export async function GET(request: Request) {
  try {
    const session = await requireSession();
    const locale = appLocaleFrom(new URL(request.url).searchParams.get("locale"));

    const [topics, followed, categories] = await Promise.all([
      notificationPreferences(session.user.id),
      followedCategorySlugs(session.user.id),
      listCalendarCategories(),
    ]);

    const payload: AppNotificationSettings = {
      topics,
      followedCategories: followed,
      categories: categories.map((category) => ({
        slug: category.slug,
        name: pick(category.nameNl, category.nameEn, locale) ?? category.nameNl,
        colour: category.colour,
        audience: category.audience,
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/**
 * Eén schakelaar per aanroep, niet de hele set.
 *
 * Een scherm met twintig schakelaars dat telkens alles terugstuurt, overschrijft
 * wat er intussen op een ander toestel veranderde. Per schakelaar is het
 * antwoord op "wat heeft deze tik gedaan" ook meteen te zien in de logs.
 */
export async function PATCH(request: Request) {
  try {
    const session = await requireSession();
    const input = patchSchema.parse(await readAppJson(request));

    if ("topic" in input) {
      await setNotificationPreference(session.user.id, input.topic, input.enabled);
    } else {
      await setCategoryFollow(session.user.id, input.category, input.follow);
    }

    const [topics, followed] = await Promise.all([
      notificationPreferences(session.user.id),
      followedCategorySlugs(session.user.id),
    ]);
    return appJson(request, { topics, followedCategories: followed });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return appNotFound(request, "Categorie niet gevonden.");
    }
    if (error instanceof Error && error.message === "INVALID_TOPIC") {
      return appNotFound(request, "Onbekend soort bericht.");
    }
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, PATCH, OPTIONS");
}
