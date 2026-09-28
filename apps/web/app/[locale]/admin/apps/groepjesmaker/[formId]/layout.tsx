import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { GroupingAdminNav } from "@/components/forms/admin/GroupingAdminNav";
import type { AdminLocale } from "@/components/forms/admin/format";

export default async function GroupMakerDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { form, capabilities } = await requireFormCapability(formId, "VIEW_GROUPING");
  // Zonder groepjesmaker toont de eerste tab de lege staat; de andere twee
  // hebben dan niets om te tonen, dus blijven de tabbladen weg.
  const hasGrouping = (await prisma.formGrouping.count({ where: { formId } })) > 0;

  return (
    <div className="ticket-admin-event">
      <GroupingAdminNav
        locale={locale}
        form={{
          id: form.id,
          title: locale === "en" && form.titleEn ? form.titleEn : form.titleNl,
          slug: form.slug,
          status: form.status,
        }}
        canManage={capabilities.includes("MANAGE_GROUPING")}
        canManageForm={capabilities.includes("MANAGE_FORM")}
        showTabs={hasGrouping}
      />
      {children}
    </div>
  );
}
