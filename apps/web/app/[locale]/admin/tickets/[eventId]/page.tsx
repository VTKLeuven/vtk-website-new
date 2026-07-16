import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import {
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  MapPin,
  Package,
  ScanLine,
  ShoppingCart,
  TicketCheck,
  UsersRound,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { AdminEmptyState } from "@/components/ticketing/admin/AdminEmptyState";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import { StatusBadge } from "@/components/ticketing/admin/StatusBadge";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  ticketBase,
  type AdminLocale,
} from "@/components/ticketing/admin/format";

export default async function TicketEventDashboard({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: localeParam, eventId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { event, capabilities } = await requireTicketEventCapability(eventId, "VIEW_EVENT");
  const canViewFinance = capabilities.includes("VIEW_FINANCE");
  const canViewAttendees = capabilities.includes("VIEW_ATTENDEES");
  const canViewOrders = capabilities.includes("MANAGE_ORDERS") || canViewFinance;
  const canManageSetup = capabilities.includes("MANAGE_EVENT") || capabilities.includes("MANAGE_INVENTORY");

  const [pools, activeTypeCount, ticketCount, checkedInCount, completedOrderCount, financials, recentOrders] =
    await Promise.all([
      prisma.ticketInventoryPool.findMany({
        where: { eventId, active: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.ticketType.count({ where: { eventId, active: true } }),
      prisma.ticket.count({ where: { eventId, status: "VALID" } }),
      prisma.ticket.count({ where: { eventId, status: "VALID", checkedInAt: { not: null } } }),
      prisma.ticketOrder.count({
        where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      }),
      canViewFinance
        ? prisma.ticketOrder.aggregate({
            where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
            _sum: { totalCents: true, refundedCents: true },
          })
        : Promise.resolve(null),
      canViewOrders
        ? prisma.ticketOrder.findMany({
            where: { eventId },
            include: { _count: { select: { items: true } } },
            orderBy: { createdAt: "desc" },
            take: 6,
          })
        : Promise.resolve([]),
    ]);

  const grossRevenue = financials?._sum.totalCents ?? 0;
  const refundedRevenue = financials?._sum.refundedCents ?? 0;
  const netRevenue = grossRevenue - refundedRevenue;
  const capacity = pools.reduce((sum, pool) => sum + pool.capacity, 0);
  const sold = pools.reduce((sum, pool) => sum + pool.soldCount, 0);
  const reserved = pools.reduce((sum, pool) => sum + pool.reservedCount, 0);
  const attendanceRate = ticketCount > 0 ? checkedInCount / ticketCount : 0;
  const base = `${ticketBase(locale)}/admin/tickets/${eventId}`;
  const shopHref = `${ticketBase(locale)}/tickets/${event.slug}`;
  const setupChecks = [
    {
      label: locale === "nl" ? "Tickettype en prijs" : "Ticket type and price",
      complete: activeTypeCount > 0,
      href: `${base}/instellingen#tickettype-aanmaken`,
    },
    {
      label: locale === "nl" ? "Beschikbare capaciteit" : "Available capacity",
      complete: capacity > sold + reserved,
    },
    {
      label: locale === "nl" ? "Verkoopperiode" : "Sales window",
      complete: Boolean(event.salesStartAt && event.salesEndAt),
    },
    {
      label: locale === "nl" ? "Contactadres" : "Contact address",
      complete: Boolean(event.contactEmail),
    },
  ];

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-metrics" aria-label={locale === "nl" ? "Evenementsamenvatting" : "Event summary"}>
        <AdminMetric icon={TicketCheck} label={locale === "nl" ? "Geldige tickets" : "Valid tickets"} value={formatNumber(ticketCount, locale)} />
        <AdminMetric icon={UsersRound} label={locale === "nl" ? "Aanwezig" : "Checked in"} value={formatNumber(checkedInCount, locale)} detail={formatPercent(attendanceRate, locale)} tone={checkedInCount > 0 ? "success" : "default"} />
        <AdminMetric icon={ShoppingCart} label={locale === "nl" ? "Voltooide orders" : "Completed orders"} value={formatNumber(completedOrderCount, locale)} />
        <AdminMetric icon={CircleDollarSign} label={locale === "nl" ? "Netto-omzet" : "Net revenue"} value={canViewFinance ? formatMoney(netRevenue, event.currency, locale) : "—"} detail={canViewFinance && refundedRevenue > 0 ? `${formatMoney(refundedRevenue, event.currency, locale)} ${locale === "nl" ? "terugbetaald" : "refunded"}` : undefined} />
      </div>

      <div className="ticket-admin-grid" data-columns="2">
        <section className="ticket-admin-section" aria-labelledby="sales-status-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon"><Clock3 aria-hidden="true" size={17} /></span>
              <div>
                <h2 id="sales-status-heading">{locale === "nl" ? "Verkoopstatus" : "Sales status"}</h2>
                <p>{locale === "nl" ? "Planning en publicatie" : "Schedule and publication"}</p>
              </div>
            </div>
            <StatusBadge status={event.status} locale={locale} />
          </div>
          <dl className="ticket-admin-spec">
            <div><dt>{locale === "nl" ? "Verkoop start" : "Sales start"}</dt><dd>{formatDateTime(event.salesStartAt, locale)}</dd></div>
            <div><dt>{locale === "nl" ? "Verkoop einde" : "Sales end"}</dt><dd>{formatDateTime(event.salesEndAt, locale)}</dd></div>
            <div><dt>{locale === "nl" ? "Evenement" : "Event"}</dt><dd>{formatDateTime(event.startsAt, locale)}</dd></div>
            <div><dt>{locale === "nl" ? "Limiet per order" : "Limit per order"}</dt><dd>{formatNumber(event.maxTicketsPerOrder, locale)}</dd></div>
          </dl>
          <div className="ticket-admin-inline-details">
            <span><CalendarDays aria-hidden="true" size={14} />{formatDateTime(event.startsAt, locale)}</span>
            {event.location ? <span><MapPin aria-hidden="true" size={14} />{event.location}</span> : null}
          </div>
          <div className="ticket-admin-actions ticket-admin-section-actions">
            <Link className="ticket-admin-button" href={shopHref}>
              <ExternalLink aria-hidden="true" size={15} />
              {locale === "nl" ? "Ticketshop" : "Ticket shop"}
            </Link>
            {capabilities.includes("SCAN") ? (
              <Link className="ticket-admin-button" data-variant="primary" href={`/scan/${eventId}`}>
                <ScanLine aria-hidden="true" size={16} />
                {locale === "nl" ? "Scanner openen" : "Open scanner"}
              </Link>
            ) : null}
          </div>
        </section>

        <section className="ticket-admin-section" aria-labelledby="attendance-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon"><UsersRound aria-hidden="true" size={17} /></span>
              <div>
                <h2 id="attendance-heading">{locale === "nl" ? "Aanwezigheid" : "Attendance"}</h2>
                <p>{formatPercent(attendanceRate, locale)}</p>
              </div>
            </div>
            {canViewAttendees ? (
              <Link className="ticket-admin-button" href={`${base}/deelnemers`}>
                {locale === "nl" ? "Deelnemers" : "Attendees"}
              </Link>
            ) : null}
          </div>
          <div className="ticket-admin-progress" aria-label={formatPercent(attendanceRate, locale)}>
            <span style={{ width: `${attendanceRate * 100}%` }} />
          </div>
          <p className="ticket-admin-row-meta">
            {formatNumber(checkedInCount, locale)} {locale === "nl" ? "van" : "of"} {formatNumber(ticketCount, locale)} {locale === "nl" ? "geldige tickets gescand" : "valid tickets scanned"}
          </p>

          <div className="ticket-admin-setup-list" aria-label={locale === "nl" ? "Configuratie" : "Configuration"}>
            {setupChecks.map((check) => (
              <div key={check.label} data-complete={check.complete}>
                <span className="ticket-admin-checkmark"><Check aria-hidden="true" size={13} /></span>
                {!check.complete && check.href && canManageSetup ? (
                  <Link className="ticket-admin-setup-link" href={check.href}>{check.label}</Link>
                ) : (
                  <span>{check.label}</span>
                )}
              </div>
            ))}
          </div>
          {canManageSetup ? (
            <Link className="ticket-admin-text-link" href={`${base}/instellingen`}>
              {locale === "nl" ? "Configuratie beheren" : "Manage configuration"}
            </Link>
          ) : null}
        </section>
      </div>

      <section className="ticket-admin-section" aria-labelledby="inventory-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Package aria-hidden="true" size={17} /></span>
            <div>
              <h2 id="inventory-heading">{locale === "nl" ? "Voorraad" : "Inventory"}</h2>
              <p>{formatNumber(sold, locale)} {locale === "nl" ? "verkocht" : "sold"} · {formatNumber(reserved, locale)} {locale === "nl" ? "gereserveerd" : "reserved"}</p>
            </div>
          </div>
          {canManageSetup ? (
            <Link className="ticket-admin-button" href={`${base}/instellingen`}>
              {locale === "nl" ? "Beheren" : "Manage"}
            </Link>
          ) : null}
        </div>
        {pools.length === 0 ? (
          <AdminEmptyState icon={Package} title={locale === "nl" ? "Geen voorraad ingesteld" : "No inventory configured"} />
        ) : (
          <ul className="ticket-admin-list">
            {pools.map((pool) => {
              const occupied = pool.soldCount + pool.reservedCount;
              const percentage = pool.capacity > 0 ? Math.min(1, occupied / pool.capacity) : 0;
              return (
                <li key={pool.id}>
                  <div className="ticket-admin-row-head">
                    <div>
                      <p className="ticket-admin-row-title">{locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl}</p>
                      <p className="ticket-admin-row-meta">{formatNumber(pool.reservedCount, locale)} {locale === "nl" ? "tijdelijk gereserveerd" : "temporarily reserved"}</p>
                    </div>
                    <strong>{formatNumber(pool.soldCount, locale)} / {formatNumber(pool.capacity, locale)}</strong>
                  </div>
                  <div className="ticket-admin-progress" aria-label={formatPercent(percentage, locale)}><span style={{ width: `${percentage * 100}%` }} /></div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canViewOrders ? (
        <section className="ticket-admin-section" aria-labelledby="recent-orders-heading">
          <div className="ticket-admin-section-head">
            <div className="ticket-admin-section-heading">
              <span className="ticket-admin-section-icon"><ShoppingCart aria-hidden="true" size={17} /></span>
              <div><h2 id="recent-orders-heading">{locale === "nl" ? "Recente bestellingen" : "Recent orders"}</h2></div>
            </div>
            <Link className="ticket-admin-button" href={`${base}/bestellingen`}>
              {locale === "nl" ? "Alles bekijken" : "View all"}
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <AdminEmptyState icon={ShoppingCart} title={locale === "nl" ? "Nog geen bestellingen" : "No orders yet"} />
          ) : (
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table">
                <thead><tr><th>Referentie</th><th>{locale === "nl" ? "Koper" : "Buyer"}</th><th>Status</th><th data-priority="low">Tickets</th><th>{locale === "nl" ? "Totaal" : "Total"}</th><th data-priority="low">{locale === "nl" ? "Datum" : "Date"}</th></tr></thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="ticket-admin-code">{order.reference}</td>
                      <td data-wrap="true"><strong>{order.buyerName}</strong><div className="ticket-admin-row-meta">{order.buyerEmail}</div></td>
                      <td><StatusBadge status={order.status} locale={locale} /></td>
                      <td data-priority="low">{formatNumber(order._count.items, locale)}</td>
                      <td>{canViewFinance ? formatMoney(order.totalCents, order.currency, locale) : "—"}</td>
                      <td data-priority="low">{formatDateTime(order.createdAt, locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
