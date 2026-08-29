import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { getObjectStream } from "@vtk/storage";
import { authErrorResponse } from "@/lib/session";
import { canView, requireExpenseAccess } from "@/lib/rekeningen/server";
import { RECEIPT_PREFIX } from "@/lib/rekeningen/expenses";

export const runtime = "nodejs";

/**
 * Het bonnetje zelf, achter een login.
 *
 * `/api/media/<key>` zou dit ook serveren, maar die route vraagt niets: ze
 * vertrouwt erop dat de keys onraadbaar zijn. Dat is een prima model voor een
 * partnerlogo en een slecht model voor een kassabon met een naam en een
 * rekeningnummer erop. Vandaar deze route, die de rekening opzoekt en de
 * toegang op de rekening zelf toetst.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let access;
  try {
    access = await requireExpenseAccess();
  } catch (error) {
    return authErrorResponse(error);
  }

  const { id } = await context.params;
  const expense = await prisma.expense.findUnique({
    where: { id },
    select: {
      groupId: true,
      submittedById: true,
      paidAt: true,
      sentAt: true,
      bookedAt: true,
      receiptKey: true,
      receiptName: true,
      receiptMime: true,
    },
  });

  if (!expense) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!canView(access, expense)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  // Een key van buiten het bonnetjes-prefix zou van deze route een lezer van de
  // hele bucket maken; dat kan enkel na geknoei in de database, maar de check
  // kost niets.
  if (!expense.receiptKey.startsWith(RECEIPT_PREFIX)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const range = request.headers.get("range");

  try {
    const object = await getObjectStream(expense.receiptKey, range);
    const headers = new Headers();
    headers.set("content-type", expense.receiptMime || object.contentType || "application/octet-stream");
    if (object.contentLength != null) headers.set("content-length", String(object.contentLength));
    if (object.contentRange) headers.set("content-range", object.contentRange);
    if (object.etag) headers.set("etag", object.etag);
    headers.set("accept-ranges", "bytes");
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "no-referrer");
    const download = new URL(request.url).searchParams.get("download") === "1";
    const filename = expense.receiptName.replace(/["\\\r\n]/g, "_") || "bonnetje";
    headers.set(
      "content-disposition",
      `${download ? "attachment" : "inline"}; filename="${filename}"`,
    );
    // Nooit in een gedeelde cache: dit is persoonsgebonden.
    headers.set("cache-control", "private, max-age=300");
    return new Response(Readable.toWeb(object.stream as Readable) as unknown as BodyInit, {
      status: object.contentRange ? 206 : 200,
      headers,
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
