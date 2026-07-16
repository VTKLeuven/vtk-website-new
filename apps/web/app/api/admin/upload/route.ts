import { NextResponse } from "next/server";
import sharp from "sharp";
import { newStorageKey, putObject } from "@vtk/storage";
import { publicUrl } from "@/lib/storage";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";

export async function POST(request: Request) {
  const session = await requireSession();
  if (
    !session.user.isSuperAdmin &&
    !hasPermission(session, "pages.edit") &&
    !hasPermission(session, "pages.editAll") &&
    !hasPermission(session, "pages.manage") &&
    !hasPermission(session, "photos.upload") &&
    !hasPermission(session, "home.edit") &&
    !hasPermission(session, "partners.manage") &&
    !hasPermission(session, "calendar.create") &&
    !hasPermission(session, "calendar.manageAll")
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const kind = (form.get("kind") as string) || "file";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let body: Buffer = bytes;
  let contentType = file.type || "application/octet-stream";
  let prefix = "uploads";
  // Wanneer we het bestand hercoderen, moet de key-extensie het resultaat volgen
  // en niet de originele naam. null = originele naam/extensie behouden.
  let outputName: string | null = null;

  if (kind === "image") {
    prefix = "images";
    try {
      body = await sharp(bytes).rotate().jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      contentType = "image/jpeg";
    } catch {
      /* fall back to raw bytes */
    }
  } else if (kind === "logo") {
    // Logo's moeten transparantie behouden: JPEG kent geen alfakanaal en sharp
    // plakt die dan op zwart, wat een zwart blok oplevert op een witte tegel.
    prefix = "logos";
    if (contentType === "image/svg+xml") {
      // SVG blijft as-is: al klein en schaalt scherp mee.
    } else {
      try {
        body = await sharp(bytes)
          .rotate()
          .resize({ width: 600, height: 200, fit: "inside", withoutEnlargement: true })
          .png()
          .toBuffer();
        contentType = "image/png";
        outputName = "logo.png";
      } catch {
        /* fall back to raw bytes */
      }
    }
  } else if (kind === "pdf") {
    prefix = "pdfs";
    contentType = "application/pdf";
  } else {
    prefix = "files";
  }

  const key = newStorageKey(prefix, outputName ?? file.name);
  await putObject(key, body, contentType);

  return NextResponse.json({
    key,
    url: publicUrl(key),
    size: body.length,
    mime: contentType,
    name: file.name,
  });
}
