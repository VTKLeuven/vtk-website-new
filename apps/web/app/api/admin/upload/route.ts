import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject } from "@vtk/storage";
import { publicUrl } from "@/lib/storage";
import { requireSession } from "@/lib/session";
import { getFormAccess } from "@/lib/forms/authorization";
import { hasPermission } from "@vtk/auth";
import {
  readLimitedFormData,
  RequestBodyTooLargeError,
} from "@/lib/ticketing/http";

const MAX_REQUEST_BYTES = 46 * 1024 * 1024;
const MAX_BYTES_BY_KIND = {
  image: 45 * 1024 * 1024,
  logo: 10 * 1024 * 1024,
  tile: 2 * 1024 * 1024,
  pdf: 40 * 1024 * 1024,
  file: 40 * 1024 * 1024,
} as const;

type UploadKind = keyof typeof MAX_BYTES_BY_KIND;

function uploadKind(value: FormDataEntryValue | null): UploadKind | null {
  return typeof value === "string" && value in MAX_BYTES_BY_KIND
    ? (value as UploadKind)
    : null;
}

export async function POST(request: Request) {
  const session = await requireSession();
  let form: FormData;
  try {
    form = await readLimitedFormData(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = uploadKind(form.get("kind") ?? "file");
  const formId = String(form.get("formId") ?? "").slice(0, 100);
  if (!kind) return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  const canUpload =
    session.user.isSuperAdmin ||
    hasPermission(session, "pages.edit") ||
    hasPermission(session, "pages.editAll") ||
    hasPermission(session, "pages.manage") ||
    hasPermission(session, "photos.upload") ||
    hasPermission(session, "home.edit") ||
    hasPermission(session, "partners.manage") ||
    hasPermission(session, "calendar.create") ||
    hasPermission(session, "calendar.manageAll") ||
    hasPermission(session, "werkgroepen.manage");

  // Een formuliermanager heeft niet noodzakelijk een globale uploadpermissie.
  // De meegestuurde formulier-id geeft enkel toegang tot een afbeelding voor
  // een formulier dat die gebruiker zelf mag beheren.
  const formManager =
    !canUpload && kind === "image" && formId
      ? (await getFormAccess(formId))?.capabilities.includes("MANAGE_FORM") === true
      : false;

  // Een gewoon werkgroeplid mag afbeeldingen invoegen in de eigen infotekst.
  // Beperk die extra toegang tot image-uploads. Andere bestandstypes blijven
  // achter de bestaande uploadpermissies zitten.
  const werkgroepMember =
    !canUpload && kind === "image" && session.groups.length > 0
      ? await prisma.group.findFirst({
          where: {
            id: { in: session.groups.map((group) => group.id) },
            type: "WERKGROEP",
          },
          select: { id: true },
        })
      : null;

  // Iedereen die inlogt mag persoonlijke dashboardtegels maken, dus ook het
  // logo daarvan uploaden. De permissielijst hierboven zou dat blokkeren voor
  // een gewoon lid, terwijl de tegel zelf wel mag; vandaar deze aparte soort.
  // Ze is bewust klein gehouden (zie de resize verderop) en het resultaat komt
  // onder een eigen prefix, zodat de tegel-actions een key uit een ander
  // prefix kunnen weigeren.
  const tileUpload = kind === "tile";

  if (!canUpload && !formManager && !werkgroepMember && !tileUpload) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  // Een tegellogo van meer dan 2 MB is altijd een vergissing; elk lid kan deze
  // route bereiken, dus hier hoort een plafond.
  if (file.size > MAX_BYTES_BY_KIND[kind]) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
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
      body = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
        .rotate()
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
      contentType = "image/jpeg";
      outputName = "image.jpg";
    } catch {
      return NextResponse.json({ error: "invalid_image" }, { status: 415 });
    }
  } else if (kind === "logo") {
    // Logo's moeten transparantie behouden: JPEG kent geen alfakanaal en sharp
    // plakt die dan op zwart, wat een zwart blok oplevert op een witte tegel.
    prefix = "logos";
    try {
      body = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: 600, height: 200, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      contentType = "image/png";
      outputName = "logo.png";
    } catch {
      return NextResponse.json({ error: "invalid_image" }, { status: 415 });
    }
  } else if (kind === "tile") {
    // Zelfde redenering als bij "logo": een tegellogo staat op een gekleurde
    // chip, dus transparantie moet blijven. De chip is 40px, dus 128px volstaat
    // ook op een retina-scherm en houdt de bucket klein.
    prefix = "tiles";
    try {
      body = await sharp(bytes, { failOn: "error", limitInputPixels: 20_000_000 })
        .rotate()
        .resize({ width: 128, height: 128, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      contentType = "image/png";
      outputName = "tile.png";
    } catch {
      return NextResponse.json({ error: "invalid_image" }, { status: 415 });
    }
  } else if (kind === "pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return NextResponse.json({ error: "invalid_pdf" }, { status: 415 });
    }
    prefix = "pdfs";
    contentType = "application/pdf";
  } else {
    prefix = "files";
    // User-controlled MIME types are unsafe when later served from our own
    // origin. Generic files are always downloaded as opaque bytes.
    contentType = "application/octet-stream";
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
