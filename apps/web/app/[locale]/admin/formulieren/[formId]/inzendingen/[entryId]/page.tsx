import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireFormCapability } from "@/lib/forms/authorization";
import { answerToText } from "@/lib/forms/export";
import { deleteFormEntryAction } from "@/app/actions/formEntries";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { EntryReviewForm } from "@/components/forms/admin/EntryReviewForm";
import { FormStatusBadge } from "@/components/forms/admin/FormStatusBadge";
import { formBase, formatDateTime, type AdminLocale } from "@/components/forms/admin/format";

export default async function FormEntryDetailPage({
  params,
}: {
  params: Promise<{ locale: string; formId: string; entryId: string }>;
}) {
  const { locale: localeParam, formId, entryId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const base = formBase(locale);
  const { capabilities } = await requireFormCapability(formId, "VIEW_ENTRIES");

  const entry = await prisma.formEntry.findFirst({
    where: { id: entryId, formId },
    include: {
      answers: true,
      uploads: true,
      reviewer: { select: { name: true, email: true } },
      submittedBy: { select: { name: true, email: true } },
    },
  });
  if (!entry) notFound();

  const fields = await prisma.formField.findMany({
    where: { formId },
    include: { options: true },
    orderBy: { sortOrder: "asc" },
  });

  const answeredFieldIds = new Set(entry.answers.map((answer) => answer.fieldId));
  // Gearchiveerde velden tonen we enkel wanneer deze inzending erop antwoordde;
  // anders staat het detail vol met vragen die niemand meer stelt.
  const visibleFields = fields.filter(
    (field) => !field.archivedAt || answeredFieldIds.has(field.id)
  );

  const canManage = capabilities.includes("MANAGE_ENTRIES");

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <Link
            className="ticket-admin-back"
            href={`${base}/admin/formulieren/${formId}/inzendingen`}
          >
            <ArrowLeft aria-hidden="true" size={14} />
            {nl ? "Alle inzendingen" : "All entries"}
          </Link>
          <h1>{entry.submitterName ?? (nl ? "Anonieme inzending" : "Anonymous entry")}</h1>
          <p>
            {formatDateTime(entry.submittedAt ?? entry.createdAt, locale)}
            {entry.submitterEmail ? ` · ${entry.submitterEmail}` : ""}
            {entry.isTest ? ` · ${nl ? "testinzending" : "test entry"}` : ""}
          </p>
        </div>
        <FormStatusBadge status={entry.reviewStatus} locale={locale} />
      </div>

      <section className="ticket-admin-section" aria-labelledby="answers-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <FileText aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="answers-heading">{nl ? "Antwoorden" : "Answers"}</h2>
            </div>
          </div>
        </div>
        <dl className="ticket-admin-definitions">
          {visibleFields.map((field) => {
            const answer = entry.answers.find((candidate) => candidate.fieldId === field.id);
            const uploads = entry.uploads.filter((upload) => upload.fieldId === field.id);
            const text = answerToText(
              {
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
              },
              answer,
              entry.uploads,
              locale
            );
            return (
              <div key={field.id}>
                <dt>
                  {locale === "en" && field.labelEn ? field.labelEn : field.labelNl}
                  {field.archivedAt ? (
                    <span className="ticket-admin-row-meta">
                      {nl ? " (van het formulier gehaald)" : " (removed from the form)"}
                    </span>
                  ) : null}
                </dt>
                <dd>
                  {field.type === "FILE" && uploads.length > 0 ? (
                    <ul className="ticket-admin-list">
                      {uploads.map((upload) => (
                        <li key={upload.id}>
                          <a
                            className="ticket-admin-button"
                            href={`/api/forms/${formId}/bestanden/${upload.id}`}
                          >
                            <Download aria-hidden="true" size={15} />
                            {upload.originalName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    text || <span className="ticket-admin-row-meta">{nl ? "leeg" : "empty"}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </section>

      {canManage ? (
        <>
          <EntryReviewForm
            locale={locale}
            formId={formId}
            entryId={entry.id}
            reviewStatus={entry.reviewStatus}
            internalNote={entry.internalNote}
            reviewerEmail={entry.reviewer?.email ?? ""}
          />

          <section className="ticket-admin-section ticket-admin-section-compact">
            <DeleteButton
              action={deleteFormEntryAction}
              fields={{ locale, formId, entryId: entry.id }}
              title={nl ? "Inzending verwijderen?" : "Delete entry?"}
              description={
                nl
                  ? `Dit verwijdert de antwoorden${entry.uploads.length > 0 ? ` en ${entry.uploads.length} bestand(en)` : ""} van deze inzending. Een plaats die ze innam bij een keuze met een maximum, komt weer vrij. Dit kan niet ongedaan gemaakt worden.`
                  : `This deletes the answers${entry.uploads.length > 0 ? ` and ${entry.uploads.length} file(s)` : ""} of this entry. A spot it took in a capped choice becomes available again. This cannot be undone.`
              }
              confirmLabel={nl ? "Verwijderen" : "Delete"}
              cancelLabel={nl ? "Annuleren" : "Cancel"}
            >
              {nl ? "Inzending verwijderen" : "Delete entry"}
            </DeleteButton>
          </section>
        </>
      ) : null}
    </div>
  );
}
