import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Gauge,
  Lightbulb,
  Package,
  Repeat,
  Sandwich,
  ShoppingCart,
  Ticket,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { currentWorkingYear, formatWorkingYear, workingYearStart } from "@/lib/workingYear";
import { loadTheokotStats } from "@/lib/theokot-stats-server";
import type { ProductStats } from "@/lib/theokot-stats";
import { DailyChart } from "@/components/admin/DailyChart";
import { AdminMetric } from "@/components/ticketing/admin/AdminMetric";
import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/components/ticketing/admin/format";
import { TheokotAdminNav } from "../TheokotAdminNav";

import "@/app/design/vtk-ticket-admin.css";

type Period = "jaar" | "vorig" | "30d" | "alles";

function periodFrom(raw: string | undefined): Period {
  return raw === "vorig" || raw === "30d" || raw === "alles" ? raw : "jaar";
}

/** Boven zoveel verkoopdagen tekenen de grafieken per week in plaats van per dag. */
const WEEKLY_ABOVE_DAYS = 45;

/** De maandag van een dag (`yyyy-mm-dd`), zoals `DailyChart` een week verwacht. */
function mondayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/** Dagreeksen samentellen per week, wanneer er te veel dagen zijn voor een leesbare staaf. */
function bucket(keys: string[], series: number[][], weekly: boolean): { keys: string[]; series: number[][] } {
  if (!weekly) return { keys, series };
  const weeks: string[] = [];
  const index = new Map<string, number>();
  for (const key of keys) {
    const monday = mondayOf(key);
    if (!index.has(monday)) {
      index.set(monday, weeks.length);
      weeks.push(monday);
    }
  }
  return {
    keys: weeks,
    series: series.map((values) => {
      const summed = weeks.map(() => 0);
      values.forEach((value, i) => (summed[index.get(mondayOf(keys[i]!))!]! += value));
      return summed;
    }),
  };
}

function SectionHead({ id, icon: Icon, title, intro }: { id: string; icon: LucideIcon; title: string; intro?: string }) {
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
    </div>
  );
}

/**
 * Broodjesstatistieken: wat verkoopt, hoe snel, wanneer bestellen en afhalen
 * mensen, en wat blijft er liggen. Om het aanbod en de werking bij te sturen:
 * hoeveel van welke soort je bij de bakker bestelt, op welke dag minder, en
 * wanneer de balie de meeste handen nodig heeft. De regels staan in
 * `lib/theokot-stats.ts`.
 */
