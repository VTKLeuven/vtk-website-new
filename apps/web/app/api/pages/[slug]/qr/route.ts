import { prisma } from "@vtk/db";
import { createStyledVtkQrPng } from "@/lib/shortlink-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * De QR bevat de publieke URL van de pagina (/p/<slug>). De afbeelding zelf hoeft
 * niet achter de adminsessie te zitten; dat zou een <img>-request onnodig
 * afhankelijk maken van cookie-authenticatie. We controleren wel dat de
 * pagina-slug echt bestaat in de database, zodat dit geen algemene
 * QR-renderdienst wordt.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const page = await prisma.page.findUnique({
    where: { slug },
    select: { slug: true },
  });
  if (!page) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const host = request.headers.get("host") ?? "vtk.be";
  const publicUrl = `https://${host}/p/${page.slug}`;
  const png = await createStyledVtkQrPng(publicUrl);
  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `vtk-${page.slug}-qr.png`;

  return new Response(Buffer.from(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      // De QR is goedkoop en enkel in de admin zichtbaar. Niet cachen voorkomt
      // dat een browser of CDN na een ontwerpwijziging een oude PNG blijft tonen.
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
