"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Button, Card } from "@vtk/ui";
import type { TheokotOrderStatus } from "@prisma/client";
import { formatEuro, type TheokotItemLayout } from "@/lib/theokot";
import { cancelOrderAction, placeOrderAction } from "@/app/actions/theokot";

export type OrderItem = {
  id: string;
  name: string;
  priceCents: number;
  remaining: number;
  isWeeklySpecial: boolean;
  /** Optionele foto; zonder foto verschijnt het gestreepte patroon. */
  imageUrl: string | null;
  /** Optionele ingrediënten; enkel dan staat er een info-icoontje bij. */
  ingredients: string | null;
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
  orderOpenLabel: string;
  orderCloseLabel: string;
  orderWindowState: "UPCOMING" | "OPEN" | "CLOSED";
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
  layout,
  ban,
}: {
  nl: boolean;
  sessions: OrderSession[];
  message: OrderMessage;
  maxItems: number;
  maxWeeklySpecial: number;
  /** Lijst of raster; ingesteld door Theokot onder Admin → Instellingen. */
  layout: TheokotItemLayout;
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
          layout={layout}
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
  layout,
  disabled,
}: {
  nl: boolean;
  session: OrderSession;
  maxItems: number;
  maxWeeklySpecial: number;
  layout: TheokotItemLayout;
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
  // In de lijst verschijnt de duimnagelkolom pas zodra er iets te tonen valt;
  // anders krijgt een aanbod zonder foto's een kolom lege vierkantjes.
  const hasPhotos = session.items.some((item) => item.imageUrl !== null);

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
          <ul
            className={
              layout === "grid"
                ? "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] sm:gap-4 sm:[grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]"
                : "divide-y divide-vtk-blue/10"
            }
          >
            {session.items.map((item) => (
              <OfferItem
                key={item.id}
                nl={nl}
                item={item}
                layout={layout}
                showThumb={hasPhotos}
                quantity={qty[item.id] ?? 0}
                atMax={totals.items >= maxItems}
                onChange={(next) => setItemQty(item, next)}
              />
            ))}
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
          {session.orderWindowState === "UPCOMING"
            ? nl
              ? `Reserveren opent op ${session.orderOpenLabel} en sluit op ${session.orderCloseLabel}.`
              : `Ordering opens on ${session.orderOpenLabel} and closes on ${session.orderCloseLabel}.`
            : nl
              ? `Reserveren is gesloten sinds ${session.orderCloseLabel}. Reservaties waren open vanaf ${session.orderOpenLabel}.`
              : `Ordering has been closed since ${session.orderCloseLabel}. Reservations were open from ${session.orderOpenLabel}.`}
        </p>
      )}

      {feedback && (
        <p className={`mt-3 text-sm ${feedback.ok ? "text-emerald-700" : "text-red-600"}`}>{feedback.text}</p>
      )}
    </Card>
  );
}

/**
 * Eén broodje in het aanbod, in de weergave die Theokot instelde.
 *
 * Raster: een fotokaart (16:10 onder een lichte scrim) met naam, prijs en de
 * plusknop eronder; zonder foto komt daar het gestreepte patroon van de site,
 * zodat een half ingevuld aanbod geen gaten toont. Lijst: dezelfde rij als
 * vroeger, met de foto als duimnagel ervoor.
 */
