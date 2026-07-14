import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";

// Resolves a short-link slug to its target URL and redirects.
// Reached either directly (`/api/go/<slug>`) or via the proxy rewrite when the
// request host is the short-link host (see proxy.ts, e.g. on.vtk.be/<slug>).
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;

  const link = await prisma.shortLink.findUnique({ where: { slug } });
  const expired = link?.expiresAt != null && link.expiresAt.getTime() <= Date.now();
  if (!link || !link.enabled || expired) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Best-effort click counter; never block the redirect on it.
  prisma.shortLink
    .update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })
    .catch(() => {});

  return NextResponse.redirect(link.url, 307);
}
