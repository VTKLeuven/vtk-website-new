import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, Filter, Search } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import {
  listReportableTicketEvents,
  loadTicketStats,
  ticketReportAccess,
  type ReportableTicketEvent,
} from "@/lib/ticketing/stats";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { TicketStatsView } from "@/components/ticketing/admin/TicketStatsView";
import { formatDate, ticketBase, type AdminLocale } from "@/components/ticketing/admin/format";

type Search = {
  jaar?: string;
  post?: string;
  q?: string;
  event?: string | string[];
};

const ALL_YEARS = "alle";

/**
 * Ticketstatistieken over meerdere events: alles van een werkingsjaar, de
 * events van één post, alles met "cantus" in de naam, of een eigen selectie.
 *
 * Twee formulieren, en dat is bewust. De filters (jaar, post, zoekterm) kiezen
 * welke events in aanmerking komen en tellen ze dan allemaal mee; de
 * vinkjeslijst eronder maakt daar een expliciete selectie van. Zaten ze in één
 * formulier, dan bleef een oude selectie na het wisselen van jaar gewoon
 * staan, want de vinkjes van het vorige jaar reisden mee.
 *
 * Een concept telt standaard niet mee: dat verkoopt niets, maar zijn
 * capaciteit zou de bezetting van de hele selectie omlaag trekken. Aanvinken
 * kan wel.
 */
