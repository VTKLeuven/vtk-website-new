import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { currentWorkingYear } from "@/lib/workingYear";
import { appLocaleFrom, type AppPraesidium } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Het praesidium van een werkingsjaar.
 *
 * Twee dingen zijn hier overgenomen van `/praesidium` op de site, en allebei met
 * reden.
 *
 * **De jarenlijst komt uit de data zelf** en niet uit `workingYearTabs()`. Die
 * helper klemt op `FIRST_WORKING_YEAR`, en de praesidiumhistoriek gaat verder
 * terug: ze is geïmporteerd als losse lidmaatschappen met inactieve leden. Zou
 * de app die helper gebruiken, dan zou twintig jaar historiek wegvallen.
 *
 * **Inactieve leden horen erbij, tombstones niet.** Wie afgestudeerd is, staat
 * nog steeds in het praesidium van zijn jaar; een account dat verwijderd en
 * geanonimiseerd is (`deletedAt`), staat er niet meer. Dat onderscheid is het
 * verschil tussen historiek en een lege naam.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));

    const distinctYears = (
      await prisma.groupMembership.findMany({
        where: { group: { type: "PRAESIDIUM" } },
        distinct: ["year"],
        select: { year: true },
      })
    ).map((row) => row.year);

    const current = currentWorkingYear();
    const yearSet = new Set<number>([...distinctYears, current]);
    const years = [...yearSet].sort((a, b) => b - a);

    // Standaardjaar: het huidige wanneer daar iets voor ingevuld is, anders het
    // nieuwste jaar mét gegevens, zodat de lijst nooit leeg opent.
    const newestWithData = distinctYears.length > 0 ? Math.max(...distinctYears) : current;
    const requested = Number(url.searchParams.get("jaar"));
    const year = Number.isInteger(requested) && yearSet.has(requested) ? requested : newestWithData;

    const groups = await prisma.group.findMany({
      where: { type: "PRAESIDIUM" },
      include: {
        memberships: {
          where: { year, user: { deletedAt: null } },
          orderBy: { displayOrder: "asc" },
          include: { user: true },
        },
      },
    });

    const payload: AppPraesidium = {
      year,
      years,
      groups: groups
        .filter((group) => group.memberships.length > 0)
        // Alfabetisch op de getoonde naam, niet op `orderInPraesidium`: dat zette
        // Groep 5 bovenaan, en dat is op een publieke lijst niet de bedoeling.
        .map((group) => ({
          slug: group.slug,
          name: pick(group.nameNl, group.nameEn, locale),
          description: pick(group.descriptionNl ?? "", group.descriptionEn ?? "", locale) || null,
          people: group.memberships.map((membership) => ({
            name: membership.user.name,
            role: pick(membership.titleNl ?? "", membership.titleEn ?? "", locale) || null,
            avatarUrl: absoluteMediaUrl(request, membership.user.avatarKey),
          })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
