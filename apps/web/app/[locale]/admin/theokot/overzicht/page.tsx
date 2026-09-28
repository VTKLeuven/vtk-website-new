import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import type { TheokotOrderStatus } from "@prisma/client";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { formatEuro } from "@/lib/theokot";
import { getTheokotConfig } from "@/lib/theokot-server";
import { waiveSessionNoShowsAction } from "@/app/actions/theokot";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { SaleDayPicker } from "../turflijst/SaleDayPicker";

import "@/app/design/vtk-basic.css";

/**
 * Het overzicht per verkoopdag: wie er nog moet komen, wie al opgehaald heeft
 * en wie niet kwam. Aan de balie zie je enkel de persoon die voor je staat; hier
 * zie je de hele dag.
 *
 * Voor wie Theokot beheert komt daar het geld bij (wat opgehaald werd, niet wat
 * besteld werd: een no-show brengt niets op), de medewerkersbonnetjes, de knop
 * "Er liep iets mis" en de historiek van alle verkoopdagen. Een shifter met
 * enkel `theokot.pickup` ziet de lijsten, niet de cijfers.
 */

type SessionTotals = {
  orders: number;
  pickedUp: number;
  pickedUpCents: number;
  reserved: number;
  noShows: number;
  voucherPeople: number;
  voucherCents: number;
};

const EMPTY_TOTALS: SessionTotals = {
  orders: 0,
  pickedUp: 0,
  pickedUpCents: 0,
  reserved: 0,
  noShows: 0,
  voucherPeople: 0,
  voucherCents: 0,
};

/** Wat twee bonnetjes dekken: het duurste broodje van de bestelling (zie `PickupOrder`). */
function voucherCovers(lines: Array<{ unitPriceCents: number }>): number {
  return lines.reduce((highest, line) => Math.max(highest, line.unitPriceCents), 0);
}

