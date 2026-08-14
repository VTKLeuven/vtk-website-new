import { prisma } from "@vtk/db";
import { createStyledShortlinkQrPng } from "@/lib/shortlink-qr";
import { shortlinkPublicUrl } from "@/lib/shortlinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De QR bevat uitsluitend de publieke verkorte URL. De afbeelding zelf hoeft
 * daarom niet achter de adminsessie te zitten; dat zou een <img>-request
 * onnodig afhankelijk maken van cookie-authenticatie. We controleren wel dat
 * de slug echt bestaat, zodat dit geen algemene QR-renderdienst wordt.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const link = await prisma.shortLink.findUnique({
    where: { slug },
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
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
