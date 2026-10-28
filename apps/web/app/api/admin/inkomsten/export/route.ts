import { NextResponse } from "next/server";
import writeXlsxFile from "write-excel-file/node";
import { authErrorResponse, requirePermission } from "@/lib/session";
import { contentDisposition } from "@/lib/contentDisposition";
import { parseMonth } from "@/lib/inkomsten/parse";
import { loadIncomeWorkbookModel } from "@/lib/inkomsten/server";
import { accountantWorkbook, controlWorkbook } from "@/lib/inkomsten/workbook";

export const runtime = "nodejs";

/**
 * De Excel-bestanden van /admin/inkomsten, voor `?van=2026-07&tot=2026-09`:
 *
 * - `?soort=boekhouder`: het kwartaalblad zoals in het rekenblad van Beheer,
 *   met de bedragen. Dit gaat naar de boekhouder.
 * - `?soort=controle`: hetzelfde blad met formules, en de tussenstappen. Dit is
 *   voor Beheer: het bevat de omschrijvingen die betalers zelf typten.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("income.manage");
  } catch (err) {
    return authErrorResponse(err);
  }

  const url = new URL(request.url);
  const from = parseMonth(url.searchParams.get("van"));
  const to = parseMonth(url.searchParams.get("tot"));
  if (!from || !to || from > to) return NextResponse.json({ error: "BAD_PERIOD" }, { status: 400 });
  const nl = url.searchParams.get("taal") !== "en";
  const control = url.searchParams.get("soort") === "controle";

  const model = await loadIncomeWorkbookModel(from, to, nl);
  const sheets = control ? controlWorkbook(model) : accountantWorkbook(model);
  const file = await writeXlsxFile(sheets).toBuffer();

  const name = control
    ? `${nl ? "Controle online inkomsten" : "Online income check"} ${from} ${nl ? "tot" : "to"} ${to}.xlsx`
    : `${nl ? "Online inkomsten" : "Online income"} ${from} ${nl ? "tot" : "to"} ${to}.xlsx`;
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition("attachment", name),
      "Cache-Control": "no-store",
    },
  });
}