export default async function TheokotOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/overzicht`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };
  if (!caps.pickup) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const { date } = await searchParams;
  const now = new Date();
  const tag = nl ? "nl-BE" : "en-GB";
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  const dayLabel = (d: Date) =>
    new Intl.DateTimeFormat(tag, {
      timeZone: "Europe/Brussels",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
  const shortDay = (d: Date) =>
    new Intl.DateTimeFormat(tag, {
      timeZone: "Europe/Brussels",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
      .format(d)
      .replace(/\./g, "");
  const time = (d: Date) =>
    new Intl.DateTimeFormat(tag, { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(d);

  const [sessions, grouped, redemptions, config] = await Promise.all([
    prisma.theokotSession.findMany({
      orderBy: { date: "desc" },
      select: {
        id: true,
        date: true,
        isOpen: true,
        pickupStart: true,
        pickupEnd: true,
        processedAt: true,
        noShowsWaivedAt: true,
      },
    }),
    prisma.theokotOrder.groupBy({
      by: ["sessionId", "status"],
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
    caps.manage
      ? prisma.theokotVoucherRedemption.findMany({
          select: {
            order: {
              select: { sessionId: true, status: true, lines: { select: { unitPriceCents: true } } },
            },
          },
        })
      : Promise.resolve([]),
    getTheokotConfig(),
  ]);

  const totals = new Map<string, SessionTotals>();
  const totalsFor = (id: string) => {
    let row = totals.get(id);
    if (!row) totals.set(id, (row = { ...EMPTY_TOTALS }));
    return row;
  };
  for (const group of grouped) {
    const row = totalsFor(group.sessionId);
    const count = group._count._all;
    if (group.status !== "CANCELLED") row.orders += count;
    if (group.status === "PICKED_UP") {
      row.pickedUp += count;
      row.pickedUpCents += group._sum.totalCents ?? 0;
    }
    if (group.status === "RESERVED") row.reserved += count;
    if (group.status === "NO_SHOW") row.noShows += count;
  }
  for (const { order } of redemptions) {
    const row = totalsFor(order.sessionId);
    row.voucherPeople += 1;
    // Enkel wat ook echt over de toog ging, telt mee in het geld.
    if (order.status === "PICKED_UP") row.voucherCents += voucherCovers(order.lines);
  }

  // Zonder gekozen dag: vandaag, anders de laatste die voorbij is, anders de
  // eerstvolgende. Dat is de dag waar iemand die hier kijkt naar zoekt.
  const today = ymd(now);
  const selected =
    sessions.find((s) => ymd(s.date) === date) ??
    sessions.find((s) => ymd(s.date) === today) ??
    sessions.find((s) => ymd(s.date) < today) ??
    sessions.at(-1);

  const orders = selected
    ? await prisma.theokotOrder.findMany({
        where: { sessionId: selected.id, status: { not: "CANCELLED" } },
        include: {
          user: { select: { name: true, rNumber: true } },
          pickedUpBy: { select: { name: true } },
          voucherRedemption: { select: { amount: true } },
          lines: {
            include: { sessionItem: { select: { nameNl: true, nameEn: true, order: true } } },
          },
        },
        orderBy: { user: { name: "asc" } },
      })
    : [];

  const byStatus = (status: TheokotOrderStatus) => orders.filter((order) => order.status === status);
  const reserved = byStatus("RESERVED");
  const pickedUp = byStatus("PICKED_UP").sort(
    (a, b) => (b.pickedUpAt?.getTime() ?? 0) - (a.pickedUpAt?.getTime() ?? 0),
  );
  const noShows = byStatus("NO_SHOW");
  const selectedTotals = selected ? (totals.get(selected.id) ?? EMPTY_TOTALS) : EMPTY_TOTALS;
  const pickupOver = selected ? selected.pickupEnd <= now : false;
  const started = selected ? selected.pickupStart <= now : false;

  const itemsLabel = (order: (typeof orders)[number]) =>
    [...order.lines]
      .sort((a, b) => a.sessionItem.order - b.sessionItem.order)
      .map((line) => `${line.quantity}× ${nl ? line.sessionItem.nameNl : line.sessionItem.nameEn ?? line.sessionItem.nameNl}`)
      .join(", ");

  const history = sessions.filter((s) => {
    const row = totals.get(s.id);
    return ymd(s.date) <= today && (s.isOpen || (row?.orders ?? 0) > 0);
  });
  const grand = history.reduce<SessionTotals>((sum, s) => {
    const row = totals.get(s.id) ?? EMPTY_TOTALS;
    return {
      orders: sum.orders + row.orders,
      pickedUp: sum.pickedUp + row.pickedUp,
      pickedUpCents: sum.pickedUpCents + row.pickedUpCents,
      reserved: sum.reserved + row.reserved,
      noShows: sum.noShows + row.noShows,
      voucherPeople: sum.voucherPeople + row.voucherPeople,
      voucherCents: sum.voucherCents + row.voucherCents,
    };
  }, EMPTY_TOTALS);

  const th = "px-4 py-2 font-semibold";
  const td = "px-4 py-2.5 align-top";
  const num = "px-4 py-2.5 text-right tabular-nums align-top";

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Overzicht per dag" : "Daily overview"}</h1>
      <TheokotAdminNav base={base} nl={nl} active="overzicht" caps={caps} />

      {config.noShowPaused && caps.manage ? (
        <div className="vtk-basic-alert vtk-basic-alert-warning">
          <div className="vtk-basic-alert-text">
            {nl
              ? "De no-show-verwerking staat gepauzeerd: wie niet ophaalt, krijgt geen mail en telt niet mee voor een ban."
              : "No-show processing is paused: people who don't pick up get no email and don't count towards a ban."}
          </div>
        </div>
      ) : null}

      {!selected ? (
        <Card className="p-5">
          <p className="text-sm text-[#5c667f]">
            {nl ? "Er zijn nog geen verkoopdagen." : "There are no sale days yet."}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SaleDayPicker
              base={base}
              path="/admin/theokot/overzicht"
              id="overview-sale-day"
              label={nl ? "Verkoopdag" : "Sale day"}
              options={sessions.map((s) => ({ value: ymd(s.date), label: dayLabel(s.date) }))}
              selected={ymd(selected.date)}
              showAll={false}
            />
            <p className="text-sm text-[#5c667f]">
              {nl ? "Afhalen" : "Pickup"} {time(selected.pickupStart)}–{time(selected.pickupEnd)}
              {selected.isOpen ? "" : nl ? " · gesloten" : " · closed"}
            </p>
          </div>

          <Card className="p-5">
            <dl className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  {nl ? "Bestellingen" : "Orders"}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">{selectedTotals.orders}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  {nl ? "Opgehaald" : "Picked up"}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">{selectedTotals.pickedUp}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  {pickupOver ? (nl ? "Nog niet opgehaald" : "Not picked up yet") : nl ? "Nog te komen" : "Still to come"}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">{selectedTotals.reserved}</dd>
              </div>
              {selectedTotals.noShows > 0 ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                    {nl ? "No-shows" : "No-shows"}
                  </dt>
                  <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">{selectedTotals.noShows}</dd>
                </div>
              ) : null}
              {caps.manage ? (
                <>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      {nl ? "Opbrengst" : "Revenue"}
                    </dt>
                    <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">
                      {formatEuro(selectedTotals.pickedUpCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      {nl ? "Met bonnetjes" : "With vouchers"}
                    </dt>
                    <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">
                      {selectedTotals.voucherPeople}
                      <span className="ml-1 text-sm font-normal text-[#5c667f]">
                        {nl
                          ? selectedTotals.voucherPeople === 1
                            ? "persoon"
                            : "personen"
                          : selectedTotals.voucherPeople === 1
                            ? "person"
                            : "people"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      {nl ? "Aan de balie" : "At the counter"}
                    </dt>
                    <dd className="text-2xl font-semibold tabular-nums text-vtk-ink">
                      {formatEuro(selectedTotals.pickedUpCents - selectedTotals.voucherCents)}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {caps.manage ? (
              <p className="mt-3 text-sm text-[#5c667f]">
                {nl
                  ? `Opbrengst is wat opgehaald werd; niet-opgehaalde broodjes tellen niet mee. Twee bonnetjes dekken één broodje, dus aan de balie is de opbrengst min ${formatEuro(selectedTotals.voucherCents)} aan bonnetjes.`
                  : `Revenue is what was picked up; sandwiches that were not collected don't count. Two vouchers cover one sandwich, so at the counter is revenue minus ${formatEuro(selectedTotals.voucherCents)} in vouchers.`}
              </p>
            ) : null}
          </Card>

          {caps.manage && started ? (
            selected.noShowsWaivedAt ? (
              <div className="vtk-basic-alert">
                <div className="vtk-basic-alert-text">
                  {nl
                    ? `Voor deze dag liep er iets mis: de no-shows tellen niet mee en krijgen geen mail (aangeduid op ${shortDay(selected.noShowsWaivedAt)}).`
                    : `Something went wrong on this day: its no-shows don't count and get no email (marked on ${shortDay(selected.noShowsWaivedAt)}).`}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-vtk-blue/12 px-4 py-3">
                <p className="text-sm text-[#5c667f]">
                  {nl
                    ? "Liep er iets mis op deze dag (de balie lag plat, een verkeerd afhaaluur)? Dan hoort niemand hier een no-show voor te krijgen."
                    : "Did something go wrong on this day (the counter was down, a wrong pickup time)? Then nobody should get a no-show for it."}
                </p>
                <DeleteButton
                  action={waiveSessionNoShowsAction}
                  fields={{ sessionId: selected.id }}
                  title={nl ? "No-shows van deze dag laten vallen?" : "Drop this day's no-shows?"}
                  description={
                    selected.processedAt
                      ? nl
                        ? `De ${noShows.length} no-show(s) van ${dayLabel(selected.date)} tellen niet meer mee voor een ban. Een automatische ban die daardoor onder de drempel zakt, wordt opgeheven; een ban die je zelf uitsprak, blijft. De no-showmails zijn al vertrokken en kunnen niet teruggehaald worden. De bestellingen blijven als niet opgehaald staan.`
                        : `The ${noShows.length} no-show(s) of ${dayLabel(selected.date)} no longer count towards a ban. An automatic ban that falls below the threshold because of it is lifted; a ban you set yourself stays. The no-show emails have already been sent and cannot be recalled. The orders stay booked as not picked up.`
                      : nl
                        ? `Wie op ${dayLabel(selected.date)} niet ophaalt, krijgt geen no-showmail en telt niet mee voor een ban. De bestellingen worden wel als niet opgehaald geboekt, zodat de cijfers kloppen.`
                        : `Whoever doesn't pick up on ${dayLabel(selected.date)} gets no no-show email and doesn't count towards a ban. The orders are still booked as not picked up, so the figures stay right.`
                  }
                  confirmLabel={nl ? "No-shows laten vallen" : "Drop no-shows"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "De no-shows van deze dag tellen niet meer mee" : "This day's no-shows no longer count"}
                  errorMessages={
                    nl
                      ? { SESSION_NOT_FOUND: "Deze verkoopdag bestaat niet meer." }
                      : { SESSION_NOT_FOUND: "This sale day no longer exists." }
                  }
                  errorFallback={nl ? "De no-shows konden niet weggenomen worden." : "The no-shows could not be dropped."}
                >
                  {nl ? "Er liep iets mis" : "Something went wrong"}
                </DeleteButton>
              </div>
            )
          ) : null}

          <OrderTable
            title={pickupOver ? (nl ? "Nog niet opgehaald" : "Not picked up yet") : nl ? "Nog te komen" : "Still to come"}
            empty={nl ? "Iedereen is langs geweest." : "Everyone has been."}
            nl={nl}
            rows={reserved.map((order) => ({
              id: order.id,
              name: order.user.name,
              rNumber: order.user.rNumber,
              items: itemsLabel(order),
              total: formatEuro(order.totalCents),
              extra: null,
            }))}
            extraHeading={null}
            classes={{ th, td, num }}
          />

          <OrderTable
            title={nl ? "Opgehaald" : "Picked up"}
            empty={nl ? "Nog niemand heeft opgehaald." : "Nobody has picked up yet."}
            nl={nl}
            rows={pickedUp.map((order) => ({
              id: order.id,
              name: order.user.name,
              rNumber: order.user.rNumber,
              items: itemsLabel(order),
              total: formatEuro(order.totalCents),
              extra: (
                <span className="text-[#5c667f]">
                  {order.pickedUpAt ? time(order.pickedUpAt) : "–"}
                  {order.pickedUpBy ? ` · ${order.pickedUpBy.name}` : ""}
                  {order.voucherRedemption ? (
                    <span className="ml-2 rounded-full bg-vtk-blue-soft px-2 py-0.5 text-xs font-medium text-vtk-ink">
                      {nl ? "bonnetjes" : "vouchers"}
                    </span>
                  ) : null}
                </span>
              ),
            }))}
            extraHeading={nl ? "Om, door" : "At, by"}
            classes={{ th, td, num }}
          />

          {noShows.length > 0 ? (
            <OrderTable
              title={nl ? "Niet opgehaald" : "Not picked up"}
              empty=""
              nl={nl}
              rows={noShows.map((order) => ({
                id: order.id,
                name: order.user.name,
                rNumber: order.user.rNumber,
                items: itemsLabel(order),
                total: formatEuro(order.totalCents),
                extra: order.noShowWaivedAt ? (
                  <span className="rounded-full bg-vtk-blue-soft px-2 py-0.5 text-xs font-medium text-vtk-ink">
                    {nl ? "telt niet mee" : "not counted"}
                  </span>
                ) : null,
              }))}
              extraHeading=""
              classes={{ th, td, num }}
            />
          ) : null}
        </>
      )}

      {caps.manage && history.length > 0 ? (
        <section className="space-y-3" aria-labelledby="theokot-history">
          <div>
            <h2 id="theokot-history" className="text-xl font-semibold text-vtk-ink">
              {nl ? "Alle verkoopdagen" : "All sale days"}
            </h2>
            <p className="mt-1 text-sm text-[#5c667f]">
              {nl
                ? "Opbrengst is wat opgehaald werd. Met bonnetjes: hoeveel mensen met twee medewerkersbonnetjes betaalden. Aan de balie: de opbrengst min wat de bonnetjes dekten. Klik een dag voor de lijsten."
                : "Revenue is what was picked up. With vouchers: how many people paid with two staff vouchers. At the counter: revenue minus what the vouchers covered. Click a day for its lists."}
            </p>
          </div>
          <Card className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-vtk-blue-soft text-left">
                <tr>
                  <th className={th}>{nl ? "Dag" : "Day"}</th>
                  <th className={`${th} !text-right`}>{nl ? "Bestellingen" : "Orders"}</th>
                  <th className={`${th} !text-right`}>{nl ? "Opgehaald" : "Picked up"}</th>
                  <th className={`${th} !text-right`}>{nl ? "Niet opgehaald" : "Not picked up"}</th>
                  <th className={`${th} !text-right`}>{nl ? "Opbrengst" : "Revenue"}</th>
                  <th className={`${th} !text-right`}>{nl ? "Met bonnetjes" : "With vouchers"}</th>
                  <th className={`${th} !text-right`}>{nl ? "Aan de balie" : "At the counter"}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((s) => {
                  const row = totals.get(s.id) ?? EMPTY_TOTALS;
                  const isSelected = s.id === selected?.id;
                  return (
                    <tr
                      key={s.id}
                      className={`relative border-t border-zinc-200 hover:bg-vtk-blue-soft/40 ${isSelected ? "bg-vtk-blue-soft/60" : ""}`}
                    >
                      <td className={td}>
                        {/* De link spant de hele rij: een klik op de rij opent de dag. */}
                        <Link
                          href={`${base}/admin/theokot/overzicht?date=${ymd(s.date)}`}
                          className="font-medium text-vtk-ink after:absolute after:inset-0"
                          aria-current={isSelected ? "page" : undefined}
                        >
                          {shortDay(s.date)}
                        </Link>
                        {s.noShowsWaivedAt ? (
                          <span className="ml-2 rounded-full bg-vtk-blue-soft px-2 py-0.5 text-xs font-medium text-vtk-ink">
                            {nl ? "liep mis" : "went wrong"}
                          </span>
                        ) : null}
                      </td>
                      <td className={num}>{row.orders}</td>
                      <td className={num}>{row.pickedUp}</td>
                      <td className={num}>{row.reserved + row.noShows}</td>
                      <td className={num}>{formatEuro(row.pickedUpCents)}</td>
                      <td className={num}>{row.voucherPeople}</td>
                      <td className={num}>{formatEuro(row.pickedUpCents - row.voucherCents)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-300 font-semibold text-vtk-ink">
                  <td className={td}>{nl ? "Totaal" : "Total"}</td>
                  <td className={num}>{grand.orders}</td>
                  <td className={num}>{grand.pickedUp}</td>
                  <td className={num}>{grand.reserved + grand.noShows}</td>
                  <td className={num}>{formatEuro(grand.pickedUpCents)}</td>
                  <td className={num}>{grand.voucherPeople}</td>
                  <td className={num}>{formatEuro(grand.pickedUpCents - grand.voucherCents)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

type OrderRow = {
  id: string;
  name: string;
  rNumber: string | null;
  items: string;
  total: string;
  extra: React.ReactNode;
};

/** Eén lijst van de gekozen dag: naam, wat, hoeveel, en eventueel een extra kolom. */
function OrderTable({
  title,
  empty,
  nl,
  rows,
  extraHeading,
  classes,
}: {
  title: string;
  empty: string;
  nl: boolean;
  rows: OrderRow[];
  extraHeading: string | null;
  classes: { th: string; td: string; num: string };
}) {
  const { th, td, num } = classes;
  return (
    <section className="space-y-2">
      <h2 className="flex items-baseline gap-2 text-lg font-semibold text-vtk-ink">
        {title}
        <span className="text-sm font-normal tabular-nums text-[#5c667f]">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-[#5c667f]">{empty}</p>
      ) : (
        <Card className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-vtk-blue-soft text-left">
              <tr>
                <th className={th}>{nl ? "Naam" : "Name"}</th>
                <th className={th}>{nl ? "Bestelling" : "Order"}</th>
                <th className={`${th} !text-right`}>{nl ? "Bedrag" : "Amount"}</th>
                {extraHeading !== null ? <th className={th}>{extraHeading}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-200">
                  <td className={td}>
                    <span className="block font-medium text-vtk-ink">{row.name}</span>
                    <span className="text-xs tabular-nums text-zinc-500">{row.rNumber ?? "–"}</span>
                  </td>
                  <td className={`${td} text-[#34405e]`}>{row.items}</td>
                  <td className={num}>{row.total}</td>
                  {extraHeading !== null ? <td className={td}>{row.extra}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}
