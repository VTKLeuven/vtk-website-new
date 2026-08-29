import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";
import { currentWorkingYear, parseWorkingYear } from "@/lib/workingYear";

import { corsPreflight } from "@/lib/cors";
import { appLocaleFrom, type AppPoc } from "@/lib/app-api/contract";
import { absoluteMediaUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Alle POC's, met hun vertegenwoordigers.
 *
 * De homepage toont enkel de POC's van jouw richtingen; dit is de volledige
 * lijst, voor wie de POC van een andere opleiding zoekt. Zelfde vorm als op de
 * homepage, zodat iemand die daar zijn eigen POC ziet en hier doorklikt,
 * hetzelfde beeld krijgt.
 *
 * Een POC zonder vertegenwoordigers valt weg: dat is een lege kaart.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));
    const yearParam = url.searchParams.get("jaar");
    const year = yearParam ? parseWorkingYear(yearParam) : currentWorkingYear();

    const pocs = await prisma.poc.findMany({
      orderBy: { order: "asc" },
      include: {
        representatives: {
          where: { year, user: { deletedAt: null } },
          orderBy: { order: "asc" },
          include: { user: true },
        },
      },
    });

    const payload: AppPoc[] = pocs
      .filter((poc) => poc.representatives.length > 0)
      .map((poc) => ({
        id: poc.id,
        name: pick(poc.nameNl, poc.nameEn ?? poc.nameNl, locale),
        email: poc.email,
        people: poc.representatives.map((rep) => ({
          name: rep.user.name,
          role: pick(rep.roleNl, rep.roleEn, locale) || null,
          avatarUrl: absoluteMediaUrl(request, rep.user.avatarKey),
        })),
      }));

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
