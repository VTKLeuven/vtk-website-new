import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { FieldEditor, type EditorField } from "@/components/forms/admin/FieldEditor";
import { SectionManager } from "@/components/forms/admin/SectionManager";
import type { AdminLocale } from "@/components/forms/admin/format";

export default async function FormFieldsPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  await requireFormCapability(formId, "MANAGE_FORM");

  const [sections, fields] = await Promise.all([
    prisma.formSection.findMany({ where: { formId }, orderBy: { sortOrder: "asc" } }),
    prisma.formField.findMany({
      where: { formId },
      include: {
        options: { orderBy: { sortOrder: "asc" } },
        conditions: { orderBy: { sortOrder: "asc" } },
        _count: { select: { answers: true } },
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const editorFields: EditorField[] = fields.map((field) => ({
    id: field.id,
    code: field.code,
    type: field.type,
    sectionId: field.sectionId,
    labelNl: field.labelNl,
    labelEn: field.labelEn,
    helpNl: field.helpNl,
    helpEn: field.helpEn,
    required: field.required,
    config: field.config,
    options: field.options.map((option) => ({
      id: option.id,
      code: option.code,
      labelNl: option.labelNl,
      labelEn: option.labelEn,
      quotaLimit: option.quotaLimit,
      quotaUsed: option.quotaUsed,
      archivedAt: option.archivedAt?.toISOString() ?? null,
    })),
    conditions: field.conditions.map((condition) => ({
      sourceFieldId: condition.sourceFieldId,
      operator: condition.operator,
      value: condition.value,
    })),
    answerCount: field._count.answers,
    archivedAt: field.archivedAt?.toISOString() ?? null,
  }));

  return (
    <div className="ticket-admin-page">
      <SectionManager
        locale={locale}
        formId={formId}
        sections={sections.map((section) => ({
          id: section.id,
          titleNl: section.titleNl,
          titleEn: section.titleEn,
          descriptionNl: section.descriptionNl,
          descriptionEn: section.descriptionEn,
          fieldCount: fields.filter(
            (field) => field.sectionId === section.id && !field.archivedAt
          ).length,
        }))}
      />
      <FieldEditor
        formId={formId}
        locale={locale}
        sections={sections.map((section) => ({
          id: section.id,
          titleNl: section.titleNl,
          titleEn: section.titleEn,
        }))}
        fields={editorFields}
      />
    </div>
  );
}
