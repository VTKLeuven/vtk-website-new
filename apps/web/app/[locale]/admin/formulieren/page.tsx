import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import { ArrowRight, ClipboardList, Filter, Plus, Search } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { visibleFormsFilter } from "@/lib/forms/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { FormStatusBadge } from "@/components/forms/admin/FormStatusBadge";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import {
  formatDateTime,
  formatNumber,
  formBase,
  formStatusLabel,
  type AdminLocale,
} from "@/components/forms/admin/format";

const FORM_STATUSES = ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"] as const;

export default async function FormsAdminOverview({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const session = await requireSession();
  const base = formBase(locale);

  const forms = await prisma.form.findMany({
    where: await visibleFormsFilter(),
    include: {
      ownerGroup: { select: { nameNl: true, nameEn: true } },
      _count: { select: { entries: { where: { status: "SUBMITTED", isTest: false } } } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 500,
  });

  // Aanmaken mag wie forms.create heeft en minstens één post leidt; welke post
  // precies, kiest de aanmaakpagina zelf (die checkt het live opnieuw).
  const canCreate =
    hasPermission(session, "forms.manageAll") ||
    (hasPermission(session, "forms.create") &&
      session.groups.some((group) => group.role === "LEAD"));

  const localeTag = locale === "nl" ? "nl-BE" : "en-GB";
  const query = filters.q?.trim().toLocaleLowerCase(localeTag) ?? "";
  const selectedStatus = FORM_STATUSES.includes(filters.status as (typeof FORM_STATUSES)[number])
    ? filters.status
    : "";
  const visibleForms = forms.filter((form) => {
    if (selectedStatus && form.status !== selectedStatus) return false;
    if (!query) return true;
    const searchable = [
      form.titleNl,
      form.titleEn,
      form.slug,
      form.ownerGroup.nameNl,
      form.ownerGroup.nameEn,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(localeTag);
    return searchable.includes(query);
  });

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>Forms</h1>
          <p>
            {locale === "nl"
              ? "Inschrijvingen, sollicitaties en bevragingen, met hun inzendingen."
              : "Sign-ups, applications and surveys, with their entries."}
          </p>
        </div>
        {canCreate ? (
          <Link
            className="ticket-admin-button"
            data-variant="primary"
            href={`${base}/admin/formulieren/nieuw`}
          >
            <Plus aria-hidden="true" size={16} />
            {locale === "nl" ? "Nieuwe form" : "New form"}
          </Link>
        ) : null}
      </div>

      <section className="ticket-admin-section" aria-labelledby="forms-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="forms-heading">{locale === "nl" ? "Alle forms" : "All forms"}</h2>
            <p>
              {locale === "nl"
                ? `${visibleForms.length} van ${forms.length} forms`
                : `${visibleForms.length} of ${forms.length} forms`}
            </p>
          </div>
        </div>

        <form className="ticket-admin-filterbar" method="get">
          <div className="ticket-admin-field ticket-admin-filter-search">
            <label htmlFor="form-search">{locale === "nl" ? "Zoeken" : "Search"}</label>
            <div className="ticket-admin-input-icon">
              <Search aria-hidden="true" size={16} />
              <input
                id="form-search"
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                placeholder={locale === "nl" ? "Titel, URL of groep" : "Title, URL or group"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="form-status">Status</label>
            <ThemedSelect
              id="form-status"
              name="status"
              defaultValue={selectedStatus}
              options={[
                { value: "", label: locale === "nl" ? "Alle statussen" : "All statuses" },
                ...FORM_STATUSES.map((status) => ({
                  value: status,
                  label: formStatusLabel(status, locale),
                })),
              ]}
            />
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            Filter
          </button>
        </form>

        {visibleForms.length === 0 ? (
          <AdminEmptyState
            icon={ClipboardList}
            title={locale === "nl" ? "Geen forms gevonden" : "No forms found"}
            description={
              forms.length === 0
                ? locale === "nl"
                  ? "Er zijn nog geen forms waar je toegang toe hebt."
                  : "There are no forms you can access yet."
                : locale === "nl"
                  ? "Pas je zoekopdracht of filter aan."
                  : "Adjust your search or filter."
            }
            action={
              canCreate && forms.length === 0 ? (
                <Link
                  className="ticket-admin-button"
                  data-variant="primary"
                  href={`${base}/admin/formulieren/nieuw`}
                >
                  <Plus aria-hidden="true" size={16} />
                  {locale === "nl" ? "Form aanmaken" : "Create form"}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table">
              <thead>
                <tr>
                  <th>Form</th>
                  <th data-priority="low">{locale === "nl" ? "Groep" : "Group"}</th>
                  <th>Status</th>
                  <th>{locale === "nl" ? "Inzendingen" : "Entries"}</th>
                  <th data-priority="low">{locale === "nl" ? "Gewijzigd" : "Updated"}</th>
                  <th>
                    <span className="sr-only">{locale === "nl" ? "Openen" : "Open"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleForms.map((form) => (
                  <tr key={form.id}>
                    <td data-wrap="true">
                      <strong>
                        {locale === "en" && form.titleEn ? form.titleEn : form.titleNl}
                      </strong>
                      <div className="ticket-admin-row-meta ticket-admin-code">
                        /formulieren/{form.slug}
                      </div>
                    </td>
                    <td data-priority="low">
                      {locale === "en" ? form.ownerGroup.nameEn : form.ownerGroup.nameNl}
                    </td>
                    <td>
                      <FormStatusBadge status={form.status} locale={locale} />
                    </td>
                    <td>
                      <strong>{formatNumber(form._count.entries, locale)}</strong>
                      {form.maxEntries ? (
                        <div className="ticket-admin-row-meta">
                          {locale === "nl" ? "van" : "of"} {formatNumber(form.maxEntries, locale)}
                        </div>
                      ) : null}
                    </td>
                    <td data-priority="low" data-wrap="true">
                      {formatDateTime(form.updatedAt, locale)}
                    </td>
                    <td>
                      <Link
                        className="ticket-admin-icon-button"
                        href={`${base}/admin/formulieren/${form.id}`}
                        aria-label={`${locale === "nl" ? "Open" : "Open"}: ${form.titleNl}`}
                        title={locale === "nl" ? "Form openen" : "Open form"}
                      >
                        <ArrowRight aria-hidden="true" size={17} />
                      </Link>
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
