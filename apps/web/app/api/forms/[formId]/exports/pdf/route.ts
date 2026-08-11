import { prisma } from "@vtk/db";
import { requireFormCapability } from "@/lib/forms/authorization";
import { answerToText, exportColumns } from "@/lib/forms/export";
import { generateEntriesPdf } from "@/lib/forms/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een PDF wordt gelezen, niet doorzocht; boven dit aantal verwijzen we naar de CSV. */
const MAX_ENTRIES = 500;

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "formulier";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const { form } = await requireFormCapability(formId, "EXPORT");
    const search = new URL(request.url).searchParams;
    const locale = search.get("locale") === "en" ? "en" : "nl";
    const review = search.get("beoordeling") ?? "";
    const includeTest = search.get("test") === "1";
    const fieldCodes = (search.get("velden") ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter(Boolean);

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
        },
        include: {
          answers: true,
          uploads: { select: { fieldId: true, originalName: true } },
          reviewer: { select: { name: true } },
        },
        orderBy: { submittedAt: "asc" },
        take: MAX_ENTRIES,
      }),
    ]);

    const exportFields = fields.map((field) => ({
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
    }));

    const rows = entries.map((entry) => ({
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
    }));

    const columns = exportColumns(exportFields, rows, { locale, fieldCodes });
    const formatter = new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Brussels",
    });

    const pdf = await generateEntriesPdf({
      locale,
      formTitle: locale === "en" && form.titleEn ? form.titleEn : form.titleNl,
      entries: rows.map((entry) => {
        const byField = new Map(entry.answers.map((row) => [row.fieldId, row]));
        return {
          title: entry.submitterName || entry.submitterEmail || (locale === "en" ? "Anonymous" : "Anoniem"),
          subtitle: [
            formatter.format(entry.submittedAt ?? entry.createdAt),
            entry.submitterEmail,
            entry.reviewStatus,
            entry.isTest ? (locale === "en" ? "test entry" : "testinzending") : null,
          ]
            .filter(Boolean)
            .join(" · "),
          answers: columns.map((column) => ({
            label: locale === "en" && column.labelEn ? column.labelEn : column.labelNl,
            value: answerToText(column, byField.get(column.id), entry.uploads, locale),
          })),
        };
      }),
    });

    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(form.slug)}-inzendingen.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "EXPORT_FAILED";
    if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
    if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
    if (code === "FORM_NOT_FOUND") return Response.json({ error: code }, { status: 404 });
    console.error("PDF-export van inzendingen mislukt", error);
    return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
  }
}
