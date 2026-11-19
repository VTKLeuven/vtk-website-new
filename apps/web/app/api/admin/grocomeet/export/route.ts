import { NextResponse } from "next/server";
import { authErrorResponse, requirePermission } from "@/lib/session";
import { contentDisposition } from "@/lib/contentDisposition";
import { loadGrocomeetSummary } from "@/lib/meetingAdmin";
import { grocomeetSummaryXlsx } from "@/lib/grocomeetSummaryXlsx";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";

export const runtime = "nodejs";

/**
 * Het GM-overzicht van /admin/grocomeet als Excel-bestand: wat er op de
 * grocomeets van het lopende werkingsjaar tot vandaag gegeten en gedronken is,
 * voor de herbegroting. `?taal=en` voor Engelse koppen.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("grocomeet.manage");
  } catch (err) {
    return authErrorResponse(err);
  }

  const nl = new URL(request.url).searchParams.get("taal") !== "en";
  const workingYear = currentWorkingYear();
  const summary = await loadGrocomeetSummary(workingYear, nl ? "nl" : "en");
  const file = await grocomeetSummaryXlsx(summary, workingYear, nl);

  const name = `${nl ? "Grocomeet overzicht" : "Grocomeet overview"} ${formatWorkingYear(workingYear)}.xlsx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition("attachment", name),
      "Cache-Control": "no-store",
    },
  });
}
