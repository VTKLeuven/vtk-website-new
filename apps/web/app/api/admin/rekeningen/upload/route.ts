import { NextResponse } from "next/server";
import sharp from "sharp";
import { newStorageKey, putObject } from "@vtk/storage";
import { authErrorResponse } from "@/lib/session";
import { readLimitedFormData, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import { requireExpenseAccess } from "@/lib/rekeningen/server";
import { isAllowedReceiptName, MAX_RECEIPT_BYTES } from "@/lib/rekeningen/expenses";

export const runtime = "nodejs";

/**
 * Upload van één bonnetje.
 *
 * Bewust een eigen route en niet de gedeelde `/api/admin/upload`: die legt alles onder
 * `images/` of `files/`, en die keys zijn via `/api/media` zonder login op te
 * halen. Een bonnetje draagt een naam, een bedrag en soms een rekeningnummer,
 * dus het komt onder `bonnetjes/` en gaat enkel via de afgeschermde leesroute
 * naar buiten.
 *
 * Foto's worden hercodeerd naar JPEG. Dat comprimeert de telefoonfoto's die
 * hier binnenkomen én gooit de EXIF weg, inclusief de GPS-coördinaten die een
 * telefoon standaard in een kassabonfoto stopt.
 */

const MAX_REQUEST_BYTES = MAX_RECEIPT_BYTES + 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireExpenseAccess();
  } catch (error) {
    return authErrorResponse(error);
  }

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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!isAllowedReceiptName(file.name)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = file.name.toLowerCase().endsWith(".pdf");

  let body: Buffer;
  let contentType: string;
  let outputName: string;

  if (isPdf) {
    // De magic bytes controleren, niet de extensie: die zegt enkel wat iemand
    // getypt heeft. Het blad laadt dit bestand later als PDF-document, dus een
    // JPEG met een .pdf-naam zou pas bij het genereren stukgaan.
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      return NextResponse.json({ error: "invalid_pdf" }, { status: 415 });
    }
    body = bytes;
    contentType = "application/pdf";
    outputName = "bon.pdf";
  } else {
    try {
      body = await sharp(bytes, { failOn: "error", limitInputPixels: 40_000_000 })
        // `rotate()` zonder argument past de EXIF-oriëntatie toe voor we die
        // metadata weggooien; anders ligt een staande foto plots op zijn kant.
        .rotate()
        .jpeg({ quality: 86, mozjpeg: true })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "invalid_image" }, { status: 415 });
    }
    contentType = "image/jpeg";
    outputName = "bon.jpg";
  }

  const key = newStorageKey("bonnetjes", outputName);
  await putObject(key, body, contentType);

  return NextResponse.json({
    key,
    name: file.name,
    size: body.length,
    mime: contentType,
  });
}
