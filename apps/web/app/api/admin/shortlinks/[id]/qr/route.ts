import { prisma } from "@vtk/db";
import { authErrorResponse, requirePermission } from "@/lib/session";
import { createStyledShortlinkQrPng } from "@/lib/shortlink-qr";
import { shortlinkPublicUrl } from "@/lib/shortlinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("shortlinks.manage");
  } catch (error) {
    return authErrorResponse(error);
  }

  const { id } = await params;
  const link = await prisma.shortLink.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!link) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const host = request.headers.get("host") ?? "vtk.be";
  const publicUrl = shortlinkPublicUrl(host, link.slug);
  const png = await createStyledShortlinkQrPng(publicUrl);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `vtk-${link.slug}-qr.png`;

  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
