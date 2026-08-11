import { prisma } from "@vtk/db";
import { getObjectStream } from "@vtk/storage";
import { getCurrentSession } from "@/lib/session";
import { getFormAccess } from "@/lib/forms/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Eén geüpload bestand downloaden.
 *
 * Bestanden staan in de objectopslag onder een niet te raden sleutel, maar dat
 * is geen toegangscontrole: deze route checkt de grants van het formulier, en
 * laat daarnaast de inzender zelf zijn eigen bestand ophalen.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ formId: string; uploadId: string }> }
) {
  const { formId, uploadId } = await params;

  const upload = await prisma.formFileUpload.findFirst({
    where: { id: uploadId, formId },
    include: { entry: { select: { submittedById: true } } },
  });
  if (!upload) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  const session = await getCurrentSession();
  const isOwner = Boolean(session && upload.entry.submittedById === session.user.id);

  if (!isOwner) {
    if (!session) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    const access = await getFormAccess(formId);
    if (!access || !access.capabilities.includes("VIEW_ENTRIES")) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  try {
    const { stream, contentType } = await getObjectStream(upload.storageKey);
    return new Response(stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": upload.contentType || contentType || "application/octet-stream",
        // `attachment`, niet `inline`: een geüpload bestand van een bezoeker
        // mag nooit als pagina in onze eigen oorsprong openen.
        "Content-Disposition": `attachment; filename="${upload.originalName.replace(/["\\]/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Formulierbestand ophalen mislukt", error);
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  }
}