export default async function TicketStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const nl = locale === "nl";
  const base = ticketBase(locale);

  const access = await ticketReportAccess();
  const events = await listReportableTicketEvents(access);

  const thisYear = currentWorkingYear();
  const yearOf = (event: ReportableTicketEvent) => currentWorkingYear(event.startsAt);
  const years = [...new Set([thisYear, ...events.map(yearOf)])].sort((a, b) => b - a);
  const year =
    filters.jaar === ALL_YEARS
      ? null
      : years.includes(Number(filters.jaar))
        ? Number(filters.jaar)
        : thisYear;
  const groups = [
    ...new Map(
      events.map((event) => [
        event.ownerGroup.id,
        { id: event.ownerGroup.id, name: nl ? event.ownerGroup.nameNl : event.ownerGroup.nameEn },
      ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, nl ? "nl-BE" : "en-BE"));
  const groupId = groups.some((group) => group.id === filters.post) ? filters.post! : "";
  const query = filters.q?.trim() ?? "";
  const collator = nl ? "nl-BE" : "en-BE";
  const needle = query.toLocaleLowerCase(collator);

  const title = (event: ReportableTicketEvent) => (!nl && event.titleEn ? event.titleEn : event.titleNl);
  const candidates = events.filter((event) => {
    if (year !== null && yearOf(event) !== year) return false;
    if (groupId && event.ownerGroup.id !== groupId) return false;
    if (needle) {
      const haystack = [event.titleNl, event.titleEn, event.slug].filter(Boolean).join(" ").toLocaleLowerCase(collator);
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const explicit = [filters.event ?? []].flat().filter(Boolean);
  const accessible = new Set(events.map((event) => event.id));
  const selectedIds = explicit.length > 0
    ? explicit.filter((id) => accessible.has(id))
    : candidates.filter((event) => event.status !== "DRAFT").map((event) => event.id);
  const selected = new Set(selectedIds);
  const stats = selectedIds.length > 0 ? await loadTicketStats(selectedIds, access, locale) : null;

  const scopeParts = [
    year === null ? (nl ? "alle werkingsjaren" : "all working years") : `${nl ? "werkingsjaar" : "working year"} ${formatWorkingYear(year)}`,
    groupId ? groups.find((group) => group.id === groupId)?.name : null,
    query ? `“${query}”` : null,
  ].filter(Boolean);

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <Link className="ticket-admin-back" href={`${base}/admin/tickets`}>
            <ArrowLeft aria-hidden="true" size={14} />
            {nl ? "Alle ticketevents" : "All ticket events"}
          </Link>
          <h1>{nl ? "Ticketstatistieken" : "Ticket statistics"}</h1>
          <p>
            {explicit.length > 0
              ? nl
                ? `Eigen selectie van ${selectedIds.length} evenementen.`
                : `Custom selection of ${selectedIds.length} events.`
              : nl
                ? `${selectedIds.length} evenementen: ${scopeParts.join(", ")}.`
                : `${selectedIds.length} events: ${scopeParts.join(", ")}.`}
          </p>
        </div>
      </div>

      <section className="ticket-admin-section" aria-labelledby="stats-scope-heading">
        <h2 id="stats-scope-heading" className="sr-only">{nl ? "Welke evenementen" : "Which events"}</h2>
        <form className="ticket-admin-filterbar" method="get">
          <div className="ticket-admin-field ticket-admin-filter-search">
            <label htmlFor="stats-q">{nl ? "Naam bevat" : "Name contains"}</label>
            <div className="ticket-admin-input-icon">
              <Search aria-hidden="true" size={16} />
              <input
                id="stats-q"
                name="q"
                type="search"
                defaultValue={query}
                placeholder={nl ? "bv. cantus" : "e.g. cantus"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="stats-year">{nl ? "Werkingsjaar" : "Working year"}</label>
            <select id="stats-year" name="jaar" defaultValue={year === null ? ALL_YEARS : String(year)}>
              {years.map((option) => (
                <option key={option} value={option}>{formatWorkingYear(option)}</option>
              ))}
              <option value={ALL_YEARS}>{nl ? "Alle jaren" : "All years"}</option>
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="stats-post">{nl ? "Post" : "Post"}</label>
            <select id="stats-post" name="post" defaultValue={groupId}>
              <option value="">{nl ? "Alle posten" : "All posts"}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            {nl ? "Toon" : "Show"}
          </button>
        </form>

        {candidates.length > 0 ? (
          <details className="ticket-admin-details ticket-stats-picker" open={explicit.length > 0}>
            <summary className="ticket-admin-pill-summary">
              {nl
                ? `Evenementen kiezen (${candidates.filter((event) => selected.has(event.id)).length} van ${candidates.length} aangevinkt)`
                : `Choose events (${candidates.filter((event) => selected.has(event.id)).length} of ${candidates.length} selected)`}
            </summary>
            <div className="ticket-admin-details-body">
              <form method="get" className="ticket-admin-form">
                <input type="hidden" name="jaar" value={year === null ? ALL_YEARS : String(year)} />
                {groupId ? <input type="hidden" name="post" value={groupId} /> : null}
                {query ? <input type="hidden" name="q" value={query} /> : null}
                <fieldset className="ticket-stats-picker-list">
                  <legend className="sr-only">{nl ? "Evenementen" : "Events"}</legend>
                  {candidates.map((event) => (
                    <label key={event.id} className="ticket-stats-picker-item">
                      <input
                        type="checkbox"
                        name="event"
                        value={event.id}
                        defaultChecked={selected.has(event.id)}
                      />
                      <span>
                        <strong>{title(event)}</strong>
                        <span className="ticket-admin-row-meta">
                          {formatDate(event.startsAt, locale)} · {nl ? event.ownerGroup.nameNl : event.ownerGroup.nameEn}
                          {event.status === "DRAFT" ? ` · ${nl ? "concept" : "draft"}` : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div className="ticket-admin-actions ticket-stats-picker-actions">
                  {explicit.length > 0 ? (
                    <Link
                      className="ticket-admin-text-link"
                      href={`${base}/admin/tickets/statistieken?${new URLSearchParams({
                        jaar: year === null ? ALL_YEARS : String(year),
                        ...(groupId ? { post: groupId } : {}),
                        ...(query ? { q: query } : {}),
                      })}`}
                    >
                      {nl ? "Selectie wissen" : "Clear selection"}
                    </Link>
                  ) : <span />}
                  <button className="ticket-admin-button" data-variant="primary" type="submit">
                    {nl ? "Toon selectie" : "Show selection"}
                  </button>
                </div>
              </form>
            </div>
          </details>
        ) : null}
      </section>

      {events.length === 0 ? (
        <AdminEmptyState
          icon={BarChart3}
          title={nl ? "Geen statistieken beschikbaar" : "No statistics available"}
          description={
            nl
              ? "Er zijn geen ticketevents waarvoor je de statistieken mag bekijken."
              : "There are no ticket events whose statistics you can view."
          }
        />
      ) : stats === null ? (
        <AdminEmptyState
          icon={BarChart3}
          title={nl ? "Geen evenementen in deze selectie" : "No events in this selection"}
          description={
            nl
              ? "Kies een ander werkingsjaar, een andere post of een andere zoekterm."
              : "Pick another working year, post or search term."
          }
        />
      ) : (
        <TicketStatsView stats={stats} locale={locale} mode="selection" />
      )}
    </div>
  );
}
