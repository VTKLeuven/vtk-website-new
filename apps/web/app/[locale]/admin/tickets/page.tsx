import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Filter,
  Plus,
  Radio,
  Search,
  TicketCheck,
  Tickets,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasLiveTicketManageAll } from "@/lib/ticketing/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { StatusBadge } from "@/components/ticketing/admin/StatusBadge";
import {
  formatDateTime,
  formatNumber,
  statusLabel,
  ticketBase,
  type AdminLocale,
} from "@/components/ticketing/admin/format";

const EVENT_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "SALES_PAUSED",
  "SALES_CLOSED",
  "CANCELLED",
  "ARCHIVED",
] as const;

export default async function TicketAdminOverview({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; timing?: string }>;
}) {
  const [{ locale: localeParam }, filters] = await Promise.all([params, searchParams]);
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const session = await requireSession();
  const canManageAll = await hasLiveTicketManageAll(session.user.id, session.user.isSuperAdmin);
  const memberships = await prisma.groupMembership.findMany({
    where: { userId: session.user.id, year: currentWorkingYear() },
    select: {
      groupId: true,
      role: true,
      group: {
        select: {
          // Posten kennen rechten toe via rollen (GroupRole -> Role -> permissions).
          roleGrants: {
            select: {
              role: {
                select: {
                  permissions: { select: { permission: { select: { code: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const allGroupIds = memberships.map((membership) => membership.groupId);
  const leadGroupIds = memberships
    .filter((membership) => membership.role === "LEAD")
    .map((membership) => membership.groupId);
  const canCreate =
    canManageAll ||
    memberships.some(
      (membership) =>
        membership.role === "LEAD" &&
        membership.group.roleGrants.some((grant) =>
          grant.role.permissions.some((entry) => entry.permission.code === "tickets.create")
        )
    );

  const events = await prisma.ticketEvent.findMany({
    where: canManageAll
      ? undefined
      : {
          OR: [
            { userGrants: { some: { userId: session.user.id } } },
            {
              groupGrants: {
                some: { groupId: { in: allGroupIds }, scope: "ALL_MEMBERS" },
              },
            },
            {
              groupGrants: {
                some: { groupId: { in: leadGroupIds }, scope: "LEADS_ONLY" },
              },
            },
          ],
        },
    include: {
      ownerGroup: true,
      inventoryPools: { select: { capacity: true, soldCount: true } },
      _count: { select: { orders: true, tickets: true } },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  const now = new Date();
  const query = filters.q?.trim().toLocaleLowerCase(locale === "nl" ? "nl-BE" : "en-BE") ?? "";
  const selectedStatus = EVENT_STATUSES.includes(filters.status as (typeof EVENT_STATUSES)[number])
    ? filters.status
    : "";
  const selectedTiming = ["upcoming", "past"].includes(filters.timing ?? "")
    ? filters.timing
    : "";
  const visibleEvents = events.filter((event) => {
    const searchable = [
      event.titleNl,
      event.titleEn,
      event.slug,
      event.location,
      event.ownerGroup.nameNl,
      event.ownerGroup.nameEn,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase(locale === "nl" ? "nl-BE" : "en-BE");
    if (query && !searchable.includes(query)) return false;
    if (selectedStatus && event.status !== selectedStatus) return false;
    if (selectedTiming === "upcoming" && event.startsAt < now) return false;
    if (selectedTiming === "past" && event.startsAt >= now) return false;
    return true;
  });

  const upcoming = events.filter((event) => event.startsAt >= now).length;
  const published = events.filter((event) => event.status === "PUBLISHED").length;
  const tickets = events.reduce((sum, event) => sum + event._count.tickets, 0);
  const base = ticketBase(locale);

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <p className="ticket-admin-eyebrow">VTK</p>
          <h1>{locale === "nl" ? "Ticketbeheer" : "Ticket management"}</h1>
          <p>
            {locale === "nl"
              ? "Verkoop, deelnemers en toegang per evenement."
              : "Sales, attendees and access for each event."}
          </p>
        </div>
        {canCreate ? (
          <Link className="ticket-admin-button" data-variant="primary" href={`${base}/admin/tickets/new`}>
            <Plus aria-hidden="true" size={16} />
            {locale === "nl" ? "Nieuw event" : "New event"}
          </Link>
        ) : null}
      </div>

      <div className="ticket-admin-metrics" aria-label={locale === "nl" ? "Samenvatting" : "Summary"}>
        <AdminMetric icon={CalendarDays} label={locale === "nl" ? "Evenementen" : "Events"} value={formatNumber(events.length, locale)} />
        <AdminMetric icon={CalendarClock} label={locale === "nl" ? "Aankomend" : "Upcoming"} value={formatNumber(upcoming, locale)} />
        <AdminMetric icon={Radio} label={locale === "nl" ? "Online" : "Online"} value={formatNumber(published, locale)} tone={published > 0 ? "success" : "default"} />
        <AdminMetric icon={TicketCheck} label={locale === "nl" ? "Tickets uitgegeven" : "Tickets issued"} value={formatNumber(tickets, locale)} />
      </div>

      <section className="ticket-admin-section" aria-labelledby="ticket-events-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="ticket-events-heading">{locale === "nl" ? "Evenementen" : "Events"}</h2>
            <p>
              {locale === "nl"
                ? `${visibleEvents.length} van ${events.length} evenementen`
                : `${visibleEvents.length} of ${events.length} events`}
            </p>
          </div>
        </div>

        <form className="ticket-admin-filterbar" method="get">
          <div className="ticket-admin-field ticket-admin-filter-search">
            <label htmlFor="ticket-event-search">{locale === "nl" ? "Zoeken" : "Search"}</label>
            <div className="ticket-admin-input-icon">
              <Search aria-hidden="true" size={16} />
              <input
                id="ticket-event-search"
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                placeholder={locale === "nl" ? "Naam, groep of locatie" : "Name, group or location"}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-event-status">Status</label>
            <select id="ticket-event-status" name="status" defaultValue={selectedStatus}>
              <option value="">{locale === "nl" ? "Alle statussen" : "All statuses"}</option>
              {EVENT_STATUSES.map((status) => (
                <option key={status} value={status}>{statusLabel(status, locale)}</option>
              ))}
            </select>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="ticket-event-timing">{locale === "nl" ? "Periode" : "Period"}</label>
            <select id="ticket-event-timing" name="timing" defaultValue={selectedTiming}>
              <option value="">{locale === "nl" ? "Alle evenementen" : "All events"}</option>
              <option value="upcoming">{locale === "nl" ? "Aankomend" : "Upcoming"}</option>
              <option value="past">{locale === "nl" ? "Afgelopen" : "Past"}</option>
            </select>
          </div>
          <button className="ticket-admin-button" type="submit">
            <Filter aria-hidden="true" size={15} />
            {locale === "nl" ? "Filter" : "Filter"}
          </button>
        </form>

        {visibleEvents.length === 0 ? (
          <AdminEmptyState
            icon={Tickets}
            title={locale === "nl" ? "Geen evenementen gevonden" : "No events found"}
            description={
              events.length === 0
                ? locale === "nl"
                  ? "Er zijn nog geen ticketevents waarvoor je toegang hebt."
                  : "There are no ticket events you can access yet."
                : locale === "nl"
                  ? "Pas je zoekopdracht of filters aan."
                  : "Adjust your search or filters."
            }
            action={
              canCreate && events.length === 0 ? (
                <Link className="ticket-admin-button" data-variant="primary" href={`${base}/admin/tickets/new`}>
                  <Plus aria-hidden="true" size={16} />
                  {locale === "nl" ? "Event aanmaken" : "Create event"}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-admin-event-table">
              <thead>
                <tr>
                  <th>{locale === "nl" ? "Evenement" : "Event"}</th>
                  <th data-priority="low">{locale === "nl" ? "Groep" : "Group"}</th>
                  <th>Start</th>
                  <th>Status</th>
                  <th data-priority="low">{locale === "nl" ? "Verkoop" : "Sales"}</th>
                  <th><span className="sr-only">{locale === "nl" ? "Openen" : "Open"}</span></th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((event) => {
                  const capacity = event.inventoryPools.reduce((sum, pool) => sum + pool.capacity, 0);
                  const sold = event.inventoryPools.reduce((sum, pool) => sum + pool.soldCount, 0);
                  return (
                    <tr key={event.id}>
                      <td data-wrap="true">
                        <strong>{locale === "en" && event.titleEn ? event.titleEn : event.titleNl}</strong>
                        <div className="ticket-admin-row-meta ticket-admin-code">/{event.slug}</div>
                      </td>
                      <td data-priority="low">{locale === "en" ? event.ownerGroup.nameEn : event.ownerGroup.nameNl}</td>
                      <td data-wrap="true">{formatDateTime(event.startsAt, locale)}</td>
                      <td><StatusBadge status={event.status} locale={locale} /></td>
                      <td data-priority="low">
                        <strong>{formatNumber(sold, locale)}</strong>
                        <div className="ticket-admin-row-meta">
                          {capacity > 0 ? `${formatNumber(capacity, locale)} ${locale === "nl" ? "plaatsen" : "spots"}` : `${event._count.orders} ${locale === "nl" ? "orders" : "orders"}`}
                        </div>
                      </td>
                      <td>
                        <Link
                          className="ticket-admin-icon-button"
                          href={`${base}/admin/tickets/${event.id}`}
                          aria-label={`${locale === "nl" ? "Open" : "Open"} ${event.titleNl}`}
                          title={locale === "nl" ? "Open event" : "Open event"}
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
        )}
      </section>
    </div>
  );
}
