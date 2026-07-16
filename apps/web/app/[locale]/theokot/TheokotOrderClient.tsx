"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Card } from "@vtk/ui";
import type { TheokotOrderStatus } from "@prisma/client";
import { formatEuro } from "@/lib/theokot";
import { cancelOrderAction, placeOrderAction } from "@/app/actions/theokot";

export type OrderItem = {
  id: string;
  name: string;
  priceCents: number;
  remaining: number;
  isWeeklySpecial: boolean;
};

export type ExistingOrder = {
  orderId: string;
  status: TheokotOrderStatus;
  totalCents: number;
  canCancel: boolean;
  lines: Array<{ name: string; quantity: number; unitPriceCents: number }>;
};

export type OrderSession = {
  id: string;
  dateLabel: string;
  pickupLabel: string;
  orderCloseLabel: string;
  weeklySpecialLabel: string | null;
  canOrder: boolean;
  items: OrderItem[];
  existingOrder: ExistingOrder | null;
};

export type OrderMessage = { body: string };

const STATUS_LABELS: Record<TheokotOrderStatus, { nl: string; en: string; cls: string }> = {
  RESERVED: { nl: "Gereserveerd", en: "Reserved", cls: "vtk-basic-badge-accent" },
  PICKED_UP: { nl: "Opgehaald", en: "Picked up", cls: "vtk-basic-badge-success" },
  NO_SHOW: { nl: "Niet opgehaald", en: "Not picked up", cls: "vtk-basic-badge-danger" },
  CANCELLED: { nl: "Geannuleerd", en: "Cancelled", cls: "vtk-basic-badge-muted" },
};

export function TheokotOrderClient({
  nl,
  sessions,
  message,
  maxItems,
  maxWeeklySpecial,
  ban,
}: {
  nl: boolean;
  sessions: OrderSession[];
  message: OrderMessage;
  maxItems: number;
  maxWeeklySpecial: number;
  ban: { until: string } | null;
}) {
  return (
    <div className="vtk-basic-stack">
      {message.body && (
        <div className="vtk-basic-alert vtk-basic-alert-info">
          <div className="vtk-basic-alert-text">
            <div className="vtk-basic-alert-title">{nl ? "Bericht van Theokot" : "Message from Theokot"}</div>
            <p style={{ whiteSpace: "pre-wrap" }}>{message.body}</p>
          </div>
        </div>
      )}

      {ban && (
        <div className="vtk-basic-alert vtk-basic-alert-danger">
          <div className="vtk-basic-alert-text">
            <div className="vtk-basic-alert-title">{nl ? "Tijdelijk geschorst" : "Temporarily suspended"}</div>
            <p>
              {nl
                ? `Je kan niet bestellen wegens niet-opgehaalde bestellingen. Je kan terug reserveren vanaf ${ban.until}.`
                : `You cannot order due to unclaimed orders. You can reserve again from ${ban.until}.`}
            </p>
          </div>
        </div>
      )}

      <p className="vtk-basic-help">
        {nl
          ? `Je kan maximaal ${maxItems} broodjes per dag reserveren, waarvan maximaal ${maxWeeklySpecial} broodje van de week.`
          : `You can reserve up to ${maxItems} sandwiches per day, of which at most ${maxWeeklySpecial} sandwich of the week.`}
      </p>

      {sessions.length === 0 && (
        <div className="vtk-basic-empty">
          {nl
            ? "Er zijn momenteel geen verkoopdagen open om te reserveren."
            : "There are currently no sale days open for reservation."}
        </div>
      )}

      {sessions.map((s) => (
        <SessionCard
          key={s.id}
          nl={nl}
          session={s}
          maxItems={maxItems}
          maxWeeklySpecial={maxWeeklySpecial}
          disabled={ban !== null}
        />
      ))}
    </div>
  );
}