export default async function TheokotStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ periode?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/statistieken`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };
  if (!caps.manage) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const period = periodFrom((await searchParams).periode);
  const now = new Date();
  const year = currentWorkingYear(now);
  const range =
    period === "jaar"
      ? { from: workingYearStart(year), to: now }
      : period === "vorig"
        ? { from: workingYearStart(year - 1), to: workingYearStart(year) }
        : period === "30d"
          ? { from: new Date(now.getTime() - 30 * 86_400_000), to: now }
          : { from: null, to: now };
  const stats = await loadTheokotStats(range);
  const { totals } = stats;

  const n = (value: number) => formatNumber(value, locale);
  const n1 = (value: number) => formatNumber(Math.round(value * 10) / 10, locale);
  const pct = (value: number | null) => (value === null ? "–" : formatPercent(value, locale));
  const money = (cents: number | null) => (cents === null ? "–" : formatMoney(Math.round(cents), "EUR", locale));
  const duration = (minutes: number | null) =>
    minutes === null ? "–" : formatDuration(minutes * 60_000, locale);
  const name = (product: ProductStats) => (nl ? product.nameNl : product.nameEn ?? product.nameNl);
  const chartLabels = {
    table: nl ? "Toon als tabel" : "Show as table",
    day: nl ? "Dag" : "Day",
    total: nl ? "Totaal" : "Total",
  };
  const weekdayName = (index: number) =>
    new Date(Date.UTC(2026, 0, 5 + index, 12)).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
      weekday: "long",
      timeZone: "UTC",
    });

  const periods: Array<{ key: Period; label: string }> = [
    { key: "jaar", label: nl ? `Werkingsjaar ${formatWorkingYear(year)}` : `Working year ${formatWorkingYear(year)}` },
    { key: "vorig", label: nl ? `Werkingsjaar ${formatWorkingYear(year - 1)}` : `Working year ${formatWorkingYear(year - 1)}` },
    { key: "30d", label: nl ? "Laatste 30 dagen" : "Last 30 days" },
    { key: "alles", label: nl ? "Alles" : "All time" },
  ];

  const weekly = stats.perDay.keys.length > WEEKLY_ABOVE_DAYS;
  const volume = bucket(stats.perDay.keys, [stats.perDay.pickedUp, stats.perDay.notPickedUp], weekly);
  const supply = bucket(stats.perDay.keys, [stats.perDay.stock, stats.perDay.ordered], weekly);
  const revenue = bucket(stats.perDay.keys, [stats.perDay.revenueCents.map((cents) => cents / 100)], weekly);
  const dayLabels = { ...chartLabels, day: weekly ? (nl ? "Week" : "Week") : chartLabels.day };

  // ---- Opvallend: een paar zinnen die uit de cijfers volgen ----
  const insights: string[] = [];
  // Een soort die maar een paar dagen bestond (een broodje van de week), is geen
  // eerlijke vergelijking met een vaste waarde.
  const minDays = Math.max(3, Math.ceil(totals.saleDays / 4));
  const regular = stats.products.filter((product) => product.daysOffered >= minDays);
  // Het vaakst uitverkocht, en bij gelijke stand het snelst: één dag waarop een
  // soort toevallig op was, zegt weinig.
  const fastest = [...regular]
    .filter((product) => product.soldOutDays >= 2 && product.avgSellOutMinutes !== null)
    .sort(
      (a, b) =>
        b.soldOutDays / b.daysOffered - a.soldOutDays / a.daysOffered ||
        a.avgSellOutMinutes! - b.avgSellOutMinutes!,
    )[0];
  if (fastest) {
    insights.push(
      nl
        ? `${name(fastest)} is het vaakst uitverkocht: op ${fastest.soldOutDays} van de ${fastest.daysOffered} dagen, gemiddeld ${duration(fastest.avgSellOutMinutes)} na het openen van de bestelronde.`
        : `${name(fastest)} sells out most often: on ${fastest.soldOutDays} of ${fastest.daysOffered} days, on average ${duration(fastest.avgSellOutMinutes)} after ordering opens.`,
    );
  }
  const slowest = [...regular]
    .filter((product) => product.sellThrough !== null && product.sellThrough < 0.9)
    .sort((a, b) => a.sellThrough! - b.sellThrough!)[0];
  if (slowest) {
    insights.push(
      nl
        ? `Van ${name(slowest)} blijft het meest liggen: ${pct(slowest.sellThrough)} van het aanbod raakt besteld, gemiddeld ${n1(slowest.leftoverPerDay ?? 0)} per dag over.`
        : `${name(slowest)} is left over most: ${pct(slowest.sellThrough)} of the supply gets ordered, on average ${n1(slowest.leftoverPerDay ?? 0)} left per day.`,
    );
  }
  const weekdays = stats.byWeekday.avgOrdered
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null && stats.byWeekday.saleDays[entry.index]! >= 2);
  if (weekdays.length >= 2) {
    const busiest = weekdays.reduce((a, b) => (b.value > a.value ? b : a));
    const quietest = weekdays.reduce((a, b) => (b.value < a.value ? b : a));
    if (busiest.value > quietest.value * 1.15) {
      insights.push(
        nl
          ? `Op ${weekdayName(busiest.index)} worden gemiddeld ${n1(busiest.value)} broodjes besteld, op ${weekdayName(quietest.index)} ${n1(quietest.value)}.`
          : `On ${weekdayName(busiest.index)} ${n1(busiest.value)} sandwiches are ordered on average, on ${weekdayName(quietest.index)} ${n1(quietest.value)}.`,
      );
    }
  }
  const peakHour = stats.orderHour.reduce((best, value, hour, all) => (value > all[best]! ? hour : best), 0);
  if (totals.orders > 0) {
    insights.push(
      nl
        ? `De meeste bestellingen komen binnen tussen ${peakHour}u en ${peakHour + 1}u; ${pct(totals.firstHourShare)} in het eerste uur nadat de bestelronde opent.`
        : `Most orders come in between ${peakHour}:00 and ${peakHour + 1}:00; ${pct(totals.firstHourShare)} in the first hour after ordering opens.`,
    );
  }
  if (stats.pickupQuarters.keys.length > 0) {
    const peak = stats.pickupQuarters.values.indexOf(Math.max(...stats.pickupQuarters.values));
    insights.push(
      nl
        ? `De drukste afhaal is het kwartier van ${stats.pickupQuarters.keys[peak]}; gemiddeld komt iemand ${duration(stats.avgPickupDelayMinutes)} na het begin van de afhaal.`
        : `The busiest pickup is the quarter from ${stats.pickupQuarters.keys[peak]}; on average people come ${duration(stats.avgPickupDelayMinutes)} after pickup opens.`,
    );
  }

  const leadTotal = stats.leadDays.sameDay + stats.leadDays.dayBefore + stats.leadDays.earlier;
  const loyaltyTotal = stats.loyalty.once + stats.loyalty.few + stats.loyalty.regular + stats.loyalty.loyal;
  const sizeTotal = stats.orderSizes.reduce((a, b) => a + b, 0);
  const maxShare = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const shareRows = (rows: Array<{ label: string; value: number }>, total: number) =>
    rows.map((row) => (
      <tr key={row.label}>
        <td data-wrap="true">
          <span className="ticket-stats-bar-label">
            <strong>{row.label}</strong>
            <span className="ticket-stats-bar" style={{ width: `${maxShare(row.value, total)}%` }} aria-hidden="true" />
          </span>
        </td>
        <td data-num>{n(row.value)}</td>
        <td data-num>{pct(total > 0 ? row.value / total : null)}</td>
      </tr>
    ));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Statistieken" : "Statistics"}</h1>
      <TheokotAdminNav base={base} nl={nl} active="statistieken" caps={caps} />

      <nav className="flex flex-wrap gap-2" aria-label={nl ? "Periode" : "Period"}>
        {periods.map((option) => (
          <Link
            key={option.key}
            href={`${base}/admin/theokot/statistieken${option.key === "jaar" ? "" : `?periode=${option.key}`}`}
            aria-current={period === option.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              period === option.key
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {totals.saleDays === 0 || totals.orders === 0 ? (
        <p className="ticket-admin-help">
          {nl
            ? "In deze periode zijn er nog geen broodjes besteld. Kies een andere periode."
            : "No sandwiches were ordered in this period yet. Pick another period."}
        </p>
      ) : (
        // De wrapper van de ticketstatistieken draagt de kleuren van de tegels;
        // enkel rond de cijfers, anders erft de navigatie erboven haar linkkleur.
        <div className="ticket-admin space-y-5">{statsBody()}</div>
      )}
    </div>
  );

  function statsBody() {
    return (
      <>
        <div className="ticket-admin-metrics" aria-label={nl ? "Kerncijfers" : "Key figures"}>
          <AdminMetric
            icon={Sandwich}
            label={nl ? "Verkocht" : "Sold"}
            value={n(totals.sandwichesPickedUp)}
            detail={`${n1(totals.avgPickedUpPerDay ?? 0)} ${nl ? "per verkoopdag" : "per sale day"} · ${n(totals.saleDays)} ${nl ? "dagen" : "days"}`}
          />
          <AdminMetric
            icon={CircleDollarSign}
            label={nl ? "Opbrengst" : "Revenue"}
            value={money(totals.revenueCents)}
            detail={`${money(totals.avgOrderValueCents)} ${nl ? "per opgehaalde bestelling" : "per collected order"}`}
          />
          <AdminMetric
            icon={Gauge}
            label={nl ? "Aanbod besteld" : "Supply ordered"}
            value={pct(totals.sellThrough)}
            detail={`${pct(totals.soldOutShare)} ${nl ? "van de soorten per dag uitverkocht" : "of kinds per day sold out"}`}
          />
          <AdminMetric
            icon={Package}
            label={nl ? "Opgehaald" : "Collected"}
            value={pct(totals.pickupRate)}
            detail={`${n(totals.sandwichesNoShow)} ${nl ? "broodjes niet opgehaald" : "sandwiches not collected"}`}
            tone={totals.pickupRate !== null && totals.pickupRate < 0.9 ? "warning" : "default"}
          />
        </div>

        <div className="ticket-admin-metrics" aria-label={nl ? "Klanten en bestellingen" : "Customers and orders"}>
          <AdminMetric
            icon={ShoppingCart}
            label={nl ? "Bestellingen" : "Orders"}
            value={n(totals.orders)}
            detail={`${n1(totals.avgSandwichesPerOrder ?? 0)} ${nl ? "broodjes per bestelling" : "sandwiches per order"}`}
          />
          <AdminMetric
            icon={UserRound}
            label={nl ? "Klanten" : "Customers"}
            value={n(totals.customers)}
            detail={`${pct(totals.returningShare)} ${nl ? "kwam op meer dan één dag" : "came on more than one day"}`}
          />
          <AdminMetric
            icon={Ticket}
            label={nl ? "Met bonnetjes" : "With vouchers"}
            value={pct(totals.voucherShare)}
            detail={nl ? "van de opgehaalde bestellingen" : "of collected orders"}
          />
          <AdminMetric
            icon={UsersRound}
            label={nl ? "Voor vergaderingen" : "For meetings"}
            value={n(totals.meetingSandwiches)}
            detail={nl ? "broodjes voor GM en bureau" : "sandwiches for GM and bureau"}
          />
        </div>

        {insights.length > 0 ? (
          <section className="ticket-admin-section" aria-labelledby="stats-insights">
            <SectionHead id="stats-insights" icon={Lightbulb} title={nl ? "Opvallend" : "Worth noting"} />
            <ul className="grid gap-2 text-sm text-[#34405e]">
              {insights.map((insight) => (
                <li key={insight} className="border-l-2 border-vtk-yellow pl-3">
                  {insight}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="ticket-admin-section" aria-labelledby="stats-volume">
          <SectionHead
            id="stats-volume"
            icon={BarChart3}
            title={weekly ? (nl ? "Broodjes per week" : "Sandwiches per week") : nl ? "Broodjes per verkoopdag" : "Sandwiches per sale day"}
            intro={nl ? "Opgehaald, en wat besteld maar niet opgehaald werd." : "Collected, and what was ordered but not collected."}
          />
          <DailyChart
            kind="bars"
            days={volume.keys}
            keyFormat={weekly ? "week" : "day"}
            series={[
              { key: "picked", label: nl ? "Opgehaald" : "Collected", color: "var(--chart-1)", values: volume.series[0]! },
              { key: "missed", label: nl ? "Niet opgehaald" : "Not collected", color: "var(--chart-context)", values: volume.series[1]! },
            ]}
            locale={locale}
            title={nl ? "Broodjes per verkoopdag" : "Sandwiches per sale day"}
            labels={dayLabels}
          />
        </section>

        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="stats-supply">
            <SectionHead
              id="stats-supply"
              icon={Package}
              title={nl ? "Aanbod tegenover besteld" : "Supply against orders"}
              intro={nl ? "Wat er lag en wat eraf ging (met vergaderingen). Het verschil bleef liggen." : "What was there and what went (with meetings). The gap was left over."}
            />
            <DailyChart
              kind="lines"
              days={supply.keys}
              keyFormat={weekly ? "week" : "day"}
              series={[
                { key: "ordered", label: nl ? "Besteld" : "Ordered", color: "var(--chart-1)", values: supply.series[1]! },
                { key: "stock", label: nl ? "Aanbod" : "Supply", color: "var(--chart-context)", values: supply.series[0]! },
              ]}
              locale={locale}
              title={nl ? "Aanbod en bestelde broodjes" : "Supply and ordered sandwiches"}
              labels={dayLabels}
            />
          </section>
          <section className="ticket-admin-section" aria-labelledby="stats-revenue">
            <SectionHead
              id="stats-revenue"
              icon={CircleDollarSign}
              title={nl ? "Opbrengst" : "Revenue"}
              intro={nl ? "In euro, van wat opgehaald werd." : "In euro, of what was collected."}
            />
            <DailyChart
              kind="bars"
              days={revenue.keys}
              keyFormat={weekly ? "week" : "day"}
              series={[{ key: "revenue", label: nl ? "Opbrengst (€)" : "Revenue (€)", color: "var(--chart-1)", values: revenue.series[0]! }]}
              locale={locale}
              title={nl ? "Opbrengst per verkoopdag" : "Revenue per sale day"}
              labels={dayLabels}
            />
          </section>
        </div>

        <section className="ticket-admin-section" aria-labelledby="stats-products">
          <SectionHead
            id="stats-products"
            icon={Sandwich}
            title={nl ? "Per soort" : "Per kind"}
            intro={
              nl
                ? "Aanbod besteld: welk deel van de voorraad een bestelling kreeg. Uitverkocht na: gemiddeld, vanaf het openen van de bestelronde, over de dagen dat het uitverkocht raakte."
                : "Supply ordered: the share of the supply that got an order. Sold out after: on average, from when ordering opened, over the days it sold out."
            }
          />
          <div className="ticket-admin-table-wrap">
            <table className="ticket-admin-table ticket-stats-table" data-compact>
              <thead>
                <tr>
                  <th>{nl ? "Broodje" : "Sandwich"}</th>
                  <th data-num>{nl ? "Besteld" : "Ordered"}</th>
                  <th data-num>{nl ? "Aanbod besteld" : "Supply ordered"}</th>
                  <th data-num>{nl ? "Dagen uitverkocht" : "Days sold out"}</th>
                  <th data-num>{nl ? "Uitverkocht na" : "Sold out after"}</th>
                  <th data-num>{nl ? "Over per dag" : "Left per day"}</th>
                  <th data-num>{nl ? "No-show" : "No-show"}</th>
                  <th data-num>{nl ? "Opbrengst" : "Revenue"}</th>
                </tr>
              </thead>
              <tbody>
                {stats.products.map((product) => (
                  <tr key={product.key}>
                    <td data-wrap="true">
                      <span className="ticket-stats-bar-label">
                        <strong>
                          {name(product)}
                          {product.weeklySpecial ? (
                            <span className="ml-2 text-xs font-medium text-[#5c667f]">
                              {nl ? "van de week" : "of the week"}
                            </span>
                          ) : null}
                        </strong>
                        <span
                          className="ticket-stats-bar"
                          style={{ width: `${Math.round(Math.min(1, product.sellThrough ?? 0) * 100)}%` }}
                          aria-hidden="true"
                        />
                      </span>
                    </td>
                    <td data-num>{n(product.ordered)}</td>
                    <td data-num>{pct(product.sellThrough)}</td>
                    <td data-num>
                      {n(product.soldOutDays)}/{n(product.daysOffered)}
                    </td>
                    <td data-num>{duration(product.avgSellOutMinutes)}</td>
                    <td data-num>{product.leftoverPerDay === null ? "–" : n1(product.leftoverPerDay)}</td>
                    <td data-num>{pct(product.noShowRate)}</td>
                    <td data-num>{money(product.revenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="stats-weekday">
            <SectionHead
              id="stats-weekday"
              icon={CalendarDays}
              title={nl ? "Per weekdag" : "Per weekday"}
              intro={nl ? "Gemiddeld aantal bestelde broodjes per verkoopdag." : "Average sandwiches ordered per sale day."}
            />
            <DailyChart
              kind="bars"
              days={[1, 2, 3, 4, 5, 6, 7].map(String)}
              keyFormat="weekday"
              series={[
                {
                  key: "avg",
                  label: nl ? "Gemiddeld besteld" : "Average ordered",
                  color: "var(--chart-1)",
                  values: stats.byWeekday.avgOrdered.map((value) => (value === null ? null : Math.round(value * 10) / 10)),
                },
              ]}
              locale={locale}
              title={nl ? "Gemiddeld bestelde broodjes per weekdag" : "Average sandwiches ordered per weekday"}
              labels={{ ...chartLabels, day: nl ? "Weekdag" : "Weekday" }}
            />
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table ticket-stats-table" data-compact>
                <thead>
                  <tr>
                    <th>{nl ? "Weekdag" : "Weekday"}</th>
                    <th data-num>{nl ? "Verkoopdagen" : "Sale days"}</th>
                    <th data-num>{nl ? "Gem. besteld" : "Avg. ordered"}</th>
                    <th data-num>{nl ? "No-shows" : "No-shows"}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byWeekday.saleDays.map((days, index) =>
                    days > 0 ? (
                      <tr key={index}>
                        <td>{weekdayName(index)}</td>
                        <td data-num>{n(days)}</td>
                        <td data-num>{n1(stats.byWeekday.avgOrdered[index] ?? 0)}</td>
                        <td data-num>{pct(stats.byWeekday.noShowRate[index] ?? null)}</td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ticket-admin-section" aria-labelledby="stats-order-hour">
            <SectionHead
              id="stats-order-hour"
              icon={Clock3}
              title={nl ? "Wanneer bestellen mensen" : "When people order"}
              intro={nl ? "Bestellingen per uur van de dag, Brusselse tijd." : "Orders per hour of the day, Brussels time."}
            />
            <DailyChart
              kind="bars"
              days={stats.orderHour.map((_, hour) => String(hour))}
              keyFormat="hour"
              series={[{ key: "orders", label: nl ? "Bestellingen" : "Orders", color: "var(--chart-1)", values: stats.orderHour }]}
              locale={locale}
              title={nl ? "Bestellingen per uur" : "Orders per hour"}
              labels={{ ...chartLabels, day: nl ? "Uur" : "Hour" }}
            />
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table ticket-stats-table" data-compact>
                <thead>
                  <tr>
                    <th>{nl ? "Besteld" : "Ordered"}</th>
                    <th data-num>{nl ? "Bestellingen" : "Orders"}</th>
                    <th data-num>{nl ? "Aandeel" : "Share"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shareRows(
                    [
                      { label: nl ? "Twee of meer dagen vooraf" : "Two or more days ahead", value: stats.leadDays.earlier },
                      { label: nl ? "De dag voordien" : "The day before", value: stats.leadDays.dayBefore },
                      { label: nl ? "Dezelfde dag" : "The same day", value: stats.leadDays.sameDay },
                    ],
                    leadTotal,
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {stats.pickupQuarters.keys.length > 0 ? (
          <section className="ticket-admin-section" aria-labelledby="stats-pickup">
            <SectionHead
              id="stats-pickup"
              icon={Clock3}
              title={nl ? "Wanneer mensen afhalen" : "When people pick up"}
              intro={
                nl
                  ? "Afhalingen per kwartier, over alle verkoopdagen samen. Om de shiften aan de balie op af te stemmen."
                  : "Pickups per quarter hour, across all sale days. To plan the shifts at the counter."
              }
            />
            <DailyChart
              kind="bars"
              days={stats.pickupQuarters.keys}
              keyFormat="time"
              series={[{ key: "pickups", label: nl ? "Afhalingen" : "Pickups", color: "var(--chart-3)", values: stats.pickupQuarters.values }]}
              locale={locale}
              title={nl ? "Afhalingen per kwartier" : "Pickups per quarter hour"}
              labels={{ ...chartLabels, day: nl ? "Kwartier" : "Quarter" }}
            />
          </section>
        ) : null}

        <div className="ticket-admin-grid" data-columns="2">
          <section className="ticket-admin-section" aria-labelledby="stats-size">
            <SectionHead
              id="stats-size"
              icon={ShoppingCart}
              title={nl ? "Grootte van een bestelling" : "Order size"}
              intro={nl ? "Hoeveel broodjes er in één bestelling zitten." : "How many sandwiches go into one order."}
            />
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table ticket-stats-table" data-compact>
                <thead>
                  <tr>
                    <th>{nl ? "Broodjes" : "Sandwiches"}</th>
                    <th data-num>{nl ? "Bestellingen" : "Orders"}</th>
                    <th data-num>{nl ? "Aandeel" : "Share"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shareRows(
                    stats.orderSizes.map((value, index) => ({
                      label: index === stats.orderSizes.length - 1 ? `${index + 1}+` : String(index + 1),
                      value,
                    })),
                    sizeTotal,
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="ticket-admin-section" aria-labelledby="stats-loyalty">
            <SectionHead
              id="stats-loyalty"
              icon={Repeat}
              title={nl ? "Hoe vaak klanten terugkomen" : "How often customers return"}
              intro={nl ? "Klanten naar het aantal verkoopdagen waarop ze bestelden." : "Customers by the number of sale days they ordered on."}
            />
            <div className="ticket-admin-table-wrap">
              <table className="ticket-admin-table ticket-stats-table" data-compact>
                <thead>
                  <tr>
                    <th>{nl ? "Verkoopdagen" : "Sale days"}</th>
                    <th data-num>{nl ? "Klanten" : "Customers"}</th>
                    <th data-num>{nl ? "Aandeel" : "Share"}</th>
                  </tr>
                </thead>
                <tbody>
                  {shareRows(
                    [
                      { label: nl ? "Eén keer" : "Once", value: stats.loyalty.once },
                      { label: nl ? "2 tot 3 dagen" : "2 to 3 days", value: stats.loyalty.few },
                      { label: nl ? "4 tot 9 dagen" : "4 to 9 days", value: stats.loyalty.regular },
                      { label: nl ? "10 dagen of meer" : "10 days or more", value: stats.loyalty.loyal },
                    ],
                    loyaltyTotal,
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </>
    );
  }
}

