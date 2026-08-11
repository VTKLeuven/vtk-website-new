import { prisma } from "@vtk/db";
import { streamAlbumZip } from "@vtk/storage";
import { requireFormCapability } from "@/lib/forms/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 2_000;

function safeName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "bestand";
}

/**
 * Alle geüploade bestanden van een formulier als één zip, met per inzending een
 * eigen map. Zonder die mappen krijg je twintig bestanden met de naam `cv.pdf`
 * en weet niemand nog van wie ze zijn.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const { form } = await requireFormCapability(formId, "EXPORT");

    const uploads = await prisma.formFileUpload.findMany({
      where: { formId, entry: { status: "SUBMITTED" } },
      include: {
        entry: { select: { id: true, submitterName: true, submitterEmail: true } },
        field: { select: { code: true } },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_FILES,
    });

    if (uploads.length === 0) {
      return Response.json({ error: "NO_FILES" }, { status: 404 });
    }

    const seen = new Map<string, number>();
    const entries = uploads.map((upload) => {
      const who = safeName(
        upload.entry.submitterName || upload.entry.submitterEmail || upload.entry.id
      );
      const folder = `${who}-${upload.entry.id.slice(-6)}`;
      let name = `${folder}/${safeName(upload.field.code)}-${safeName(upload.originalName)}`;
      // Twee keer dezelfde naam binnen één inzending zou stil overschreven
      // worden in het archief.
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      if (count > 1) name = name.replace(/(\.[^.]+)?$/, `-${count}$1`);
      return { key: upload.storageKey, name };
    });

    return new Response(streamAlbumZip(entries), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName(form.slug)}-bestanden.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPORT_FAILED";
    if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
    if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
    if (code === "FORM_NOT_FOUND") return Response.json({ error: code }, { status: 404 });
    console.error("Zip van formulierbestanden mislukt", error);
    return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
  }
}
