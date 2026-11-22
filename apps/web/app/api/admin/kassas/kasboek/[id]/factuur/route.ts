import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { getObjectStream, objectResponse } from "@vtk/storage";
import { contentDisposition } from "@/lib/contentDisposition";
import { authErrorResponse } from "@/lib/session";
import { requireCashRegisterAccess } from "@/lib/kassas/server";
import { RECEIPT_PREFIX } from "@/lib/rekeningen/expenses";

export const runtime = "nodejs";

/**
 * De factuur van een aankoop in het kasboek, achter een login en enkel voor
 * wie de kassa's beheert. Zelfde redenering als het bonnetje van een rekening
 * (`/api/admin/rekeningen/[id]/bon`): `/api/media` vraagt niets, en dit is een
 * financieel stuk.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireCashRegisterAccess();
    if (!access.canManage) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  } catch (error) {
    return authErrorResponse(error);
  }

  const { id } = await context.params;
  const entry = await prisma.cashBookEntry.findUnique({
    where: { id },
    select: { invoiceKey: true, invoiceName: true, invoiceMime: true },
  });
  if (!entry?.invoiceKey || !entry.invoiceKey.startsWith(RECEIPT_PREFIX)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const key = entry.invoiceKey;

  try {
    const object = await getObjectStream(key, request.headers.get("range"));
    return objectResponse(request, object.stream, () => {
      const headers = new Headers();
      headers.set("content-type", entry.invoiceMime || object.contentType || "application/octet-stream");
      if (object.contentLength != null) headers.set("content-length", String(object.contentLength));
      if (object.contentRange) headers.set("content-range", object.contentRange);
      if (object.etag) headers.set("etag", object.etag);
      headers.set("accept-ranges", "bytes");
      headers.set("x-content-type-options", "nosniff");
      headers.set("referrer-policy", "no-referrer");
      const download = new URL(request.url).searchParams.get("download") === "1";
      headers.set(
        "content-disposition",
        contentDisposition(download ? "attachment" : "inline", entry.invoiceName || "factuur"),
      );
      headers.set("cache-control", "private, max-age=300");
      return { status: object.contentRange ? 206 : 200, headers };
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
