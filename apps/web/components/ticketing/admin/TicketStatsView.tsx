import Link from "@/components/ui/Link";
import {
  BarChart3,
  CircleDollarSign,
  Clock3,
  Compass,
  Gauge,
  Layers,
  Percent,
  ShoppingCart,
  TicketCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { DailyChart, type ChartSeries } from "@/components/admin/DailyChart";
import { describeSource } from "@/lib/ticketing/source";
import { ticketAudienceLabel } from "@/lib/ticketing/audience";
import type { TicketStats } from "@/lib/ticketing/statsCompute";
import { AdminEmptyState } from "./AdminEmptyState";
import { AdminMetric } from "./AdminMetric";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  ticketBase,
  type AdminLocale,
} from "./format";

/** Drie kleuren in vaste volgorde (gevalideerd in vtk-base.css), daarna grijs. */
const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];
const seriesColor = (index: number) => SERIES_COLORS[index] ?? "var(--chart-context)";

function SectionHead({
  id,
  icon: Icon,
  title,
  intro,
  action,
}: {
  id: string;
  icon: typeof BarChart3;
  title: string;
  intro?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ticket-admin-section-head">
      <div className="ticket-admin-section-heading">
        <span className="ticket-admin-section-icon">
          <Icon aria-hidden="true" size={17} />
        </span>
        <div>
          <h2 id={id}>{title}</h2>
          {intro ? <p>{intro}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * De ticketstatistieken, voor één event (de tab "Statistieken") of voor een
 * selectie (/admin/tickets/statistieken). Wat telt als verkocht, staat in
 * `lib/ticketing/statsCompute.ts`.
 *
 * De volgorde volgt de vragen die een organisator stelt: hoeveel en hoe vol,
 * wanneer kopen mensen, langs waar komen ze, wat kopen ze, en pas daarna de
 * vergelijking per event of per post.
 */
export function TicketStatsView({
  stats,
  locale,
  mode,
  linkBuilder,
}: {
  stats: TicketStats;
  locale: AdminLocale;
  mode: "event" | "selection";
  /** De linkbouwer onder de herkomst; enkel op de tab van één event. */
  linkBuilder?: React.ReactNode;
}) {
  const nl = locale === "nl";
  const n = (value: number) => formatNumber(value, locale);
  const pct = (value: number | null) => (value === null ? "–" : formatPercent(value, locale));
  const money = (cents: number | null, currency = stats.totals.currency) =>
    cents === null ? "–" : formatMoney(cents, currency, locale);
  const { totals, funnel } = stats;
  const chartLabels = {
    table: nl ? "Toon als tabel" : "Show as table",
    day: nl ? "Dag" : "Day",
    total: nl ? "Totaal" : "Total",
  };

  if (totals.sold === 0 && funnel.started === 0) {
    return (
      <AdminEmptyState
        icon={BarChart3}
        title={nl ? "Nog niets verkocht" : "Nothing sold yet"}
        description={
          mode === "event"
            ? nl
              ? "Zodra de eerste bestelling binnen is, staan hier de cijfers."
              : "The figures appear here as soon as the first order comes in."
            : nl
              ? "In deze selectie is nog geen enkel ticket besteld. Kies andere evenementen of een ander werkingsjaar."
              : "No ticket has been ordered in this selection yet. Pick other events or another working year."
        }
      />
    );
  }

  const financePartial = totals.financeEvents > 0 && totals.financeEvents < totals.events;
  const perBucketSeries: ChartSeries[] = stats.perBucket.series.map((series, index) => ({
    ...series,
    label: series.key === "tickets" ? (nl ? "Tickets" : "Tickets") : series.label,
    color: series.key === "other" ? "var(--chart-context)" : seriesColor(index),
  }));
  const single = mode === "event";
  const event = single ? stats.events[0] : null;

  return (
    <>
      <div className="ticket-admin-metrics" aria-label={nl ? "Kerncijfers" : "Key figures"}>
        <AdminMetric
          icon={TicketCheck}
          label={nl ? "Verkocht" : "Sold"}
          value={n(totals.sold)}
          detail={
            totals.refunded > 0
              ? `${n(totals.refunded)} ${nl ? "terugbetaald" : "refunded"}`
              : nl
                ? "geldige tickets"
                : "valid tickets"
          }
        />
        <AdminMetric
          icon={Gauge}
          label={nl ? "Bezetting" : "Occupancy"}
          value={pct(totals.occupancy)}
          detail={totals.capacity > 0 ? `${n(totals.sold)} / ${n(totals.capacity)}` : nl ? "geen capaciteit" : "no capacity"}
          tone={totals.occupancy !== null && totals.occupancy >= 1 ? "success" : "default"}
        />
        <AdminMetric
          icon={UsersRound}
          label={nl ? "Aanwezig" : "Checked in"}
          value={pct(totals.attendance)}
          detail={`${n(totals.checkedIn)} ${nl ? "gescand" : "scanned"}`}
        />
        <AdminMetric
          icon={CircleDollarSign}
          label={nl ? "Netto-omzet" : "Net revenue"}
          value={money(totals.netCents)}
          detail={
            totals.netCents === null
              ? nl
                ? "geen financiële toegang"
                : "no finance access"
              : financePartial
                ? nl
                  ? `over ${totals.financeEvents} van ${totals.events} events`
                  : `across ${totals.financeEvents} of ${totals.events} events`
                : totals.averagePriceCents !== null
                  ? `${nl ? "gem." : "avg."} ${money(totals.averagePriceCents)} ${nl ? "per ticket" : "per ticket"}`
                  : undefined
          }
        />
      </div>

      <div className="ticket-admin-metrics" aria-label={nl ? "Kopers en bestellingen" : "Buyers and orders"}>
        <AdminMetric
          icon={ShoppingCart}
          label={nl ? "Bestellingen" : "Orders"}
          value={n(totals.orders)}
          detail={
            totals.ticketsPerOrder !== null
              ? `${formatNumber(Math.round(totals.ticketsPerOrder * 10) / 10, locale)} ${nl ? "tickets per bestelling" : "tickets per order"}`
              : undefined
          }
        />
        <AdminMetric
          icon={UserRound}
          label={nl ? "Kopers" : "Buyers"}
          value={n(totals.buyers)}
          detail={
            single
              ? `${pct(totals.signedInShare)} ${nl ? "ingelogd besteld" : "ordered signed in"}`
              : `${n(totals.returningBuyers)} ${nl ? "voor 2+ events" : "for 2+ events"}`
          }
        />
        <AdminMetric
          icon={Percent}
          label={nl ? "Ledenprijs" : "Member price"}
          value={pct(totals.memberPriceShare)}
          detail={nl ? "van de tickets" : "of the tickets"}
        />
        <AdminMetric
          icon={Layers}
          label={nl ? "Afgerond" : "Completed"}
          value={pct(funnel.conversion)}
          detail={`${n(funnel.paid)} ${nl ? "van" : "of"} ${n(funnel.started)} ${nl ? "gestarte bestellingen" : "started orders"}`}
        />
      </div>

      {stats.perBucket.keys.length > 0 ? (
        <section className="ticket-admin-section" aria-labelledby="stats-per-day">
          <SectionHead
            id="stats-per-day"
            icon={BarChart3}
            title={
              stats.perBucket.unit === "week"
                ? nl ? "Verkoop per week" : "Sales per week"
                : nl ? "Verkoop per dag" : "Sales per day"
            }
            intro={
              single && perBucketSeries.length > 1
                ? nl ? "Per tickettype, geldige tickets op de dag van betaling." : "Per ticket type, valid tickets on the day of payment."
                : nl ? "Geldige tickets op de dag van betaling." : "Valid tickets on the day of payment."
            }
          />
          <DailyChart
            kind="bars"
            days={stats.perBucket.keys}
            keyFormat={stats.perBucket.unit}
            series={perBucketSeries}
            locale={locale}
            title={nl ? "Verkochte tickets per dag" : "Tickets sold per day"}
            labels={{ ...chartLabels, day: stats.perBucket.unit === "week" ? (nl ? "Week" : "Week") : chartLabels.day }}
          />
        </section>
      ) : null}

      {stats.cumulative && stats.cumulative.keys.length > 1 ? (
        <section className="ticket-admin-section" aria-labelledby="stats-cumulative">
          <SectionHead
            id="stats-cumulative"
            icon={Gauge}
            title={nl ? "Verkoop tegenover de capaciteit" : "Sales against capacity"}
            intro={nl ? "Het lopende totaal, met de capaciteit als grijze lijn." : "The running total, with capacity as a grey line."}
          />
          <DailyChart
            kind="lines"
            days={stats.cumulative.keys}
            series={[
              { key: "sold", label: nl ? "Verkocht" : "Sold", color: "var(--chart-1)", values: stats.cumulative.sold },
              ...(stats.cumulative.capacity > 0
                ? [{
                    key: "capacity",
                    label: nl ? "Capaciteit" : "Capacity",
                    color: "var(--chart-context)",
                    values: stats.cumulative.keys.map(() => stats.cumulative!.capacity),
                  }]
                : []),
            ]}
            locale={locale}
            title={nl ? "Lopend totaal verkochte tickets" : "Running total of tickets sold"}
            labels={chartLabels}
          />
        </section>
      ) : null}

      {totals.sold > 0 ? (
        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="stats-hour">
            <SectionHead
              id="stats-hour"
              icon={Clock3}
              title={nl ? "Op welk uur" : "At what time"}
              intro={nl ? "Wanneer de betaling rond was, Brusselse tijd." : "When the payment went through, Brussels time."}
            />
            <DailyChart
              kind="bars"
              days={stats.byHour.map((_, hour) => String(hour))}
              keyFormat="hour"
              series={[{ key: "tickets", label: "Tickets", color: "var(--chart-1)", values: stats.byHour }]}
              locale={locale}
              title={nl ? "Verkochte tickets per uur van de dag" : "Tickets sold per hour of the day"}
              labels={{ ...chartLabels, day: nl ? "Uur" : "Hour" }}
            />
          </section>
          <section className="ticket-admin-section" aria-labelledby="stats-weekday">
            <SectionHead
              id="stats-weekday"
              icon={Clock3}
              title={nl ? "Op welke dag" : "On which day"}
              intro={nl ? "Per dag van de week." : "Per day of the week."}
            />
            <DailyChart
              kind="bars"
              days={stats.byWeekday.map((_, index) => String(index + 1))}
              keyFormat="weekday"
              series={[{ key: "tickets", label: "Tickets", color: "var(--chart-1)", values: stats.byWeekday }]}
              locale={locale}
              title={nl ? "Verkochte tickets per weekdag" : "Tickets sold per weekday"}
              labels={{ ...chartLabels, day: nl ? "Dag" : "Day" }}
            />
          </section>
        </div>
      ) : null}

      {stats.checkIns ? (
        <section className="ticket-admin-section" aria-labelledby="stats-checkins">
          <SectionHead
            id="stats-checkins"
            icon={UsersRound}
            title={nl ? "Binnenkomst per kwartier" : "Arrivals per quarter hour"}
            intro={nl ? "Aanvaarde scans aan de deur." : "Accepted scans at the door."}
          />
          <DailyChart
            kind="bars"
            days={stats.checkIns.keys}
            keyFormat="time"
            series={[{ key: "checkins", label: nl ? "Binnen" : "In", color: "var(--chart-3)", values: stats.checkIns.values }]}
            locale={locale}
            title={nl ? "Scans per kwartier" : "Scans per quarter hour"}
            labels={{ ...chartLabels, day: nl ? "Kwartier" : "Quarter" }}
          />
        </section>
      ) : null}

      <section className="ticket-admin-section" aria-labelledby="stats-sources">
        <SectionHead
          id="stats-sources"
          icon={Compass}
          title={nl ? "Herkomst" : "Where buyers came from"}
          intro={
            nl
              ? "Langs waar de koper op de ticketpagina kwam. “Afgerond” is het deel van de gestarte bestellingen dat ook betaald werd."
              : "How the buyer reached the ticket page. “Completed” is the share of started orders that were also paid."
          }
        />
        {stats.sources.length === 0 ? (
          <p className="ticket-admin-help">{nl ? "Nog geen verkochte tickets." : "No tickets sold yet."}</p>
        ) : (
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-stats-table">
              <thead>
                <tr>
                  <th>{nl ? "Herkomst" : "Source"}</th>
                  <th data-num>{nl ? "Bestellingen" : "Orders"}</th>
                  <th data-num>Tickets</th>
                  <th data-num>{nl ? "Aandeel" : "Share"}</th>
                  <th data-num>{nl ? "Afgerond" : "Completed"}</th>
                </tr>
              </thead>
              <tbody>
                {stats.sources.flatMap((row) => {
                  const described = describeSource(row.key, locale);
                  return [
                    <tr key={row.key ?? "unknown"} data-kind={described.kind}>
                      <td data-wrap="true">
                        <span className="ticket-stats-bar-label">
                          <strong>{described.label}</strong>
                          <span
                            className="ticket-stats-bar"
                            style={{ width: `${Math.round((row.share ?? 0) * 100)}%` }}
                            aria-hidden="true"
                          />
                        </span>
                      </td>
                      <td data-num>{n(row.orders)}</td>
                      <td data-num>{n(row.tickets)}</td>
                      <td data-num>{pct(row.share)}</td>
                      <td data-num>{pct(row.conversion)}</td>
                    </tr>,
                    ...row.campaigns.map((campaign) => (
                      <tr key={`${row.key}-${campaign.key}`} className="ticket-stats-subrow">
                        <td data-wrap="true">{`${nl ? "campagne" : "campaign"} “${campaign.key}”`}</td>
                        <td data-num>{n(campaign.orders)}</td>
                        <td data-num>{n(campaign.tickets)}</td>
                        <td data-num>{pct(totals.sold > 0 ? campaign.tickets / totals.sold : null)}</td>
                        <td data-num />
                      </tr>
                    )),
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
        {linkBuilder ? (
          <details className="ticket-admin-details ticket-stats-linkbuilder">
            <summary className="ticket-admin-pill-summary">
              {nl ? "Deelbare link met herkomst maken" : "Create a shareable link with a source"}
            </summary>
            <div className="ticket-admin-details-body">
              <p className="ticket-admin-help">
                {nl
                  ? "Instagram, WhatsApp en mail geven meestal niet mee van waar iemand komt. Deel je de ticketpagina daar, gebruik dan deze link: wie ermee koopt, staat hierboven onder dat kanaal."
                  : "Instagram, WhatsApp and email usually do not pass on where someone came from. When you share the ticket page there, use this link: buyers who use it show up above under that channel."}
              </p>
              {linkBuilder}
            </div>
          </details>
        ) : null}
      </section>

      {single && event ? (
        <section className="ticket-admin-section" aria-labelledby="stats-speed">
          <SectionHead
            id="stats-speed"
            icon={Gauge}
            title={nl ? "Verkoopsnelheid" : "Sales speed"}
            intro={
              nl
                ? "Gerekend vanaf de opening van de verkoop, voorverkoop meegerekend."
                : "Counted from the moment sales opened, presale included."
            }
          />
          <dl className="ticket-admin-spec">
            <div>
              <dt>{nl ? "In de eerste 24 uur" : "In the first 24 hours"}</dt>
              <dd>{pct(event.firstDayShare)}</dd>
            </div>
            <div>
              <dt>{nl ? "Helft weg na" : "Half gone after"}</dt>
              <dd>{event.halfAfterMs === null ? (nl ? "Nog niet" : "Not yet") : formatDuration(event.halfAfterMs, locale)}</dd>
            </div>
            <div>
              <dt>{nl ? "Uitverkocht na" : "Sold out after"}</dt>
              <dd>{event.soldOutAfterMs === null ? (nl ? "Nog niet" : "Not yet") : formatDuration(event.soldOutAfterMs, locale)}</dd>
            </div>
            <div>
              <dt>{nl ? "Terugbetaald" : "Refunded"}</dt>
              <dd>
                {n(totals.refunded)} {nl ? "tickets" : "tickets"}
                {totals.refundedCents ? ` · ${money(totals.refundedCents)}` : ""}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {!single && stats.events.length > 0 ? (
        <section className="ticket-admin-section" aria-labelledby="stats-events">
          <SectionHead
            id="stats-events"
            icon={TicketCheck}
            title={nl ? "Per evenement" : "Per event"}
            intro={
              nl
                ? "“Eerste 24 u” is het deel dat verkocht werd in de eerste dag na de opening van de verkoop."
                : "“First 24 h” is the share sold in the first day after sales opened."
            }
          />
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-stats-table">
              <thead>
                <tr>
                  <th>{nl ? "Evenement" : "Event"}</th>
                  <th data-num>{nl ? "Verkocht" : "Sold"}</th>
                  <th data-num>{nl ? "Bezetting" : "Occupancy"}</th>
                  <th data-num>{nl ? "Eerste 24 u" : "First 24 h"}</th>
                  <th data-num>{nl ? "Uitverkocht na" : "Sold out after"}</th>
                  <th data-num>{nl ? "Aanwezig" : "Checked in"}</th>
                  <th data-num>{nl ? "Netto" : "Net"}</th>
                </tr>
              </thead>
              <tbody>
                {stats.events.map((row) => (
                  <tr key={row.id}>
                    <td data-wrap="true">
                      <Link href={`${ticketBase(locale)}/admin/tickets/${row.id}/statistieken`}>
                        <strong>{row.title}</strong>
                      </Link>
                      <div className="ticket-admin-row-meta">
                        {formatDate(row.startsAt, locale)} · {row.groupName}
                      </div>
                    </td>
                    <td data-num>
                      {n(row.sold)}
                      {row.capacity > 0 ? <span className="ticket-stats-muted"> / {n(row.capacity)}</span> : null}
                    </td>
                    <td data-num>{pct(row.occupancy)}</td>
                    <td data-num>{pct(row.firstDayShare)}</td>
                    <td data-num>{row.soldOutAfterMs === null ? "–" : formatDuration(row.soldOutAfterMs, locale)}</td>
                    <td data-num>{pct(row.attendance)}</td>
                    <td data-num>{money(row.netCents, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!single && stats.groups.length > 1 ? (
        <section className="ticket-admin-section" aria-labelledby="stats-groups">
          <SectionHead id="stats-groups" icon={UsersRound} title={nl ? "Per post" : "Per post"} />
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-stats-table">
              <thead>
                <tr>
                  <th>{nl ? "Post" : "Post"}</th>
                  <th data-num>{nl ? "Events" : "Events"}</th>
                  <th data-num>{nl ? "Verkocht" : "Sold"}</th>
                  <th data-num>{nl ? "Bezetting" : "Occupancy"}</th>
                  <th data-num>{nl ? "Aanwezig" : "Checked in"}</th>
                  <th data-num>{nl ? "Netto" : "Net"}</th>
                </tr>
              </thead>
              <tbody>
                {stats.groups.map((row) => (
                  <tr key={row.id}>
                    <td data-wrap="true"><strong>{row.name}</strong></td>
                    <td data-num>{n(row.events)}</td>
                    <td data-num>{n(row.sold)}</td>
                    <td data-num>{pct(row.occupancy)}</td>
                    <td data-num>{pct(row.sold > 0 ? row.checkedIn / row.sold : null)}</td>
                    <td data-num>{money(row.netCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {stats.types.length > 0 ? (
        <section className="ticket-admin-section" aria-labelledby="stats-types">
          <SectionHead
            id="stats-types"
            icon={Layers}
            title={nl ? "Per tickettype" : "Per ticket type"}
            intro={
              single
                ? undefined
                : nl
                  ? "Over alle gekozen evenementen, grootste eerst."
                  : "Across all selected events, largest first."
            }
          />
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-stats-table">
              <thead>
                <tr>
                  <th>{nl ? "Tickettype" : "Ticket type"}</th>
                  <th data-num>{nl ? "Verkocht" : "Sold"}</th>
                  <th data-num>{nl ? "Aandeel" : "Share"}</th>
                  <th data-num>{nl ? "Ledenprijs" : "Member price"}</th>
                  <th data-num>{nl ? "Aanwezig" : "Checked in"}</th>
                  <th data-num>{nl ? "Netto" : "Net"}</th>
                </tr>
              </thead>
              <tbody>
                {stats.types.map((row) => {
                  const eventTitle = single ? null : stats.events.find((e) => e.id === row.eventId)?.title;
                  return (
                    <tr key={row.id}>
                      <td data-wrap="true">
                        <strong>{row.name}</strong>
                        <div className="ticket-admin-row-meta">
                          {[eventTitle, row.audience !== "PUBLIC" ? ticketAudienceLabel(row.audience, locale) : null]
                            .filter(Boolean)
                            .join(" · ") || null}
                        </div>
                      </td>
                      <td data-num>{n(row.sold)}</td>
                      <td data-num>{pct(row.share)}</td>
                      <td data-num>{row.memberPrice > 0 ? n(row.memberPrice) : "–"}</td>
                      <td data-num>{pct(row.sold > 0 ? row.checkedIn / row.sold : null)}</td>
                      <td data-num>{money(row.netCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="ticket-admin-section" aria-labelledby="stats-funnel">
        <SectionHead
          id="stats-funnel"
          icon={ShoppingCart}
          title={nl ? "Bestellingen" : "Orders"}
          intro={
            nl
              ? "Elke keer iemand op “bestellen” klikt, start er een bestelling; wie niet betaalt, laat een verlopen bestelling achter."
              : "Every click on “order” starts an order; whoever does not pay leaves an expired order behind."
          }
        />
        <dl className="ticket-admin-spec">
          <div><dt>{nl ? "Gestart" : "Started"}</dt><dd>{n(funnel.started)}</dd></div>
          <div><dt>{nl ? "Betaald" : "Paid"}</dt><dd>{n(funnel.paid)} ({pct(funnel.conversion)})</dd></div>
          <div><dt>{nl ? "Verlopen zonder betaling" : "Expired without payment"}</dt><dd>{n(funnel.expired)}</dd></div>
          <div><dt>{nl ? "Betaling mislukt" : "Payment failed"}</dt><dd>{n(funnel.failed)}</dd></div>
          <div><dt>{nl ? "Geannuleerd" : "Cancelled"}</dt><dd>{n(funnel.cancelled)}</dd></div>
          <div><dt>{nl ? "Wacht nog op betaling" : "Awaiting payment"}</dt><dd>{n(funnel.pending)}</dd></div>
          {totals.voided > 0 ? (
            <div><dt>{nl ? "Ongeldig gemaakte tickets" : "Voided tickets"}</dt><dd>{n(totals.voided)}</dd></div>
          ) : null}
          {mode === "selection" ? (
            <div><dt>{nl ? "Bijgewerkt" : "Updated"}</dt><dd>{formatDateTime(new Date(), locale)}</dd></div>
          ) : null}
        </dl>
      </section>
    </>
  );
}
