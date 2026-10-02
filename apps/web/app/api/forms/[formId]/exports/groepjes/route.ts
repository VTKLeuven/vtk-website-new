import { prisma } from "@vtk/db";
import { requireFormCapability } from "@/lib/forms/authorization";
import { answerToText, exportColumns, type ExportField } from "@/lib/forms/export";
import { createCsv, type CsvValue } from "@/lib/ticketing/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "formulier";
}

function errorResponse(error: unknown): Response {
  const code = error instanceof Error ? error.message : "EXPORT_FAILED";
  if (code === "UNAUTHENTICATED") return Response.json({ error: code }, { status: 401 });
  if (code === "FORBIDDEN") return Response.json({ error: code }, { status: 403 });
  if (code === "FORM_NOT_FOUND") return Response.json({ error: code }, { status: 404 });
  console.error("Export van de groepjes mislukt", error);
  return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
}

/**
 * De groepjes als CSV: één rij per inzending, gesorteerd per groep met de kern
 * bovenaan, en daarachter alle antwoorden. Zo kan onthaal of internationaal er
 * meteen de WhatsApp-groepen of de kwistafels mee maken.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ formId: string }> }
) {
  try {
    const { formId } = await params;
    const { form } = await requireFormCapability(formId, "VIEW_GROUPING");
    const locale = new URL(request.url).searchParams.get("locale") === "en" ? "en" : "nl";
    const nl = locale === "nl";

    const [fields, grouping] = await Promise.all([
      prisma.formField.findMany({
        where: { formId },
        include: { options: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.formGrouping.findUnique({
        where: { formId },
        include: {
          groups: {
            orderBy: { number: "asc" },
            include: {
              members: {
                orderBy: [{ isAnchor: "desc" }, { entry: { submittedAt: "asc" } }],
                include: {
                  entry: {
                    include: {
                      answers: true,
                      uploads: { select: { fieldId: true, originalName: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);
    if (!grouping) return Response.json({ error: "GROUPING_NOT_FOUND" }, { status: 404 });

    const exportFields: ExportField[] = fields.map((field) => ({
      id: field.id,
      code: field.code,
      type: field.type,
      labelNl: field.labelNl,
      labelEn: field.labelEn,
      sortOrder: field.sortOrder,
      archivedAt: field.archivedAt,
      options: field.options,
    }));
    const members = grouping.groups.flatMap((group) =>
      group.members.map((member) => ({ group: group.number, member }))
    );
    const columns = exportColumns(
      exportFields,
      members.map(({ member }) => ({
        id: member.entry.id,
        status: member.entry.status,
        reviewStatus: member.entry.reviewStatus,
        internalNote: null,
        submitterName: null,
        submitterEmail: null,
        submittedAt: member.entry.submittedAt,
        createdAt: member.entry.createdAt,
        isTest: member.entry.isTest,
        reviewerName: null,
        answers: member.entry.answers,
        uploads: member.entry.uploads,
      })),
      { locale }
    );

    const headers = [
      nl ? "Groep" : "Group",
      nl ? "Kern" : "Core",
      nl ? "Naam (account)" : "Name (account)",
      nl ? "E-mail (account)" : "E-mail (account)",
      ...columns.map((field) => (locale === "en" && field.labelEn ? field.labelEn : field.labelNl)),
    ];
    const rows: CsvValue[][] = members.map(({ group, member }) => {
      const answers = new Map(member.entry.answers.map((answer) => [answer.fieldId, answer]));
      return [
        group,
        member.isAnchor ? (nl ? "ja" : "yes") : "",
        member.entry.submitterName ?? "",
        member.entry.submitterEmail ?? "",
        ...columns.map((field) =>
          answerToText(field, answers.get(field.id), member.entry.uploads, locale)
        ),
      ];
    });

    return new Response(createCsv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeFilename(form.slug)}-groepjes.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