function SessionCard({
  nl,
  session,
  maxItems,
  maxWeeklySpecial,
  disabled,
}: {
  nl: boolean;
  session: OrderSession;
  maxItems: number;
  maxWeeklySpecial: number;
  disabled: boolean;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const totals = useMemo(() => {
    let items = 0;
    let weekly = 0;
    let cents = 0;
    for (const item of session.items) {
      const n = qty[item.id] ?? 0;
      items += n;
      if (item.isWeeklySpecial) weekly += n;
      cents += n * item.priceCents;
    }
    return { items, weekly, cents };
  }, [qty, session.items]);

  const overLimit = totals.items > maxItems;
  const overWeekly = totals.weekly > maxWeeklySpecial;

  function setItemQty(item: OrderItem, next: number) {
    const clamped = Math.max(0, Math.min(next, item.remaining));
    setQty((q) => ({ ...q, [item.id]: clamped }));
  }

  function submit() {
    const lines = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([sessionItemId, quantity]) => ({ sessionItemId, quantity }));
    startTransition(async () => {
      const res = await placeOrderAction(session.id, lines);
      setFeedback({ ok: res.ok, text: res.ok ? res.message ?? "" : res.error });
      if (res.ok) setQty({});
    });
  }

  const existing = session.existingOrder;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold capitalize text-vtk-ink">{session.dateLabel}</h2>
        <span className="text-sm text-[#5c667f]">
          {nl ? "Afhalen" : "Pickup"}: {session.pickupLabel}
        </span>
      </div>

      {session.weeklySpecialLabel && (
        <p className="mb-3 text-sm text-[#34405e]">
          <span className="font-semibold">{nl ? "Broodje van de week" : "Sandwich of the week"}:</span>{" "}
          {session.weeklySpecialLabel}
        </p>
      )}

      {existing && <ExistingOrderPanel nl={nl} order={existing} />}

      {!existing && session.canOrder && !disabled && (
        <>
          <ul className="divide-y divide-vtk-blue/10">
            {session.items.map((item) => {
              const n = qty[item.id] ?? 0;
              const soldOut = item.remaining <= 0;
              return (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-vtk-ink">
                      {item.name}
                      {item.isWeeklySpecial && (
                        <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-vtk-yellow-dark">
                          ★ {nl ? "vd week" : "of the week"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#5c667f]">
                      {formatEuro(item.priceCents)} ·{" "}
                      {soldOut
                        ? nl
                          ? "uitverkocht"
                          : "sold out"
                        : `${item.remaining} ${nl ? "beschikbaar" : "available"}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="h-7 w-7 rounded-full border border-vtk-blue/20 text-vtk-ink disabled:opacity-40"
                      onClick={() => setItemQty(item, n - 1)}
                      disabled={n <= 0}
                      aria-label="-"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums">{n}</span>
                    <button
                      type="button"
                      className="h-7 w-7 rounded-full border border-vtk-blue/20 text-vtk-ink disabled:opacity-40"
                      onClick={() => setItemQty(item, n + 1)}
                      disabled={soldOut || totals.items >= maxItems}
                      aria-label="+"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-[#34405e]">
              {totals.items} {nl ? "broodjes" : "sandwiches"} · <span className="font-semibold">{formatEuro(totals.cents)}</span>
              {overLimit && (
                <span className="ml-2 text-red-600">{nl ? `max ${maxItems}` : `max ${maxItems}`}</span>
              )}
              {overWeekly && (
                <span className="ml-2 text-red-600">
                  {nl ? `max ${maxWeeklySpecial} vd week` : `max ${maxWeeklySpecial} of the week`}
                </span>
              )}
            </div>
            <Button onClick={submit} disabled={pending || totals.items === 0 || overLimit || overWeekly}>
              {pending ? (nl ? "Bezig..." : "Placing...") : nl ? "Reserveren" : "Reserve"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-[#5c667f]">
            {nl ? "Annuleren kan tot " : "Cancel until "}
            {session.orderCloseLabel}.
          </p>
        </>
      )}

      {!existing && !session.canOrder && !disabled && (
        <p className="text-sm text-[#5c667f]">
          {nl
            ? "Reserveren voor deze dag is (nog) niet open."
            : "Ordering for this day is not open (yet)."}
        </p>
      )}

      {feedback && (
        <p className={`mt-3 text-sm ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.text}</p>
      )}
    </Card>
  );
}

function ExistingOrderPanel({ nl, order }: { nl: boolean; order: ExistingOrder }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const status = STATUS_LABELS[order.status];

  function cancel() {
    startTransition(async () => {
      const res = await cancelOrderAction(order.orderId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-vtk-ink">{nl ? "Jouw reservatie" : "Your reservation"}</span>
        <span className={`vtk-basic-badge ${status.cls}`}>{nl ? status.nl : status.en}</span>
      </div>
      <ul className="text-sm text-[#34405e]">
        {order.lines.map((l, i) => (
          <li key={i} className="flex justify-between py-0.5">
            <span>
              {l.quantity}× {l.name}
            </span>
            <span className="tabular-nums">{formatEuro(l.quantity * l.unitPriceCents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-vtk-blue/10 pt-2 text-sm">
        <span className="font-semibold">{nl ? "Totaal" : "Total"}</span>
        <span className="font-semibold tabular-nums">{formatEuro(order.totalCents)}</span>
      </div>
      {order.canCancel && (
        <div className="mt-3 text-right">
          <Button variant="ghost" size="sm" onClick={cancel} disabled={pending}>
            {pending ? (nl ? "Bezig..." : "Cancelling...") : nl ? "Annuleren" : "Cancel"}
          </Button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
