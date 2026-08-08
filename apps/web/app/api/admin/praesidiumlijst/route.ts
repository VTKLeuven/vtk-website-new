import { prisma } from "@vtk/db";
import { requirePermission, authErrorResponse } from "@/lib/session";
import { createCsv, type CsvValue } from "@/lib/ticketing/csv";
import { formatWorkingYear, parseWorkingYear } from "@/lib/workingYear";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Praesidiumlijst als CSV: `/api/admin/praesidiumlijst?jaar=<werkingsjaar>`.
 *
 * Iedereen die in het gevraagde werkingsjaar aan minstens één praesidiumpost
 * hangt, één rij per persoon (naam + r-nummer). Wie meerdere posten heeft staat
 * dus één keer in de lijst; welke post het is, doet hier niet ter zake.
 *
 * Het jaar komt uit dezelfde `?jaar=`-parameter als de tabjes op /admin/groepen,
 * zodat de download hetzelfde jaar exporteert als wat op het scherm staat.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("groups.manage");
  } catch (err) {
    return authErrorResponse(err);
  }

  const search = new URL(request.url).searchParams;
  const year = parseWorkingYear(search.get("jaar") ?? undefined);
  const nl = search.get("locale") !== "en";

  // Ook leden van een inactieve post horen erbij: die post bestond dat jaar en de
  // historiek blijft. Gewiste accounts (tombstones) horen er niet bij.
  const memberships = await prisma.groupMembership.findMany({
    where: { year, group: { type: "PRAESIDIUM" }, user: { deletedAt: null } },
    select: { user: { select: { id: true, name: true, rNumber: true } } },
  });

  // Eén rij per persoon: iemand met twee posten mag niet dubbel in de lijst staan.
  const byUser = new Map(memberships.map((m) => [m.user.id, m.user]));
  const people = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name, nl ? "nl" : "en"));

  const headers = nl ? ["Naam", "R-nummer"] : ["Name", "R-number"];
  const rows: CsvValue[][] = people.map((u) => [u.name, u.rNumber]);
  const filename = `praesidiumlijst-${formatWorkingYear(year)}.csv`;

  return new Response(createCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
