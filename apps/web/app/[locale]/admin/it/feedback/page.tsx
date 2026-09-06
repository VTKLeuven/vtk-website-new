import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  feedbackKindLabel,
  feedbackStatusLabel,
  isFeedbackKind,
  isFeedbackStatus,
  type FeedbackKind,
  type FeedbackStatus,
} from "@/lib/feedback";
import { FeedbackRow, type FeedbackRowLabels } from "./FeedbackRow";

/**
 * Wat leden over de website zelf melden, via "Feedback Website" in het
 * accountmenu.
 *
 * De filters staan in de URL, zodat "alle openstaande bugs" een link is die je
 * in een vergadering kan plakken. Zonder filter staat alles er, nieuwste eerst;
 * "Openstaand" is de werklijst (nieuw plus wat op de lijst staat).
 */
export const dynamic = "force-dynamic";

type Search = { status?: string; kind?: string };

function formatMoment(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AdminWebsiteFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  await requirePermission("feedback.manage");

  const sp = await searchParams;
  // "open" is geen status in de databank maar de werklijst: nieuw plus wat op
  // de lijst staat. Dat is waar je negen van de tien keer voor komt.
  const statusFilter: FeedbackStatus | "open" | null =
    sp.status === "open" ? "open" : isFeedbackStatus(sp.status) ? sp.status : null;
  const kindFilter: FeedbackKind | null = isFeedbackKind(sp.kind) ? sp.kind : null;

  const where = {
    ...(statusFilter === "open"
      ? { status: { in: ["NEW", "PLANNED"] as FeedbackStatus[] } }
      : statusFilter
        ? { status: statusFilter }
        : {}),
    ...(kindFilter ? { kind: kindFilter } : {}),
  };

  const [items, counts, openCount, total] = await Promise.all([
    prisma.websiteFeedback.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: {
        author: { select: { name: true } },
        handledBy: { select: { name: true } },
      },
    }),
    prisma.websiteFeedback.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.websiteFeedback.count({ where: { status: { in: ["NEW", "PLANNED"] } } }),
    prisma.websiteFeedback.count(),
  ]);

  const countByStatus = new Map(counts.map((row) => [row.status, row._count._all]));

  const labels: FeedbackRowLabels = {
    statusLabel: nl ? "Status" : "Status",
    statusOptions: FEEDBACK_STATUSES.map((status) => ({
      value: status,
      label: feedbackStatusLabel(status, locale),
    })),
    noteLabel: nl ? "Notitie" : "Note",
    notePlaceholder: nl ? "Wat is ermee gebeurd?" : "What happened with it?",
    save: nl ? "Opslaan" : "Save",
    saving: nl ? "Bezig…" : "Saving…",
    saved: nl ? "De melding is bijgewerkt." : "The report has been updated.",
    failed: nl ? "Dat lukte niet. Probeer opnieuw." : "That did not work. Please try again.",
    noteRequired: nl
      ? "Schrijf op waarom er niets mee gebeurt."
      : "Write down why nothing is happening with it.",
    statusInvalid: nl ? "Kies een geldige status." : "Choose a valid status.",
    feedbackMissing: nl
      ? "Deze melding bestaat niet meer; herlaad de pagina."
      : "This report no longer exists; reload the page.",
    reporter: nl ? "Van" : "From",
    anonymous: nl ? "Anoniem" : "Anonymous",
    deletedAccount: nl ? "Account verwijderd" : "Account deleted",
    page: nl ? "Pagina" : "Page",
    browser: nl ? "Browser" : "Browser",
    received: nl ? "Ontvangen" : "Received",
    handledOn: nl ? "Behandeld" : "Handled",
    by: nl ? "door" : "by",
    note: nl ? "Notitie" : "Note",
    screenshot: nl ? "Screenshot bij de melding" : "Screenshot with the report",
    openScreenshot: nl ? "Screenshot openen" : "Open screenshot",
    delete: nl ? "Verwijderen" : "Delete",
    deleteTitle: nl ? "Deze melding verwijderen?" : "Delete this report?",
    deleteDescription: nl
      ? "De melding en haar screenshot gaan definitief weg. Andere meldingen blijven staan. Doe dit enkel bij spam of een dubbele melding; sluit een echte melding af met een status."
      : "The report and its screenshot are removed for good. Other reports stay. Only do this for spam or a duplicate; close a real report with a status instead.",
    deleted: nl ? "De melding is verwijderd." : "The report has been deleted.",
    confirm: nl ? "Verwijderen" : "Delete",
    cancel: nl ? "Annuleren" : "Cancel",
    open: nl ? "Openstaand" : "Open",
  };

  function filterHref(next: { status?: string | null; kind?: string | null }): string {
    const query = new URLSearchParams();
    const status = next.status === undefined ? statusFilter : next.status;
    const kind = next.kind === undefined ? kindFilter : next.kind;
    if (status) query.set("status", status);
    if (kind) query.set("kind", kind);
    const suffix = query.toString();
    return `${base}/admin/it/feedback${suffix ? `?${suffix}` : ""}`;
  }

  return (
    <div className="vtk-admin-page">
      <header className="vtk-admin-page-head">
        <h1>{nl ? "Feedback Website" : "Website feedback"}</h1>
        <p>
          {nl
            ? "Wat leden via het accountmenu over de site melden: bugs, fouten in de inhoud, iets aan het ontwerp of een idee. Een melding kan anoniem zijn; dan is er niemand om iets aan terug te vragen."
            : "What members report about the site through the account menu: bugs, mistakes in the content, something about the design, or an idea. A report can be anonymous; then there is nobody to ask a follow-up question."}
        </p>
      </header>

      <nav className="vtk-feedback-filters" aria-label={nl ? "Status" : "Status"}>
        <Link
          href={filterHref({ status: "open" })}
          className="vtk-feedback-filter"
          aria-current={statusFilter === "open" ? "true" : undefined}
        >
          {labels.open} <span>{openCount}</span>
        </Link>
        {FEEDBACK_STATUSES.map((status) => (
          <Link
            key={status}
            href={filterHref({ status })}
            className="vtk-feedback-filter"
            aria-current={statusFilter === status ? "true" : undefined}
          >
            {feedbackStatusLabel(status, locale)} <span>{countByStatus.get(status) ?? 0}</span>
          </Link>
        ))}
        <Link
          href={filterHref({ status: null })}
          className="vtk-feedback-filter"
          aria-current={statusFilter === null ? "true" : undefined}
        >
          {nl ? "Alles" : "All"} <span>{total}</span>
        </Link>
      </nav>

      <nav className="vtk-feedback-filters" aria-label={nl ? "Categorie" : "Category"}>
        <Link
          href={filterHref({ kind: null })}
          className="vtk-feedback-filter"
          aria-current={kindFilter === null ? "true" : undefined}
        >
          {nl ? "Alle categorieën" : "All categories"}
        </Link>
        {FEEDBACK_KINDS.map((kind) => (
          <Link
            key={kind}
            href={filterHref({ kind })}
            className="vtk-feedback-filter"
            aria-current={kindFilter === kind ? "true" : undefined}
          >
            {feedbackKindLabel(kind, locale)}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="vtk-admin-empty">
          <h2>{nl ? "Niets te zien" : "Nothing here"}</h2>
          <p>
            {nl
              ? "Er staat geen melding die aan dit filter voldoet. Nieuwe feedback komt hier binnen zodra iemand ze via het accountmenu verstuurt."
              : "No report matches this filter. New feedback lands here as soon as somebody sends it through the account menu."}
          </p>
        </div>
      ) : (
        <div className="vtk-feedback-list">
          {items.map((item) => (
            <FeedbackRow
              key={item.id}
              labels={labels}
              // Het pad komt uit een formulier; `normaliseFeedbackPath` liet
              // enkel een pad op deze site door, dus dit blijft intern.
              pathHref={item.path}
              item={{
                id: item.id,
                kindLabel: feedbackKindLabel(item.kind, locale),
                statusLabel: feedbackStatusLabel(item.status, locale),
                status: item.status,
                message: item.message,
                imageKey: item.imageKey,
                path: item.path,
                userAgent: item.userAgent,
                anonymous: item.anonymous,
                authorName: item.author?.name ?? null,
                createdAt: formatMoment(item.createdAt, locale),
                handlingNote: item.handlingNote,
                handledBy: item.handledBy?.name ?? null,
                handledAt: item.handledAt ? formatMoment(item.handledAt, locale) : null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
