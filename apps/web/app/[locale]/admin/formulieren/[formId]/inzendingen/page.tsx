import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { ArrowRight, BarChart3, Filter, Hourglass, Inbox, Search } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { answerSummary, answerToText, exportColumns } from "@/lib/forms/export";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { FormStatusBadge } from "@/components/forms/admin/FormStatusBadge";
import { MailingPanel } from "@/components/forms/admin/MailingPanel";
import { AddEntryPanel, ExportPanel } from "@/components/forms/admin/EntryTools";
import { formConditions, loadPublicForm, toPublicFields } from "@/lib/forms/publicForm";
import {
  formBase,
  formatDateTime,
  formatNumber,
  formStatusLabel,
  type AdminLocale,
} from "@/components/forms/admin/format";

const REVIEW_STATUSES = ["NEW", "ACCEPTED", "REJECTED"] as const;
const PAGE_SIZE = 50;

export default async function FormEntriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; formId: string }>;
  searchParams: Promise<{
    q?: string;
    beoordeling?: string;
    test?: string;
    p?: string;
    wachtlijst?: string;
  }>;
}) {
  const [{ locale: localeParam, formId }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const base = formBase(locale);
  const { form, capabilities } = await requireFormCapability(formId, "VIEW_ENTRIES");

  const review = REVIEW_STATUSES.includes(filters.beoordeling as (typeof REVIEW_STATUSES)[number])
    ? (filters.beoordeling as (typeof REVIEW_STATUSES)[number])
    : null;
  const includeTest = filters.test === "1";
  // "alles", "enkel de wachtlijst", of "enkel wie een plaats heeft".
  const waitlistFilter = ["alleen", "zonder"].includes(filters.wachtlijst ?? "")
    ? (filters.wachtlijst as "alleen" | "zonder")
    : null;
  const query = filters.q?.trim().slice(0, 200) ?? "";
  const page = Math.max(1, Number.parseInt(filters.p ?? "1", 10) || 1);

  const where = {
    formId,
    status: "SUBMITTED" as const,
    ...(includeTest ? {} : { isTest: false }),
    ...(review ? { reviewStatus: review } : {}),
    ...(waitlistFilter === "alleen"
      ? { waitlisted: true }
      : waitlistFilter === "zonder"
        ? { waitlisted: false }
        : {}),
    ...(query
      ? {
          OR: [
            { submitterName: { contains: query, mode: "insensitive" as const } },
            { submitterEmail: { contains: query, mode: "insensitive" as const } },
            {
              answers: {
                some: { valueText: { contains: query, mode: "insensitive" as const } },
              },
            },
          ],
        }
      : {}),
  };

  const [fields, entries, total, drafts, waitlisted, allEntriesForSummary] = await Promise.all([
    prisma.formField.findMany({
      where: { formId },
      include: { options: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.formEntry.findMany({
      where,
      include: {
        answers: true,
        uploads: { select: { fieldId: true, originalName: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.formEntry.count({ where }),
    prisma.formEntry.count({ where: { formId, status: "DRAFT" } }),
    prisma.formEntry.count({
      where: { formId, status: "SUBMITTED", isTest: false, waitlisted: true },
    }),
    // Het overzicht telt over alle inzendingen, niet enkel de zichtbare pagina.
    prisma.formEntry.findMany({
      where: { formId, status: "SUBMITTED", isTest: false },
      select: { id: true, answers: true },
      take: 5_000,
    }),
  ]);

  const exportFields = fields.map((field) => ({
    id: field.id,
    code: field.code,
    type: field.type,
    labelNl: field.labelNl,
    labelEn: field.labelEn,
    sortOrder: field.sortOrder,
    archivedAt: field.archivedAt,
    options: field.options.map((option) => ({
      code: option.code,
      labelNl: option.labelNl,
      labelEn: option.labelEn,
    })),
  }));

  const rows = entries.map((entry) => ({
    id: entry.id,
    status: entry.status,
    reviewStatus: entry.reviewStatus,
    internalNote: entry.internalNote,
    submitterName: entry.submitterName,
    submitterEmail: entry.submitterEmail,
    submittedAt: entry.submittedAt,
    createdAt: entry.createdAt,
    isTest: entry.isTest,
    waitlisted: entry.waitlisted,
    reviewerName: entry.reviewer?.name ?? null,
    answers: entry.answers,
    uploads: entry.uploads,
  }));

  // Hoogstens zes kolommen in de tabel: de rest staat in het detail, en een
  // tabel van dertig kolommen leest niemand. De kolomkiezer van de export
  // krijgt wel de volledige lijst.
  const allColumns = exportColumns(exportFields, rows, { locale });
  const columns = allColumns.slice(0, 6);

  // Het toevoegformulier gebruikt dezelfde velden als de publieke pagina.
  const publicForm = capabilities.includes("MANAGE_ENTRIES")
    ? await loadPublicForm(form.slug)
    : null;
  const publicFields = publicForm ? toPublicFields(publicForm, locale) : [];
  const conditions = publicForm ? formConditions(publicForm) : [];
  const summary = answerSummary(
    exportFields,
    allEntriesForSummary.map((entry) => ({
      id: entry.id,
      status: "SUBMITTED",
      reviewStatus: "NEW",
      internalNote: null,
      submitterName: null,
      submitterEmail: null,
      submittedAt: null,
      createdAt: new Date(),
      isTest: false,
      reviewerName: null,
      answers: entry.answers,
      uploads: [],
    })),
    locale
  );

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-metrics">
        <AdminMetric
          icon={Inbox}
          label={nl ? "Ingediend" : "Submitted"}
          value={
            form.maxEntries
              ? `${formatNumber(total, locale)} / ${formatNumber(form.maxEntries, locale)}`
              : formatNumber(total, locale)
          }
        />
        <AdminMetric
          icon={BarChart3}
          label={nl ? "Concepten" : "Drafts"}
          value={formatNumber(drafts, locale)}
        />
        {waitlisted > 0 ? (
          <AdminMetric
            icon={Hourglass}
            label={nl ? "Op de wachtlijst" : "On the waiting list"}
            value={formatNumber(waitlisted, locale)}
            tone="warning"
          />
        ) : null}
      </div>

      <section className="ticket-admin-section" aria-labelledby="entries-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="entries-heading">{nl ? "Inzendingen" : "Entries"}</h2>
            <p>
              {nl
                ? `${formatNumber(total, locale)} inzendingen`
                : `${formatNumber(total, locale)} entries`}
            </p>
          </div>
        </div>

        {capabilities.includes("EXPORT") ? (
          <ExportPanel
            locale={locale}
            formId={formId}
            columns={allColumns.map((column) => ({
              code: column.code,
              label: locale === "en" && column.labelEn ? column.labelEn : column.labelNl,
              archived: Boolean(column.archivedAt),
            }))}
            filters={{ q: query, beoordeling: review ?? undefined, test: includeTest ? "1" : undefined }}
          />
        ) : null}

        {capabilities.includes("MANAGE_ENTRIES") ? (
          <AddEntryPanel
            locale={locale}
            formId={formId}
            fields={publicFields}
            conditions={conditions}
          />
        ) : null}

        <form className="ticket-admin-filterbar" method="get">
          <div className="ticket-admin-field ticket-admin-filter-search">
            <label htmlFor="entry-search">{nl ? "Zoeken" : "Search"}</label>
            <div className="ticket-admin-input-icon">
              <Search aria-hidden="true" size={16} />
              <input
                id="entry-search"
                name="q"
                type="search"
                defaultValue={query}
                placeholder={nl ? "Naam, e-mail of antwoord" : "Name, e-mail or answer"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="entry-review">{nl ? "Beoordeling" : "Review"}</label>
            <select id="entry-review" name="beoordeling" defaultValue={review ?? ""}>
              <option value="">{nl ? "Alle" : "All"}</option>
              {REVIEW_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formStatusLabel(status, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="entry-waitlist">{nl ? "Wachtlijst" : "Waiting list"}</label>
            <select id="entry-waitlist" name="wachtlijst" defaultValue={waitlistFilter ?? ""}>
              <option value="">{nl ? "Alles" : "Everything"}</option>
              <option value="zonder">{nl ? "Enkel met plaats" : "Only with a spot"}</option>
              <option value="alleen">{nl ? "Enkel de wachtlijst" : "Only the waiting list"}</option>
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="entry-test">{nl ? "Testinzendingen" : "Test entries"}</label>
            <select id="entry-test" name="test" defaultValue={includeTest ? "1" : ""}>
              <option value="">{nl ? "Verbergen" : "Hide"}</option>
              <option value="1">{nl ? "Tonen" : "Show"}</option>
            </select>
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            Filter
          </button>
        </form>

        {rows.length === 0 ? (
          <AdminEmptyState
            icon={Inbox}
            title={nl ? "Nog geen inzendingen" : "No entries yet"}
            description={
              total === 0
                ? nl
                  ? "Zodra iemand het formulier invult, verschijnt de inzending hier."
                  : "As soon as someone fills in the form, the entry appears here."
                : nl
                  ? "Pas je zoekopdracht of filter aan."
                  : "Adjust your search or filter."
            }
          />
        ) : (
          <>
            {/* De wrapper moet `position: relative` hebben; anders ankert de
                sr-only kop van de laatste kolom op de pagina en zoomt een
                telefoon de hele pagina uit. Zie CLAUDE.md. */}
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table">
                <thead>
                  <tr>
                    <th>{nl ? "Ingediend" : "Submitted"}</th>
                    <th>{nl ? "Wie" : "Who"}</th>
                    <th>{nl ? "Beoordeling" : "Review"}</th>
                    {columns.map((column) => (
                      <th key={column.id} data-priority="low">
                        {locale === "en" && column.labelEn ? column.labelEn : column.labelNl}
                      </th>
                    ))}
                    <th>
                      <span className="sr-only">{nl ? "Openen" : "Open"}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const byField = new Map(
                      entry.answers.map((answer) => [answer.fieldId, answer])
                    );
                    return (
                      <tr key={entry.id}>
                        <td data-wrap="true">
                          {formatDateTime(entry.submittedAt ?? entry.createdAt, locale)}
                          {entry.isTest ? (
                            <div className="ticket-admin-row-meta">
                              {nl ? "testinzending" : "test entry"}
                            </div>
                          ) : null}
                        </td>
                        <td data-wrap="true">
                          <strong>{entry.submitterName ?? (nl ? "Anoniem" : "Anonymous")}</strong>
                          {entry.submitterEmail ? (
                            <div className="ticket-admin-row-meta">{entry.submitterEmail}</div>
                          ) : null}
                        </td>
                        <td>
                          <FormStatusBadge status={entry.reviewStatus} locale={locale} />
                          {entry.waitlisted ? (
                            <div className="ticket-admin-row-meta">
                              {nl ? "wachtlijst" : "waiting list"}
                            </div>
                          ) : null}
                        </td>
                        {columns.map((column) => (
                          <td key={column.id} data-priority="low" data-wrap="true">
                            {answerToText(column, byField.get(column.id), entry.uploads, locale).slice(
                              0,
                              80
                            )}
                          </td>
                        ))}
                        <td>
                          <Link
                            className="ticket-admin-icon-button"
                            href={`${base}/admin/formulieren/${formId}/inzendingen/${entry.id}`}
                            aria-label={`${nl ? "Open inzending van" : "Open entry from"} ${entry.submitterName ?? entry.id}`}
                            title={nl ? "Inzending openen" : "Open entry"}
                          >
                            <ArrowRight aria-hidden="true" size={17} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pages > 1 ? (
              <nav className="ticket-admin-pagination" aria-label={nl ? "Paginering" : "Pagination"}>
                {page > 1 ? (
                  <Link href={`?${new URLSearchParams({ ...filters, p: String(page - 1) })}`}>
                    {nl ? "Vorige" : "Previous"}
                  </Link>
                ) : null}
                <span>
                  {nl ? "Pagina" : "Page"} {page} / {pages}
                </span>
                {page < pages ? (
                  <Link href={`?${new URLSearchParams({ ...filters, p: String(page + 1) })}`}>
                    {nl ? "Volgende" : "Next"}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </section>

      {summary.length > 0 ? (
        <section className="ticket-admin-section" aria-labelledby="summary-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon">
                <BarChart3 aria-hidden="true" size={17} />
              </span>
              <div>
                <h2 id="summary-heading">{nl ? "Antwoordoverzicht" : "Answer overview"}</h2>
                <p>
                  {nl
                    ? "Per gesloten vraag, over alle echte inzendingen."
                    : "Per closed question, across all real entries."}
                </p>
              </div>
            </div>
          </div>
          <div className="form-admin-summary">
            {summary.map((question) => (
              <div key={question.fieldId}>
                <h3>{question.label}</h3>
                <ul>
                  {question.buckets.map((bucket) => (
                    <li key={bucket.label}>
                      <span className="form-admin-summary-label">{bucket.label}</span>
                      <span className="form-admin-summary-bar" aria-hidden="true">
                        <span
                          style={{ width: `${Math.round((bucket.count / question.total) * 100)}%` }}
                        />
                      </span>
                      <span className="form-admin-summary-count">
                        {formatNumber(bucket.count, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {capabilities.includes("MAIL_PARTICIPANTS") ? (
        <MailingPanel
          locale={locale}
          formId={formId}
          reviewStatus={review}
          includeTest={includeTest}
        />
      ) : null}
    </div>
  );
}
