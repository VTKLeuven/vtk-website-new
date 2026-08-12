import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { ArrowRight, BarChart3, Filter, Hourglass, Inbox, Search } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { answerSummary, answerToText, exportColumns } from "@/lib/forms/export";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { FormStatusBadge } from "@/components/forms/admin/FormStatusBadge";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
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
type SortKey = "submittedAt" | "name" | "review";
type SortDirection = "asc" | "desc";
const SORT_KEYS: SortKey[] = ["submittedAt", "name", "review"];

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
    sort?: string;
    dir?: string;
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
  const sortKey: SortKey = SORT_KEYS.includes(filters.sort as SortKey)
    ? (filters.sort as SortKey)
    : "submittedAt";
  const defaultDirection: SortDirection = sortKey === "submittedAt" ? "desc" : "asc";
  const direction: SortDirection =
    filters.dir === "asc" || filters.dir === "desc" ? filters.dir : defaultDirection;

  const orderBy: Prisma.FormEntryOrderByWithRelationInput[] =
    sortKey === "name"
      ? [
          { submitterName: { sort: direction, nulls: "last" } },
          { submittedAt: "desc" },
          { id: "asc" },
        ]
      : sortKey === "review"
        ? [{ reviewStatus: direction }, { submittedAt: "desc" }, { id: "asc" }]
        : [{ submittedAt: direction }, { id: "asc" }];

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
      orderBy,
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
  const publicFields = publicForm
    ? toPublicFields(publicForm, locale).map((field) => ({
        ...field,
        sectionId: field.sectionId,
        sortOrder: publicForm.fields.find((candidate) => candidate.id === field.id)?.sortOrder ?? 0,
      }))
    : [];
  const conditions = publicForm ? formConditions(publicForm) : [];
  const sections =
    publicForm?.sections.map((section) => ({
      id: section.id,
      sortOrder: section.sortOrder,
      nextSectionId: section.nextSectionId,
      endsForm: section.endsForm,
    })) ?? [];
  const branchOptions =
    publicForm?.fields.flatMap((field) =>
      field.options.map((option) => ({
        fieldId: field.id,
        code: option.code,
        nextSectionId: option.nextSectionId,
        endsForm: option.endsForm,
      }))
    ) ?? [];
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
  const buildParams = () => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (review) params.set("beoordeling", review);
    if (includeTest) params.set("test", "1");
    if (waitlistFilter) params.set("wachtlijst", waitlistFilter);
    params.set("sort", sortKey);
    params.set("dir", direction);
    return params;
  };
  const sortHref = (key: SortKey) => {
    const params = buildParams();
    const nextDirection: SortDirection =
      sortKey === key
        ? direction === "asc"
          ? "desc"
          : "asc"
        : key === "submittedAt"
          ? "desc"
          : "asc";
    params.set("sort", key);
    params.set("dir", nextDirection);
    return `${base}/admin/formulieren/${formId}/inzendingen?${params.toString()}`;
  };
  const pageHref = (nextPage: number) => {
    const params = buildParams();
    params.set("p", String(nextPage));
    return `${base}/admin/formulieren/${formId}/inzendingen?${params.toString()}`;
  };

  return (
    <div className="ticket-admin-page">
      <div className="form-admin-entry-stats" aria-label={nl ? "Kerncijfers" : "Key figures"}>
        <div>
          <Inbox aria-hidden="true" size={16} />
          <strong>
            {form.maxEntries
              ? `${formatNumber(total, locale)} / ${formatNumber(form.maxEntries, locale)}`
              : formatNumber(total, locale)}
          </strong>
          <span>{nl ? "ingediend" : "submitted"}</span>
        </div>
        <div>
          <BarChart3 aria-hidden="true" size={16} />
          <strong>{formatNumber(drafts, locale)}</strong>
          <span>{nl ? "concepten" : "drafts"}</span>
        </div>
        {waitlisted > 0 ? (
          <div>
            <Hourglass aria-hidden="true" size={16} />
            <strong>{formatNumber(waitlisted, locale)}</strong>
            <span>{nl ? "op de wachtlijst" : "on the waiting list"}</span>
          </div>
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
            filters={{
              q: query,
              beoordeling: review ?? undefined,
              test: includeTest ? "1" : undefined,
            }}
          />
        ) : null}

        {capabilities.includes("MANAGE_ENTRIES") ? (
          <AddEntryPanel
            locale={locale}
            formId={formId}
            fields={publicFields}
            conditions={conditions}
            stepBySections={publicForm?.stepBySections ?? false}
            sections={sections}
            branchOptions={branchOptions}
          />
        ) : null}

        <form className="ticket-admin-filterbar" method="get">
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={direction} />
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
            <ThemedSelect
              id="entry-review"
              name="beoordeling"
              defaultValue={review ?? ""}
              options={[
                { value: "", label: nl ? "Alle" : "All" },
                ...REVIEW_STATUSES.map((status) => ({
                  value: status,
                  label: formStatusLabel(status, locale),
                })),
              ]}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="entry-waitlist">{nl ? "Wachtlijst" : "Waiting list"}</label>
            <ThemedSelect
              id="entry-waitlist"
              name="wachtlijst"
              defaultValue={waitlistFilter ?? ""}
              options={[
                { value: "", label: nl ? "Alles" : "Everything" },
                { value: "zonder", label: nl ? "Enkel met plaats" : "Only with a spot" },
                { value: "alleen", label: nl ? "Enkel de wachtlijst" : "Only the waiting list" },
              ]}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="entry-test">{nl ? "Testinzendingen" : "Test entries"}</label>
            <ThemedSelect
              id="entry-test"
              name="test"
              defaultValue={includeTest ? "1" : ""}
              options={[
                { value: "", label: nl ? "Verbergen" : "Hide" },
                { value: "1", label: nl ? "Tonen" : "Show" },
              ]}
            />
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
                    <SortableHeader
                      href={sortHref("submittedAt")}
                      label={nl ? "Ingediend" : "Submitted"}
                      active={sortKey === "submittedAt"}
                      direction={direction}
                    />
                    <SortableHeader
                      href={sortHref("name")}
                      label={nl ? "Wie" : "Who"}
                      active={sortKey === "name"}
                      direction={direction}
                    />
                    <SortableHeader
                      href={sortHref("review")}
                      label={nl ? "Beoordeling" : "Review"}
                      active={sortKey === "review"}
                      direction={direction}
                    />
                    {/* Antwoordkolommen staan in FormAnswer. Sorteren daarop
                        zou per gekozen kolom een relationele join vragen. */}
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
                            {answerToText(
                              column,
                              byField.get(column.id),
                              entry.uploads,
                              locale
                            ).slice(0, 80)}
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
              <nav
                className="ticket-admin-pagination"
                aria-label={nl ? "Paginering" : "Pagination"}
              >
                {page > 1 ? (
                  <Link href={pageHref(page - 1)}>{nl ? "Vorige" : "Previous"}</Link>
                ) : null}
                <span>
                  {nl ? "Pagina" : "Page"} {page} / {pages}
                </span>
                {page < pages ? (
                  <Link href={pageHref(page + 1)}>{nl ? "Volgende" : "Next"}</Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </section>

      {summary.length > 0 ? (
        <details className="ticket-admin-details form-admin-summary-details">
          <summary>
            <BarChart3 aria-hidden="true" size={16} />
            {nl ? "Antwoordoverzicht" : "Answer overview"}
            <span>
              {summary.length}{" "}
              {nl
                ? summary.length === 1
                  ? "vraag"
                  : "vragen"
                : summary.length === 1
                  ? "question"
                  : "questions"}
            </span>
          </summary>
          <div className="ticket-admin-details-body form-admin-summary">
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
        </details>
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

function SortableHeader({
  href,
  label,
  active,
  direction,
}: {
  href: string;
  label: string;
  active: boolean;
  direction: SortDirection;
}) {
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href} className="inline-flex items-center gap-1">
        <span>{label}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          opacity={active ? 1 : 0.35}
        >
          {active && direction === "desc" ? (
            <polyline points="6 9 12 15 18 9" />
          ) : (
            <polyline points="18 15 12 9 6 15" />
          )}
        </svg>
      </Link>
    </th>
  );
}
