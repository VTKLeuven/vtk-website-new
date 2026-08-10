import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import {
  CalendarClock,
  Copy,
  Inbox,
  ListChecks,
  Pencil,
  Users,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { deleteFormAction, duplicateFormAction } from "@/app/actions/forms";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import {
  audienceLabel,
  formatDateTime,
  formatNumber,
  formBase,
  type AdminLocale,
} from "@/components/forms/admin/format";

export default async function FormAdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string }>;
}) {
  const { locale: localeParam, formId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { form, capabilities } = await requireFormCapability(formId, "VIEW_FORM");
  const nl = locale === "nl";
  const base = formBase(locale);
  const canManage = capabilities.includes("MANAGE_FORM");

  const [fieldCount, submitted, drafts, grantCount] = await Promise.all([
    prisma.formField.count({ where: { formId, archivedAt: null } }),
    prisma.formEntry.count({ where: { formId, status: "SUBMITTED", isTest: false } }),
    prisma.formEntry.count({ where: { formId, status: "DRAFT" } }),
    prisma.formUserGrant.count({ where: { formId } }),
  ]);

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-metrics">
        <AdminMetric
          icon={Inbox}
          label={nl ? "Inzendingen" : "Entries"}
          value={
            form.maxEntries
              ? `${formatNumber(submitted, locale)} / ${formatNumber(form.maxEntries, locale)}`
              : formatNumber(submitted, locale)
          }
        />
        <AdminMetric
          icon={ListChecks}
          label={nl ? "Velden" : "Fields"}
          value={formatNumber(fieldCount, locale)}
          tone={fieldCount === 0 ? "warning" : "default"}
        />
        <AdminMetric
          icon={Pencil}
          label={nl ? "Concepten" : "Drafts"}
          value={formatNumber(drafts, locale)}
        />
        <AdminMetric
          icon={Users}
          label={nl ? "Medewerkers" : "Staff"}
          value={formatNumber(grantCount, locale)}
        />
      </div>

      {fieldCount === 0 ? (
        <section className="ticket-admin-section ticket-admin-section-compact">
          <p className="form-admin-hint">
            {nl
              ? "Dit formulier heeft nog geen velden, dus je kan het nog niet online zetten."
              : "This form has no fields yet, so it cannot go online."}
          </p>
        </section>
      ) : null}

      <section className="ticket-admin-section" aria-labelledby="form-summary-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <CalendarClock aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="form-summary-heading">{nl ? "Samenvatting" : "Summary"}</h2>
            </div>
          </div>
        </div>
        <dl className="ticket-admin-definitions">
          <div>
            <dt>{nl ? "Publieke link" : "Public link"}</dt>
            <dd>
              <Link href={`${base}/formulieren/${form.slug}`}>/formulieren/{form.slug}</Link>
            </dd>
          </div>
          <div>
            <dt>{nl ? "Doelpubliek" : "Audience"}</dt>
            <dd>{audienceLabel(form.audience, locale)}</dd>
          </div>
          <div>
            <dt>{nl ? "Opent" : "Opens"}</dt>
            <dd>{formatDateTime(form.opensAt, locale)}</dd>
          </div>
          <div>
            <dt>{nl ? "Sluit" : "Closes"}</dt>
            <dd>{formatDateTime(form.closesAt, locale)}</dd>
          </div>
          <div>
            <dt>{nl ? "Eigenaar" : "Owner"}</dt>
            <dd>{locale === "en" ? form.ownerGroup.nameEn : form.ownerGroup.nameNl}</dd>
          </div>
          {form.calendarEvent ? (
            <div>
              <dt>{nl ? "Evenement" : "Event"}</dt>
              <dd>
                {locale === "en" && form.calendarEvent.titleEn
                  ? form.calendarEvent.titleEn
                  : form.calendarEvent.titleNl}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{nl ? "Bewaartermijn" : "Retention"}</dt>
            <dd>
              {form.retentionDays
                ? nl
                  ? `${form.retentionDays} dagen`
                  : `${form.retentionDays} days`
                : nl
                  ? "Niet automatisch verwijderen"
                  : "No automatic deletion"}
            </dd>
          </div>
        </dl>
      </section>

      {canManage ? (
        <section className="ticket-admin-section" aria-labelledby="form-actions-heading">
          <div className="ticket-admin-section-head">
            <div>
              <h2 id="form-actions-heading">{nl ? "Beheer" : "Management"}</h2>
              <p>
                {nl
                  ? "Een kopie neemt de velden, secties en instellingen over, maar geen inzendingen."
                  : "A copy takes over the fields, sections and settings, but no entries."}
              </p>
            </div>
          </div>
          <div className="ticket-admin-row-actions">
            <form action={duplicateFormAction}>
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="formId" value={formId} />
              <button className="ticket-admin-button" type="submit">
                <Copy aria-hidden="true" size={15} />
                {nl ? "Formulier dupliceren" : "Duplicate form"}
              </button>
            </form>
            <DeleteButton
              action={deleteFormAction}
              fields={{ locale, formId }}
              title={nl ? "Formulier verwijderen?" : "Delete this form?"}
              description={
                submitted + drafts > 0
                  ? nl
                    ? `Dit verwijdert het formulier, zijn velden en ${submitted + drafts} inzending(en) met hun bestanden. Dat kan niet ongedaan gemaakt worden; exporteer de inzendingen eerst als je ze nog nodig hebt.`
                    : `This deletes the form, its fields and ${submitted + drafts} entr(ies) with their files. This cannot be undone; export the entries first if you still need them.`
                  : nl
                    ? "Dit verwijdert het formulier en zijn velden. Er zijn nog geen inzendingen, dus er gaan geen antwoorden verloren."
                    : "This deletes the form and its fields. There are no entries yet, so no answers are lost."
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
            >
              {nl ? "Formulier verwijderen" : "Delete form"}
            </DeleteButton>
          </div>
        </section>
      ) : null}
    </div>
  );
}
