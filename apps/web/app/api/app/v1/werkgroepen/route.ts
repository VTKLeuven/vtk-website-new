import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { corsPreflight } from "@/lib/cors";
import { parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { appLocaleFrom, type AppGroups } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De werkgroepen van een werkingsjaar.
 *
 * Anders dan bij het praesidium loopt de jarenlijst hier wél via
 * `workingYearTabs()`: werkgroepen bestaan pas sinds `FIRST_WORKING_YEAR`, dus
 * die klem doet hier geen kwaad. Bij het praesidium wel, want daar gaat de
 * geïmporteerde historiek verder terug.
 *
 * Een werkgroep zonder leden dit jaar blijft in de lijst staan, met een lege
 * ploeg. Dat is een keuze: een werkgroep die dit jaar (nog) niemand heeft,
 * bestaat wel degelijk, en hem verzwijgen laat lijken alsof hij opgeheven is.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));
    const year = parseWorkingYear(url.searchParams.get("jaar") ?? undefined);

    const [groups, distinctYears] = await Promise.all([
      prisma.group.findMany({
        where: { type: "WERKGROEP", active: true },
        orderBy: { orderInPraesidium: "asc" },
        include: {
          memberships: {
            where: { year, user: { deletedAt: null } },
            orderBy: { displayOrder: "asc" },
            include: { user: true },
          },
        },
      }),
      prisma.groupMembership.findMany({
        where: { group: { type: "WERKGROEP" } },
        distinct: ["year"],
        select: { year: true },
      }),
    ]);

    const payload: AppGroups = {
      year,
      years: workingYearTabs(distinctYears.map((row) => row.year)),
      groups: groups.map((group) => ({
        slug: group.slug,
        name: pick(group.nameNl, group.nameEn, locale),
        description: pick(group.descriptionNl ?? "", group.descriptionEn ?? "", locale) || null,
        imageUrl: absoluteMediaUrl(request, group.photoKey),
        people: group.memberships.map((membership) => ({
          name: membership.user.name,
          role: pick(membership.titleNl ?? "", membership.titleEn ?? "", locale) || null,
          avatarUrl: absoluteMediaUrl(request, membership.user.avatarKey),
        })),
      })),
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