function OfferItem({
  nl,
  item,
  layout,
  showThumb,
  quantity,
  atMax,
  onChange,
}: {
  nl: boolean;
  item: OrderItem;
  layout: TheokotItemLayout;
  /** Toont de lijstweergave een duimnagelkolom? (Enkel als er foto's zijn.) */
  showThumb: boolean;
  quantity: number;
  /** Het maximum aantal broodjes is bereikt: enkel minder kan nog. */
  atMax: boolean;
  onChange: (next: number) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  const rootRef = useRef<HTMLLIElement>(null);
  const soldOut = item.remaining <= 0;
  const stock = soldOut
    ? nl
      ? "uitverkocht"
      : "sold out"
    : `${item.remaining} ${nl ? "beschikbaar" : "available"}`;

  // Escape en een klik ernaast sluiten de ingrediënten, zoals bij elk ander
  // paneel op de site. Enkel luisteren wanneer er iets open staat.
  useEffect(() => {
    if (!showInfo) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setShowInfo(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setShowInfo(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showInfo]);

  const infoButton = item.ingredients ? (
    <button
      type="button"
      onClick={() => setShowInfo((open) => !open)}
      aria-expanded={showInfo}
      aria-controls={infoId}
      // `relative`: het sr-only label is absoluut gepositioneerd en moet aan deze
      // knop hangen, niet aan een voorouder ergens hoger op de pagina.
      className="relative mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-vtk-blue/25 text-[11px] font-bold leading-none text-[#5c667f] transition-colors hover:border-vtk-ink hover:text-vtk-ink"
    >
      <span aria-hidden="true">i</span>
      <span className="sr-only">
        {nl ? `Ingrediënten van ${item.name}` : `Ingredients of ${item.name}`}
      </span>
    </button>
  ) : null;

  const stepper = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="h-7 w-7 rounded-full border border-vtk-blue/20 text-vtk-ink disabled:opacity-40"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 0}
        aria-label={nl ? `Eén ${item.name} minder` : `One ${item.name} less`}
      >
        −
      </button>
      <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
      <button
        type="button"
        className="h-7 w-7 rounded-full border border-vtk-blue/20 text-vtk-ink disabled:opacity-40"
        onClick={() => onChange(quantity + 1)}
        disabled={soldOut || atMax}
        aria-label={nl ? `Eén ${item.name} meer` : `One more ${item.name}`}
      >
        +
      </button>
    </div>
  );

  if (layout === "list") {
    return (
      <li ref={rootRef} className="flex items-center gap-3 py-2">
        {showThumb && <Thumb item={item} className="h-14 w-14 shrink-0 rounded-xl" sizes="56px" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <span className="text-sm font-medium text-vtk-ink">
              {item.name}
              {item.isWeeklySpecial && (
                <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-vtk-yellow-dark">
                  ★ {nl ? "vd week" : "of the week"}
                </span>
              )}
            </span>
            {infoButton}
          </div>
          <div className="text-xs text-[#5c667f]">
            {formatEuro(item.priceCents)} · {stock}
          </div>
          {showInfo && item.ingredients && (
            <p
              id={infoId}
              className="mt-1.5 rounded-lg border border-vtk-blue/10 bg-vtk-blue-soft/50 px-2.5 py-1.5 text-xs leading-relaxed text-[#34405e]"
            >
              <span className="font-semibold">{nl ? "Ingrediënten" : "Ingredients"}:</span>{" "}
              {item.ingredients}
            </p>
          )}
        </div>
        {stepper}
      </li>
    );
  }

  return (
    <li ref={rootRef} className="relative flex flex-col rounded-2xl border border-vtk-blue/12 bg-white">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-[repeating-linear-gradient(-45deg,var(--paper-2)_0_8px,var(--paper)_8px_16px)]">
        {item.imageUrl && (
          <>
            <Image
              src={item.imageUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, 220px"
              className="object-cover"
            />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(14,26,54,0.22),rgba(14,26,54,0)_62%)]" />
          </>
        )}
        {item.isWeeklySpecial && (
          <span className="absolute left-2 top-2 rounded-full bg-vtk-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-vtk-ink">
            ★ {nl ? "vd week" : "of the week"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start gap-1.5">
          <span className="text-sm font-medium leading-snug text-vtk-ink">{item.name}</span>
          {infoButton}
        </div>
        <div className="mt-1 text-xs text-[#5c667f]">{stock}</div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold tabular-nums text-vtk-ink">
            {formatEuro(item.priceCents)}
          </span>
          {stepper}
        </div>
      </div>

      {/* Over de kaart heen in plaats van eronder: een uitklap zou de hele rij
          hoger maken, en een zwevend kadertje valt in de buitenste kolom buiten
          het scherm. */}
      {showInfo && item.ingredients && (
        <div
          id={infoId}
          className="absolute inset-0 z-10 flex flex-col rounded-2xl border border-vtk-blue/15 bg-white/95 p-3 backdrop-blur-[2px]"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#5c667f]">
              {nl ? "Ingrediënten" : "Ingredients"}
            </span>
            <button
              type="button"
              onClick={() => setShowInfo(false)}
              className="relative -mr-1 -mt-1 shrink-0 px-1 text-sm leading-none text-[#5c667f] hover:text-vtk-ink"
            >
              <span aria-hidden="true">✕</span>
              <span className="sr-only">{nl ? "Ingrediënten sluiten" : "Close ingredients"}</span>
            </button>
          </div>
          <p className="mt-1 overflow-auto text-xs leading-relaxed text-[#34405e]">
            {item.ingredients}
          </p>
        </div>
      )}
    </li>
  );
}

/** Duimnagel in de lijstweergave; zonder foto het gestreepte patroon. */
function Thumb({
  item,
  className,
  sizes,
}: {
  item: OrderItem;
  className: string;
  sizes: string;
}) {
  return (
    <div
      className={`relative overflow-hidden border border-vtk-blue/10 bg-[repeating-linear-gradient(-45deg,var(--paper-2)_0_8px,var(--paper)_8px_16px)] ${className}`}
    >
      {item.imageUrl && (
        <Image src={item.imageUrl} alt="" fill sizes={sizes} className="object-cover" />
      )}
    </div>
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
