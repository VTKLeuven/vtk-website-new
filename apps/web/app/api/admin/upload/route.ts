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
    !hasPermission(session, "photos.upload") &&
    !hasPermission(session, "home.edit")
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

  if (kind === "image") {
    prefix = "images";
    try {
      body = await sharp(bytes).rotate().jpeg({ quality: 86, mozjpeg: true }).toBuffer();
      contentType = "image/jpeg";
    } catch {
      /* fall back to raw bytes */
    }
  } else if (kind === "pdf") {
    prefix = "pdfs";
    contentType = "application/pdf";
  } else {
    prefix = "files";
  }

  const key = newStorageKey(prefix, file.name);
  await putObject(key, body, contentType);

  return NextResponse.json({
    key,
    url: publicUrl(key),
    size: body.length,
    mime: contentType,
    name: file.name,
  });
}
