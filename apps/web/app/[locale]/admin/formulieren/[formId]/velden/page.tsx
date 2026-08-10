import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { FieldEditor, type EditorField } from "@/components/forms/admin/FieldEditor";
import type { AdminLocale } from "@/components/forms/admin/format";
import { optionAnswerCounts } from "@/lib/forms/optionAnswerCounts";

export default async function FormFieldsPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { form } = await requireFormCapability(formId, "MANAGE_FORM");

  const [sections, fields, optionAnswers] = await Promise.all([
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
    prisma.formAnswer.findMany({
      where: { formId },
      select: { fieldId: true, valueOptions: true },
    }),
  ]);

  const answerCounts = optionAnswerCounts(optionAnswers);

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
      answerCount: answerCounts.get(field.id)?.get(option.code) ?? 0,
      allowWaitlist: option.allowWaitlist,
      nextSectionId: option.nextSectionId,
      endsForm: option.endsForm,
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
      <FieldEditor
        formId={formId}
        locale={locale}
        sections={sections.map((section) => ({
          id: section.id,
          titleNl: section.titleNl,
          titleEn: section.titleEn,
          descriptionNl: section.descriptionNl,
          descriptionEn: section.descriptionEn,
          nextSectionId: section.nextSectionId,
          endsForm: section.endsForm,
        }))}
        fields={editorFields}
        branching={{ enabled: form.stepBySections }}
      />
    </div>
  );
}
