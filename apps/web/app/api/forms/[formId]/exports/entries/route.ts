import { prisma } from "@vtk/db";
import { requireFormCapability } from "@/lib/forms/authorization";
import { buildEntriesCsv } from "@/lib/forms/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 20_000;

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "formulier";
}

function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message : "EXPORT_FAILED";
  if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
  if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
  if (code === "FORM_NOT_FOUND") return Response.json({ error: code }, { status: 404 });
  console.error("Export van inzendingen mislukt", error);
  return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
}

/**
 * CSV van de inzendingen, met kolomkeuze (`velden=code,code`) en dezelfde
 * filters als de tabel, zodat "exporteer wat ik nu zie" klopt.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const { form } = await requireFormCapability(formId, "EXPORT");
    const search = new URL(request.url).searchParams;
    const locale = search.get("locale") === "en" ? "en" : "nl";
    const fieldCodes = (search.get("velden") ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);
    const review = search.get("beoordeling") ?? "";
    const includeTest = search.get("test") === "1";
    const query = search.get("q")?.trim().slice(0, 200) ?? "";

    const [fields, entries] = await Promise.all([
      prisma.formField.findMany({
        where: { formId },
        include: { options: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.formEntry.findMany({
        where: {
          formId,
          status: "SUBMITTED",
          ...(includeTest ? {} : { isTest: false }),
          ...(["NEW", "ACCEPTED", "REJECTED"].includes(review)
            ? { reviewStatus: review as "NEW" | "ACCEPTED" | "REJECTED" }
            : {}),
          ...(query
            ? {
                OR: [
                  { submitterName: { contains: query, mode: "insensitive" } },
                  { submitterEmail: { contains: query, mode: "insensitive" } },
                  { answers: { some: { valueText: { contains: query, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        include: {
          answers: true,
          uploads: { select: { fieldId: true, originalName: true } },
          reviewer: { select: { name: true } },
        },
        orderBy: { submittedAt: "asc" },
        take: MAX_ROWS,
      }),
    ]);

    const csv = buildEntriesCsv(
      fields.map((field) => ({
        id: field.id,
        code: field.code,
        type: field.type,
        labelNl: field.labelNl,
        labelEn: field.labelEn,
        sortOrder: field.sortOrder,
        archivedAt: field.archivedAt,
        options: field.options.map((option) => ({
          code: option.code,
          labelNl: option.labelNl,
          labelEn: option.labelEn,
        })),
      })),
      entries.map((entry) => ({
        id: entry.id,
        status: entry.status,
        reviewStatus: entry.reviewStatus,
        internalNote: entry.internalNote,
        submitterName: entry.submitterName,
        submitterEmail: entry.submitterEmail,
        submittedAt: entry.submittedAt,
        createdAt: entry.createdAt,
        isTest: entry.isTest,
        reviewerName: entry.reviewer?.name ?? null,
        answers: entry.answers,
        uploads: entry.uploads,
      })),
      { locale, fieldCodes, includeMetadata: search.get("meta") !== "0" }
    );

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(form.slug)}-inzendingen.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
