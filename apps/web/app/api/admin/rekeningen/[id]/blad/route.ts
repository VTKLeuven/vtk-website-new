import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { authErrorResponse } from "@/lib/session";
import { canView, requireExpenseAccess } from "@/lib/rekeningen/server";
import { buildExpenseReportPdf } from "@/lib/rekeningen/report";

export const runtime = "nodejs";

/**
 * Het ingevulde blad voor de boekhouder, als PDF.
 *
 * `?rotate=` draait het bonnetje; het voorbeeldvenster hangt deze route in een
 * iframe en vraagt bij elke draai gewoon opnieuw. `?inline=1` toont het in dat
 * voorbeeld; zonder die vlag zet `Content-Disposition` de download in gang, met
 * de bestandsnaam die de boekhouder verwacht.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let access;
  try {
    access = await requireExpenseAccess();
  } catch (error) {
    return authErrorResponse(error);
  }

  const { id } = await params;
  const expense = await prisma.expense.findUnique({ where: { id } });
  if (!expense) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canView(access, expense)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(request.url);
  const rotate = Number(url.searchParams.get("rotate")) || 0;
  const inline = url.searchParams.get("inline") === "1";

  const { bytes, filename } = await buildExpenseReportPdf(expense, rotate);

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.length),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
