import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { streamAlbumZip } from "@vtk/storage";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const ids = url.searchParams.getAll("ids").filter(Boolean);

  const album = await prisma.photoAlbum.findUnique({
    where: { slug },
    include: {
      photos: {
        where: ids.length > 0 ? { id: { in: ids } } : undefined,
        orderBy: { order: "asc" },
      },
    },
  });
  if (!album || !album.publishedAt) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (album.photos.length === 0) {
    return new NextResponse("Empty album", { status: 400 });
  }

  const entries = album.photos.map((p, idx) => ({
    key: p.storageKey,
    name: (p.originalName?.replace(/[\\/]/g, "_") ?? `${album.slug}-${String(idx + 1).padStart(4, "0")}.jpg`),
  }));

  const filename = `${album.slug}${ids.length > 0 ? "-selection" : ""}.zip`;
  const stream = streamAlbumZip(entries);

  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
