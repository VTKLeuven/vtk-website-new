import { prisma } from "@vtk/db";
import { requireFormCapability } from "@/lib/forms/authorization";
import { answerToText, type ExportField } from "@/lib/forms/export";
import { loadGroupingView } from "@/lib/forms/grouping/view";
import {
  generateGroupsPdf,
  isListColumn,
  type GroupPdfColumn,
} from "@/lib/forms/grouping/pdf";

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
  console.error("PDF van de groepjes mislukt", error);
  return Response.json({ error: "EXPORT_FAILED" }, { status: 500 });
}

/**
 * De groepjes als afdrukbare lijst: één pagina per groep. Naast de CSV, die
 * voor de WhatsApp-groepen en de spreadsheet dient.
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

    const view = await loadGroupingView(formId, locale);
    if (!view.grouping) return Response.json({ error: "GROUPING_NOT_FOUND" }, { status: 404 });

    const fields = await prisma.formField.findMany({
      where: { formId, archivedAt: null },
      include: { options: true },
      orderBy: { sortOrder: "asc" },
    });
    const roleByField = new Map(view.fields.map((field) => [field.id, field.role]));
    const columnFields = fields.filter((field) =>
      isListColumn({ type: field.type, role: roleByField.get(field.id) ?? null })
    );
    const hasAnchor = view.fields.some((field) => field.role === "ANCHOR");

    const exportFields = new Map<string, ExportField>(
      fields.map((field) => [
        field.id,
        {
          id: field.id,
          code: field.code,
          type: field.type,
          labelNl: field.labelNl,
          labelEn: field.labelEn,
          sortOrder: field.sortOrder,
          archivedAt: field.archivedAt,
          options: field.options,
        },
      ])
    );

    // De antwoorden per inzending, enkel voor de kolommen die op de lijst komen.
    const answers = await prisma.formAnswer.findMany({
      where: {
        formId,
        fieldId: { in: columnFields.map((field) => field.id) },
        entry: { groupingMembers: { some: { grouping: { formId } } } },
      },
      select: {
        entryId: true,
        fieldId: true,
        fieldCode: true,
        valueText: true,
        valueNumber: true,
        valueDate: true,
        valueBool: true,
        valueOptions: true,
      },
    });
    const byEntry = new Map<string, Map<string, (typeof answers)[number]>>();
    for (const answer of answers) {
      const forEntry = byEntry.get(answer.entryId) ?? new Map();
      forEntry.set(answer.fieldId, answer);
      byEntry.set(answer.entryId, forEntry);
    }

    const columns: GroupPdfColumn[] = columnFields.map((field) => ({
      label: locale === "en" && field.labelEn ? field.labelEn : field.labelNl,
      weight: field.type === "EMAIL" ? 2 : 1,
    }));

    const pdf = await generateGroupsPdf({
      locale,
      formTitle: locale === "en" && form.titleEn ? form.titleEn : form.titleNl,
      anchorLabel: hasAnchor ? (nl ? "Kern" : "Core") : null,
      columns,
      groups: view.groups.map((group) => ({
        number: group.number,
        memberPeople: group.memberPeople,
        anchorPeople: group.anchorPeople,
        profile: group.profile.map((line) => `${line.label}: ${line.value}`),
        rows: group.members.map((member) => ({
          name: member.name,
          isAnchor: member.isAnchor,
          size: member.size,
          companions: member.companions,
          cells: columnFields.map((field) =>
            answerToText(exportFields.get(field.id)!, byEntry.get(member.entryId)?.get(field.id), [], locale)
          ),
        })),
      })),
    });

    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename(form.slug)}-groepjes.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
