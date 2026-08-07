import { NextResponse } from "next/server";
import sharp from "sharp";
import { newStorageKey, putObject } from "@vtk/storage";
import { publicUrl } from "@/lib/storage";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { ticketDesignAssetPrefix } from "@/lib/ticketing/design";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function routeError(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_UPLOAD";
  if (code === "UNAUTHENTICATED") return NextResponse.json({ error: code }, { status: 401 });
  if (code === "FORBIDDEN") return NextResponse.json({ error: code }, { status: 403 });
  if (code === "TICKET_EVENT_NOT_FOUND") return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ error: code }, { status: 400 });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    await requireTicketEventCapability(eventId, "MANAGE_EVENT");
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    if (!(file instanceof File)) throw new Error("NO_FILE");
    if (kind !== "artwork" && kind !== "eventLogo" && kind !== "sponsorLogo") throw new Error("INVALID_ASSET_KIND");
    const maxBytes = kind === "artwork" ? 12 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size === 0) throw new Error("EMPTY_FILE");
    if (file.size > maxBytes) throw new Error("FILE_TOO_LARGE");
    if (!allowedTypes.has(file.type)) throw new Error("UNSUPPORTED_IMAGE_TYPE");

    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 32_000_000, failOn: "error" }).rotate();
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) {
      throw new Error("UNSUPPORTED_IMAGE_TYPE");
    }
    let body: Buffer;
    let contentType: string;
    let name: string;
    if (kind === "artwork") {
      // 2480×3508 is A4 at 300dpi. Do not enlarge small originals, but cap
      // giant phone images so ticket PDFs stay fast and predictable.
      body = await image
        .resize({ width: 2480, height: 3508, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toBuffer();
      contentType = "image/jpeg";
      name = "artwork.jpg";
    } else {
      // PNG preserves transparency for logos on every template background.
      body = await image
        .resize({ width: 1200, height: 600, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      contentType = "image/png";
      name = "logo.png";
    }
    const key = newStorageKey(ticketDesignAssetPrefix(eventId).slice(0, -1), name);
    await putObject(key, body, contentType);
    return NextResponse.json({ key, url: publicUrl(key), size: body.length, mime: contentType, kind });
  } catch (error) {
    return routeError(error);
  }
}
