import { NextResponse } from "next/server";
import { prisma } from "@vtk/db";
import { newStorageKey, putObject } from "@vtk/storage";
import { getCurrentSession } from "@/lib/session";
import { readLimitedFormData, RequestBodyTooLargeError } from "@/lib/ticketing/http";
import {
  DEFAULT_FILE_MAX_SIZE_MB,
  parseFieldConfig,
} from "@/lib/forms/schema";
import { createUploadToken, extensionOf } from "@/lib/forms/uploadToken";
import { formAvailability } from "@/lib/forms/publicForm";

export const runtime = "nodejs";

const HARD_LIMIT_BYTES = 51 * 1024 * 1024;

/**
 * Eén bestand voor één uploadveld. Het bestand gaat meteen naar de
 * objectopslag; de browser krijgt een ondertekende verwijzing terug en stuurt
 * die mee bij het indienen. Zo hoeft het formulier zelf geen bestanden te
 * versturen en werkt een voortgangsindicator vanzelf.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  const { formId } = await params;

  const form = await prisma.form.findUnique({
    where: { id: formId },
    select: {
      id: true,
      status: true,
      audience: true,
      opensAt: true,
      closesAt: true,
      maxEntries: true,
      localeMode: true,
      allowMultipleSubmissions: true,
    },
  });
  if (!form) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const session = await getCurrentSession();
  // Uploaden mag enkel zolang het formulier ook echt invulbaar is; anders is
  // dit een gratis opslagplek voor wie de URL kent.
  const availability = formAvailability(
    { ...form, submittedCount: 0 },
    { loggedIn: Boolean(session), ownEntries: 0, locale: "nl" }
  );
  if (availability !== "OPEN" && availability !== "LANGUAGE_UNAVAILABLE") {
    return NextResponse.json({ error: "closed" }, { status: 403 });
  }
  if (form.audience === "MEMBERS" && !session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: FormData;
  try {
    body = await readLimitedFormData(request, HARD_LIMIT_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "too_large" }, { status: 413 });
    }
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const fieldId = String(body.get("fieldId") ?? "");
  const file = body.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "invalid_file" }, { status: 400 });
  }

  const field = await prisma.formField.findFirst({
    where: { id: fieldId, formId, archivedAt: null, type: "FILE" },
    select: { id: true, config: true },
  });
  if (!field) return NextResponse.json({ error: "invalid_field" }, { status: 400 });

  const config = parseFieldConfig("FILE", field.config);
  const maxBytes = (config.maxSizeMb ?? DEFAULT_FILE_MAX_SIZE_MB) * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: "too_large", maxBytes }, { status: 413 });
  }

  const extension = extensionOf(file.name);
  if (config.allowedExtensions?.length && !config.allowedExtensions.includes(extension)) {
    return NextResponse.json(
      { error: "invalid_type", allowed: config.allowedExtensions },
      { status: 415 }
    );
  }

  const storageKey = newStorageKey(`forms/${formId}`, file.name);
  await putObject(
    storageKey,
    Buffer.from(await file.arrayBuffer()),
    file.type || "application/octet-stream"
  );

  return NextResponse.json({
    token: createUploadToken({
      formId,
      fieldId,
      storageKey,
      originalName: file.name.slice(0, 200),
      contentType: file.type || null,
      sizeBytes: file.size,
    }),
    name: file.name.slice(0, 200),
    sizeBytes: file.size,
  });
}
