import { notFound, redirect } from "next/navigation";
import { Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { loadGroupingView } from "@/lib/forms/grouping/view";
import { deleteGroupingAction } from "@/app/actions/formGrouping";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { GroupingSettingsForm } from "@/components/forms/admin/GroupingForms";
import { formBase, type AdminLocale } from "@/components/forms/admin/format";

/** Tabblad Instellingen: de grenzen per groep en wanneer er ingedeeld wordt. */
export default async function GroupMakerSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const base = formBase(locale);
  await requireFormCapability(formId, "MANAGE_GROUPING");
  const view = await loadGroupingView(formId, locale);
  if (!view.grouping) redirect(`${base}/admin/apps/groepjesmaker/${formId}`);

  const groupCount = view.groups.length;

  return (
    <div className="ticket-admin-page">
      <section className="ticket-admin-section" aria-labelledby="grouping-settings-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <Settings2 aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="grouping-settings-heading">{nl ? "Instellingen" : "Settings"}</h2>
              <p>
                {nl
                  ? "Hoe groot een groep wordt, en wanneer de site indeelt. Een wijziging geldt vanaf de volgende indeling."
                  : "How big a group gets, and when the site divides. A change applies from the next division."}
              </p>
            </div>
          </div>
        </div>
        <GroupingSettingsForm
          locale={locale}
          formId={formId}
          settings={view.grouping}
          hasAnchor={view.fields.some((field) => field.role === "ANCHOR")}
        />
      </section>

      <section className="ticket-admin-section" aria-labelledby="grouping-danger-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="grouping-danger-heading">
              {nl ? "Groepjesmaker uitzetten" : "Disable the group maker"}
            </h2>
            <p>
              {nl
                ? "De form en haar inzendingen blijven staan; enkel de indeling en deze instellingen verdwijnen."
                : "The form and its entries stay; only the division and these settings are removed."}
            </p>
          </div>
        </div>
        <div className="form-grouping-actions">
          <DeleteButton
            action={deleteGroupingAction}
            fields={{ formId, locale }}
            title={nl ? "Groepjesmaker uitzetten?" : "Disable the group maker?"}
            description={
              nl
                ? `De instellingen en ${groupCount} groep(en) verdwijnen. De inzendingen blijven staan, net als de form zelf; je kan er later een nieuwe groepjesmaker op zetten.`
                : `The settings and ${groupCount} group(s) are removed. The entries stay, as does the form itself; you can put a new group maker on it later.`
            }
            confirmLabel={nl ? "Uitzetten" : "Disable"}
            cancelLabel={nl ? "Annuleren" : "Cancel"}
          >
            {nl ? "Groepjesmaker uitzetten" : "Disable group maker"}
          </DeleteButton>
        </div>
      </section>
    </div>
  );
}
