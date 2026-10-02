import { notFound, redirect } from "next/navigation";
import { ListChecks } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { loadGroupingView } from "@/lib/forms/grouping/view";
import { GroupingRolesForm } from "@/components/forms/admin/GroupingForms";
import { formBase, type AdminLocale } from "@/components/forms/admin/format";

/** Tabblad Vragen: wat elke vraag van de form betekent voor de indeling. */
export default async function GroupMakerQuestionsPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const base = formBase(locale);
  const { form, capabilities } = await requireFormCapability(formId, "MANAGE_GROUPING");
  const view = await loadGroupingView(formId, locale);
  // Geen groepjesmaker: de eerste tab zegt dat, deze heeft niets te tonen.
  if (!view.grouping) redirect(`${base}/admin/apps/groepjesmaker/${formId}`);

  return (
    <div className="ticket-admin-page">
      <section className="ticket-admin-section" aria-labelledby="grouping-questions-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <ListChecks aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="grouping-questions-heading">{nl ? "Vragen" : "Questions"}</h2>
              <p>
                {nl
                  ? "Welke vraag telt mee bij het indelen, en hoe zwaar. Een wijziging geldt vanaf de volgende indeling."
                  : "Which question counts when dividing, and how heavily. A change applies from the next division."}
              </p>
            </div>
          </div>
        </div>
        <GroupingRolesForm
          locale={locale}
          formId={formId}
          fields={view.fields}
          linkedForm={{
            title: locale === "en" && form.titleEn ? form.titleEn : form.titleNl,
            slug: form.slug,
            editHref: capabilities.includes("MANAGE_FORM")
              ? `${base}/admin/formulieren/${form.id}/velden`
              : null,
            publicHref: `${base}/formulieren/${form.slug}`,
          }}
        />
      </section>
    </div>
  );
}
