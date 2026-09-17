import { NextResponse } from "next/server";
import { authErrorResponse, requirePermission } from "@/lib/session";
import { currentStudyYear } from "@/lib/workingYear";
import { listMembers } from "@/lib/membership";
import { membersXlsx } from "@/lib/membership/export";

export const runtime = "nodejs";

/**
 * Download van de ledenlijst als Excel-bestand. `?jaar=2026` kiest het
 * academiejaar (standaard het lopende); `?openstaand=1` neemt ook de
 * lidmaatschappen mee waarvan de betaling nog niet binnen is.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("leden.manage");
  } catch (err) {
    return authErrorResponse(err);
  }

  const url = new URL(request.url);
  const raw = url.searchParams.get("jaar");
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : currentStudyYear();
  const pending = url.searchParams.get("openstaand") === "1";
  const nl = url.searchParams.get("taal") !== "en";

  const rows = await listMembers(year, { pending });
  const file = await membersXlsx(rows, year, nl);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="vtk-leden-${year}-${year + 1}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
