import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { ChevronRight, Plus, Shuffle } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import {
  canAccessAnyForm,
  formCapabilitiesByForm,
  visibleFormsFilter,
} from "@/lib/forms/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { FormStatusBadge } from "@/components/forms/admin/FormStatusBadge";
import { CreateGroupingForm } from "@/components/forms/admin/GroupingForms";
import {
  formatDateTime,
  formatNumber,
  formBase,
  type AdminLocale,
} from "@/components/forms/admin/format";

/**
 * Alle groepjesmakers die je mag zien, en een nieuwe maken op een form die je
 * beheert. De vragen zelf staan in Forms: een groepjesmaker hangt aan een form
 * en leest haar inzendingen.
 */
export default async function GroupMakerOverview({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const base = formBase(locale);
  const session = await requireSession();
  if (!session.user.isSuperAdmin && !(await canAccessAnyForm())) notFound();

  const forms = await prisma.form.findMany({
    where: { ...(await visibleFormsFilter()), status: { not: "ARCHIVED" } },
    select: {
      id: true,
      titleNl: true,
      titleEn: true,
      status: true,
      ownerGroup: { select: { nameNl: true, nameEn: true } },
      grouping: {
        select: {
          ranAt: true,
          autoRun: true,
          _count: { select: { groups: true, members: true } },
        },
      },
      _count: {
        select: { entries: { where: { status: "SUBMITTED", isTest: false, waitlisted: false } } },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });
  const capabilities = await formCapabilitiesByForm(forms.map((form) => form.id));
  const title = (form: { titleNl: string; titleEn: string | null }) =>
    locale === "en" && form.titleEn ? form.titleEn : form.titleNl;

  const withGrouping = forms.filter(
    (form) => form.grouping && capabilities.get(form.id)?.includes("VIEW_GROUPING")
  );
  const available = forms
    .filter((form) => !form.grouping && capabilities.get(form.id)?.includes("MANAGE_GROUPING"))
    .map((form) => ({ id: form.id, label: title(form) }));

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>{nl ? "Groepjesmaker" : "Group maker"}</h1>
          <p>
            {nl
              ? "Groepjes op basis van de antwoorden op een form. Enkel jij ziet de groepen, niet wie invulde."
              : "Groups based on the answers to a form. Only you see the groups, not the people who filled it in."}
          </p>
        </div>
      </div>

      <section className="ticket-admin-section" aria-labelledby="groupmaker-new-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <Plus aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="groupmaker-new-heading">
                {nl ? "Nieuwe groepjesmaker" : "New group maker"}
              </h2>
              <p>
                {nl
                  ? "Kies de form waarop iedereen inschrijft. De vragen maak je in Forms; hier zeg je wat elke vraag doet."
                  : "Pick the form everyone signs up with. You make the questions in Forms; here you say what each question does."}
              </p>
            </div>
          </div>
        </div>
        {available.length > 0 ? (
          <CreateGroupingForm locale={locale} forms={available} />
        ) : (
          <p className="ticket-admin-help">
            {nl
              ? "Er is geen form zonder groepjesmaker die je beheert. "
              : "There is no form without a group maker that you manage. "}
            <Link href={`${base}/admin/formulieren/nieuw`}>
              {nl ? "Maak eerst een form." : "Create a form first."}
            </Link>
          </p>
        )}
      </section>

      <section className="ticket-admin-section" aria-labelledby="groupmaker-list-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="groupmaker-list-heading">
              {nl ? "Groepjesmakers" : "Group makers"}
            </h2>
            <p>
              {formatNumber(withGrouping.length, locale)}{" "}
              {nl ? "groepjesmakers" : "group makers"}
            </p>
          </div>
        </div>
        {withGrouping.length === 0 ? (
          <AdminEmptyState
            icon={Shuffle}
            title={nl ? "Nog geen groepjesmakers" : "No group makers yet"}
          />
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table">
              <thead>
                <tr>
                  <th scope="col">Form</th>
                  <th scope="col">Status</th>
                  <th scope="col">{nl ? "Inzendingen" : "Entries"}</th>
                  <th scope="col">{nl ? "Indeling" : "Division"}</th>
                  <th>
                    <span className="sr-only">{nl ? "Openen" : "Open"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {withGrouping.map((form) => (
                  <tr key={form.id} className="ticket-admin-linked-row">
                    <td data-wrap="true">
                      <Link
                        className="ticket-admin-row-link"
                        href={`${base}/admin/apps/groepjesmaker/${form.id}`}
                      >
                        <strong>{title(form)}</strong>
                      </Link>
                      <div className="ticket-admin-row-meta">
                        {locale === "en" ? form.ownerGroup.nameEn : form.ownerGroup.nameNl}
                      </div>
                    </td>
                    <td>
                      <FormStatusBadge status={form.status} locale={locale} />
                    </td>
                    <td className="tabular-nums">{formatNumber(form._count.entries, locale)}</td>
                    <td data-wrap="true">
                      {form.grouping?.ranAt ? (
                        <>
                          {formatNumber(form.grouping._count.groups, locale)}{" "}
                          {nl ? "groepen" : "groups"}
                          <div className="ticket-admin-row-meta">
                            {formatDateTime(form.grouping.ranAt, locale)}
                          </div>
                        </>
                      ) : form.grouping?.autoRun ? (
                        nl ? "Wacht op de antwoorden" : "Waiting for the answers"
                      ) : (
                        nl ? "Nog niet ingedeeld" : "Not divided yet"
                      )}
                    </td>
                    <td>
                      <ChevronRight
                        className="ticket-admin-row-chevron"
                        aria-hidden="true"
                        size={18}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
