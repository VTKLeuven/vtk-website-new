"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ConfirmDialog } from "@vtk/ui";
import type { TheokotOrderStatus } from "@prisma/client";
import { formatEuro, type TheokotItemLayout } from "@/lib/theokot";
import { cancelOrderAction, placeOrderAction, updateOrderAction } from "@/app/actions/theokot";

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
  /** Broodjes erbij of eraf: zolang het bestelvenster open is. */
  canEdit: boolean;
  lines: Array<{ sessionItemId: string; name: string; quantity: number; unitPriceCents: number }>;
};

export type OrderSession = {
  id: string;
  /** "maandag 28 september" */
  dateLabel: string;
  /** "maandag" */
  weekdayLabel: string;
  /** "ma 28 sep" */
  shortLabel: string;
  /** "ma" */
  dow: string;
  /** "28" */
  dayNumber: string;
  pickupLabel: string;
  orderOpenLabel: string;
  orderCloseLabel: string;
  /** "zo 12:00" */
  orderOpenShort: string;
  /** "ma 10:30" */
  orderCloseShort: string;
  orderWindowState: "UPCOMING" | "OPEN" | "CLOSED";
  canOrder: boolean;
  items: OrderItem[];
  existingOrder: ExistingOrder | null;
};

export type OrderMessage = { body: string };

/**
 * Onder dit aantal staat er "nog 5" bij een broodje. Daarboven zegt de voorraad
 * niets wat iemand moet weten: "10 beschikbaar" onder elk broodje was ruis.
 */
const LOW_STOCK = 5;

const STATUS_LABELS: Record<TheokotOrderStatus, { nl: string; en: string; tone: string }> = {
  RESERVED: { nl: "Gereserveerd", en: "Reserved", tone: "reserved" },
  PICKED_UP: { nl: "Opgehaald", en: "Picked up", tone: "done" },
  NO_SHOW: { nl: "Niet opgehaald", en: "Not picked up", tone: "danger" },
  CANCELLED: { nl: "Geannuleerd", en: "Cancelled", tone: "muted" },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * De bestelpagina van het Theokot, in de weergave die Theokot instelde.
 *
 * Twee ontwerpen, gekozen in september 2026 uit drie richtingen (zie
 * docs/design-decisions.md):
 *
 * - **Lijst**: de dagen als tabs, links het aanbod als rijen, rechts een vast
 *   mandje met je keuze, het totaal en hoe ver je van de limiet zit. Na het
 *   bestellen wordt dat mandje je reservatie.
 * - **Raster met foto's**: de dagen in de linkermarge, het aanbod als
 *   fotokaarten, een balk met het totaal eronder. Na het bestellen staat je
 *   reservatie boven het aanbod.
 *
 * Eén dag tegelijk: wie maandag bestelt, hoeft dinsdag (dat pas zondag opent)
 * niet onder zijn neus te hebben.
 */
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
  // Standaard de eerste dag waar iets te doen of te zien valt: je reservatie of
  // een open bestelvenster. Anders gewoon de eerstvolgende.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const fallback = sessions.find((s) => s.existingOrder || s.canOrder) ?? sessions[0] ?? null;
  const selected = sessions.find((s) => s.id === selectedId) ?? fallback;

  return (
    <div className="th">
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

      {!selected ? (
        <div className="vtk-basic-empty">
          {nl
            ? "Er zijn momenteel geen verkoopdagen open om te reserveren."
            : "There are currently no sale days open for reservation."}
        </div>
      ) : (
        <DayView
          // Een andere dag is een nieuwe keuze: niets van de vorige dag mag
          // blijven hangen in het mandje.
          key={selected.id}
          nl={nl}
          layout={layout}
          sessions={sessions}
          session={selected}
          onSelect={setSelectedId}
          limits={{ maxItems, maxWeeklySpecial }}
          disabled={ban !== null}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// De bestelling van één dag
// -----------------------------------------------------------------------------

type Limits = { maxItems: number; maxWeeklySpecial: number };
type DayOrder = ReturnType<typeof useDayOrder>;

/**
 * Alles wat een dag bijhoudt, los van hoe hij getekend wordt: de gekozen
 * aantallen, het aanpassen van een reservatie en de knoppen naar de server.
 */
function useDayOrder(session: OrderSession, disabled: boolean) {
  const existing = session.existingOrder;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const reservedQty = useMemo(() => {
    const own: Record<string, number> = {};
    for (const line of existing?.lines ?? []) {
      own[line.sessionItemId] = (own[line.sessionItemId] ?? 0) + line.quantity;
    }
    return own;
  }, [existing]);

  // Wat je zelf al gereserveerd hebt, is bij het aanpassen voor jou vrij: anders
  // kan wie de laatste twee broodjes kip heeft, er geen enkel meer houden.
  const items = useMemo(() => {
    const withOwn = session.items.map((item) => ({
      ...item,
      remaining: item.remaining + (editing ? (reservedQty[item.id] ?? 0) : 0),
    }));
    // Het broodje van de week bovenaan: dat is wat er deze week anders is.
    return [
      ...withOwn.filter((item) => item.isWeeklySpecial),
      ...withOwn.filter((item) => !item.isWeeklySpecial),
    ];
  }, [session.items, editing, reservedQty]);

  const totals = useMemo(() => {
    let count = 0;
    let weekly = 0;
    let cents = 0;
    const lines: Array<{ id: string; name: string; quantity: number; cents: number }> = [];
    for (const item of items) {
      const n = qty[item.id] ?? 0;
      if (n === 0) continue;
      count += n;
      if (item.isWeeklySpecial) weekly += n;
      cents += n * item.priceCents;
      lines.push({ id: item.id, name: item.name, quantity: n, cents: n * item.priceCents });
    }
    return { count, weekly, cents, lines };
  }, [qty, items]);

  const showOffer = !disabled && (editing || (!existing && session.canOrder));

  function setItemQty(item: OrderItem, next: number) {
    const clamped = Math.max(0, Math.min(next, item.remaining));
    setQty((current) => ({ ...current, [item.id]: clamped }));
  }

  function submit() {
    const lines = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([sessionItemId, quantity]) => ({ sessionItemId, quantity }));
    startTransition(async () => {
      const res =
        editing && existing
          ? await updateOrderAction(existing.orderId, lines)
          : await placeOrderAction(session.id, lines);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // De server ververst de pagina; de reservatie die dan verschijnt, is de
      // bevestiging.
      setError(null);
      setQty({});
      setEditing(false);
    });
  }

  function startEditing() {
    setQty({ ...reservedQty });
    setError(null);
    setEditing(true);
  }

  function stopEditing() {
    setQty({});
    setError(null);
    setEditing(false);
  }

  function cancel(onDone: () => void) {
    if (!existing) return;
    startTransition(async () => {
      const res = await cancelOrderAction(existing.orderId);
      if (!res.ok) setError(res.error);
      onDone();
    });
  }

  return {
    existing,
    editing,
    pending,
    error,
    qty,
    items,
    totals,
    reservedQty,
    showOffer,
    setItemQty,
    submit,
    startEditing,
    stopEditing,
    cancel,
  };
}

type LayoutProps = {
  nl: boolean;
  sessions: OrderSession[];
  session: OrderSession;
  onSelect: (id: string) => void;
  order: DayOrder;
  limits: Limits;
  disabled: boolean;
};

function DayView({
  layout,
  ...props
}: Omit<LayoutProps, "order"> & { layout: TheokotItemLayout }) {
  const order = useDayOrder(props.session, props.disabled);
  return layout === "grid" ? <GridLayout {...props} order={order} /> : <ListLayout {...props} order={order} />;
}

// -----------------------------------------------------------------------------
// A · Lijst: aanbod links, mandje rechts
// -----------------------------------------------------------------------------

function ListLayout({ nl, sessions, session, onSelect, order, limits, disabled }: LayoutProps) {
  const specials = order.items.filter((item) => item.isWeeklySpecial);
  const regular = order.items.filter((item) => !item.isWeeklySpecial);
  const hasPhotos = order.items.some((item) => item.imageUrl !== null);
  const readOnly = !order.showOffer;
  const atMax = order.totals.count >= limits.maxItems;
  const weeklyAtMax = order.totals.weekly >= limits.maxWeeklySpecial;

  const row = (item: OrderItem) => (
    <ListRow
      key={item.id}
      nl={nl}
      item={item}
      showThumb={hasPhotos}
      quantity={order.qty[item.id] ?? 0}
      reserved={readOnly ? (order.reservedQty[item.id] ?? 0) : 0}
      readOnly={readOnly}
      atMax={atMax || (item.isWeeklySpecial && weeklyAtMax)}
      onChange={(next) => order.setItemQty(item, next)}
    />
  );

  return (
    <>
      <DayTabs nl={nl} sessions={sessions} selected={session} onSelect={onSelect} />
      <div className="th-a">
        <section className="th-a-main" aria-labelledby="th-day-title">
          <div className="th-dayhead">
            <h2 id="th-day-title">{capitalize(session.dateLabel)}</h2>
            <span className="th-tn">
              {nl ? "Afhalen" : "Pickup"} {session.pickupLabel}
            </span>
          </div>
          <DayIntro nl={nl} session={session} order={order} limits={limits} disabled={disabled} />

          {specials.length > 0 && <ul className="th-rows is-special">{specials.map(row)}</ul>}
          {regular.length > 0 && (
            <ul className="th-rows">
              {specials.length > 0 && (
                <li className="th-rows-label" aria-hidden="true">
                  {nl ? "Vast aanbod" : "Regular menu"}
                </li>
              )}
              {regular.map(row)}
            </ul>
          )}
        </section>

        {(order.showOffer || order.existing) && (
          <aside className={`th-a-side${order.showOffer ? "" : " is-reservation"}`}>
            {order.showOffer ? (
              <Basket nl={nl} session={session} order={order} limits={limits} />
            ) : (
              <Reservation nl={nl} session={session} order={order} disabled={disabled} />
            )}
          </aside>
        )}
      </div>
      {/* Op een smal scherm staat het mandje onder de hele lijst; deze balk
          houdt het totaal en de knop in beeld. */}
      {order.showOffer && (
        <OrderBar nl={nl} session={session} order={order} limits={limits} className="th-bar-sticky th-mobile-only" />
      )}
    </>
  );
}

function ListRow({
  nl,
  item,
  showThumb,
  quantity,
  reserved,
  readOnly,
  atMax,
  onChange,
}: {
  nl: boolean;
  item: OrderItem;
  showThumb: boolean;
  quantity: number;
  /** Zoveel staan er van dit broodje in je reservatie (enkel zonder stappers). */
  reserved: number;
  readOnly: boolean;
  atMax: boolean;
  onChange: (next: number) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  return (
    <li className={`th-row${quantity > 0 ? " is-picked" : ""}`}>
      {showThumb && <Thumb item={item} className="th-row-thumb" sizes="56px" />}
      <div className="th-row-text">
        {item.isWeeklySpecial && <SpecialLabel nl={nl} />}
        <div className="th-name">
          <span>{item.name}</span>
          {item.ingredients && (
            <InfoButton
              nl={nl}
              name={item.name}
              open={showInfo}
              controls={infoId}
              onToggle={() => setShowInfo((open) => !open)}
            />
          )}
        </div>
        <div className="th-row-meta">
          <span className="th-tn">{formatEuro(item.priceCents)}</span>
          <StockPill nl={nl} remaining={item.remaining} />
        </div>
        {showInfo && item.ingredients && (
          <p id={infoId} className="th-ingredients">
            <b>{nl ? "Ingrediënten" : "Ingredients"}:</b> {item.ingredients}
          </p>
        )}
      </div>
      {readOnly ? (
        reserved > 0 ? (
          <span className="th-mine">{nl ? `${reserved}× in je reservatie` : `${reserved}× in your reservation`}</span>
        ) : null
      ) : (
        <Stepper nl={nl} item={item} quantity={quantity} atMax={atMax} onChange={onChange} />
      )}
    </li>
  );
}

function Basket({
  nl,
  session,
  order,
  limits,
}: {
  nl: boolean;
  session: OrderSession;
  order: DayOrder;
  limits: Limits;
}) {
  const { totals } = order;
  return (
    <div className="th-card th-basket">
      <div>
        <div className="th-card-title">
          {order.editing
            ? nl
              ? "Je reservatie aanpassen"
              : "Change your reservation"
            : nl
              ? "Jouw bestelling"
              : "Your order"}
        </div>
        <div className="th-card-sub">
          {nl ? "Voor " : "For "}
          {session.dateLabel}
        </div>
      </div>

      {totals.lines.length === 0 ? (
        <p className="th-basket-empty">{nl ? "Kies hiernaast je broodjes." : "Pick your sandwiches on the left."}</p>
      ) : (
        <ul className="th-lines">
          {totals.lines.map((line) => (
            <li key={line.id}>
              <span>
                {line.quantity}× {line.name}
              </span>
              <span className="th-tn">{formatEuro(line.cents)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="th-total">
        <span>{nl ? "Totaal" : "Total"}</span>
        <span className="th-tn">{formatEuro(totals.cents)}</span>
      </div>

      <div className="th-meters">
        <Meter label={nl ? "Broodjes" : "Sandwiches"} value={totals.count} max={limits.maxItems} nl={nl} />
        {limits.maxWeeklySpecial > 0 && (
          <Meter
            label={nl ? "Broodje van de week" : "Sandwich of the week"}
            value={totals.weekly}
            max={limits.maxWeeklySpecial}
            nl={nl}
          />
        )}
      </div>

      {order.error && (
        <p className="th-error" role="alert">
          {order.error}
        </p>
      )}

      <SubmitButton nl={nl} session={session} order={order} limits={limits} className="th-btn-block" />
      {order.editing && (
        <button
          type="button"
          className="th-btn th-btn-ghost th-btn-block"
          onClick={order.stopEditing}
          disabled={order.pending}
        >
          {nl ? "Niet aanpassen" : "Keep as is"}
        </button>
      )}
      <p className="th-fine">
        {order.editing && totals.count === 0
          ? nl
            ? "Geen broodjes meer nodig? Annuleer dan je reservatie."
            : "No sandwiches needed any more? Cancel your reservation instead."
          : nl
            ? `Je betaalt aan de balie bij het afhalen. Aanpassen of annuleren kan tot ${session.orderCloseShort}.`
            : `You pay at the counter when you pick up. Change or cancel until ${session.orderCloseShort}.`}
      </p>
    </div>
  );
}

function Meter({ label, value, max, nl }: { label: string; value: number; max: number; nl: boolean }) {
  return (
    <div className={`th-meter${value > max ? " is-over" : ""}`}>
      <div className="th-meter-head">
        <span>{label}</span>
        <span className="th-tn">
          {value} {nl ? "van" : "of"} {max}
        </span>
      </div>
      <div className="th-meter-track" aria-hidden="true">
        <div style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// B · Raster: dagen in de marge, fotokaarten
// -----------------------------------------------------------------------------

function GridLayout({ nl, sessions, session, onSelect, order, limits, disabled }: LayoutProps) {
  const readOnly = !order.showOffer;
  const atMax = order.totals.count >= limits.maxItems;
  const weeklyAtMax = order.totals.weekly >= limits.maxWeeklySpecial;
  return (
    <>
      <DayTabs nl={nl} sessions={sessions} selected={session} onSelect={onSelect} className="th-mobile-only" />
      <div className="th-b">
        <DayRail nl={nl} sessions={sessions} selected={session} onSelect={onSelect} limits={limits} />
        <section className="th-b-main" aria-labelledby="th-day-title">
          {order.existing && !order.editing && (
            <Reservation nl={nl} session={session} order={order} disabled={disabled} wide />
          )}
          <div className="th-dayhead">
            <h2 id="th-day-title">
              {nl ? "Aanbod van " : "Menu for "}
              {session.weekdayLabel}
            </h2>
            <span className="th-tn">
              {order.showOffer
                ? nl
                  ? `Bestellen tot ${session.orderCloseShort}`
                  : `Order until ${session.orderCloseShort}`
                : `${nl ? "Afhalen" : "Pickup"} ${session.pickupLabel}`}
            </span>
          </div>
          <DayIntro nl={nl} session={session} order={order} limits={limits} disabled={disabled} hideLimits />
          <ul className="th-cards">
            {order.items.map((item) => (
              <GridCard
                key={item.id}
                nl={nl}
                item={item}
                quantity={order.qty[item.id] ?? 0}
                reserved={readOnly ? (order.reservedQty[item.id] ?? 0) : 0}
                readOnly={readOnly}
                atMax={atMax || (item.isWeeklySpecial && weeklyAtMax)}
                onChange={(next) => order.setItemQty(item, next)}
              />
            ))}
          </ul>
          {order.showOffer && (
            <OrderBar nl={nl} session={session} order={order} limits={limits} className="th-bar-sticky" />
          )}
        </section>
      </div>
    </>
  );
}

function GridCard({
  nl,
  item,
  quantity,
  reserved,
  readOnly,
  atMax,
  onChange,
}: {
  nl: boolean;
  item: OrderItem;
  quantity: number;
  reserved: number;
  readOnly: boolean;
  atMax: boolean;
  onChange: (next: number) => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  const rootRef = useRef<HTMLLIElement>(null);

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

  const picked = quantity > 0 || reserved > 0;
  return (
    <li ref={rootRef} className={`th-gcard${picked ? " is-picked" : ""}${item.isWeeklySpecial ? " is-special" : ""}`}>
      <Thumb item={item} className="th-gcard-photo" sizes="(max-width: 640px) 50vw, 240px" />
      <div className="th-gcard-body">
        {item.isWeeklySpecial && <SpecialLabel nl={nl} />}
        <div className="th-name">
          <span>{item.name}</span>
          {item.ingredients && (
            <InfoButton
              nl={nl}
              name={item.name}
              open={showInfo}
              controls={infoId}
              onToggle={() => setShowInfo((open) => !open)}
            />
          )}
        </div>
        <StockPill nl={nl} remaining={item.remaining} />
        <div className="th-gcard-foot">
          <span className="th-tn th-gcard-price">{formatEuro(item.priceCents)}</span>
          {readOnly ? (
            reserved > 0 ? (
              <span className="th-mine">{nl ? `${reserved}× van jou` : `${reserved}× yours`}</span>
            ) : null
          ) : (
            <Stepper nl={nl} item={item} quantity={quantity} atMax={atMax} onChange={onChange} />
          )}
        </div>
      </div>

      {/* Over de kaart heen in plaats van eronder: een uitklap zou de hele rij
          hoger maken, en een zwevend kadertje valt in de buitenste kolom buiten
          het scherm. */}
      {showInfo && item.ingredients && (
        <div id={infoId} className="th-gcard-info">
          <div className="th-gcard-info-head">
            <span>{nl ? "Ingrediënten" : "Ingredients"}</span>
            <button type="button" onClick={() => setShowInfo(false)}>
              <span aria-hidden="true">✕</span>
              <span className="sr-only">{nl ? "Ingrediënten sluiten" : "Close ingredients"}</span>
            </button>
          </div>
          <p>{item.ingredients}</p>
        </div>
      )}
    </li>
  );
}

function DayRail({
  nl,
  sessions,
  selected,
  onSelect,
  limits,
}: {
  nl: boolean;
  sessions: OrderSession[];
  selected: OrderSession;
  onSelect: (id: string) => void;
  limits: Limits;
}) {
  return (
    <nav className="th-rail th-desktop-only" aria-label={nl ? "Verkoopdagen" : "Sale days"}>
      <div className="th-rail-label">{nl ? "Verkoopdagen" : "Sale days"}</div>
      {sessions.map((s) => {
        const on = s.id === selected.id;
        return (
          <button
            key={s.id}
            type="button"
            className={`th-rail-day${on ? " is-on" : ""}`}
            aria-pressed={on}
            onClick={() => onSelect(s.id)}
          >
            <DatePin dow={s.dow} day={s.dayNumber} />
            <span className="th-rail-text">
              <span className="th-rail-name">{capitalize(s.weekdayLabel)}</span>
              <DayState nl={nl} session={s} />
            </span>
          </button>
        );
      })}
      <p className="th-rail-note">
        {nl
          ? `Maximaal ${limits.maxItems} broodjes per dag, waarvan ${limits.maxWeeklySpecial} broodje van de week.`
          : `Up to ${limits.maxItems} sandwiches per day, of which ${limits.maxWeeklySpecial} sandwich of the week.`}
      </p>
    </nav>
  );
}

// -----------------------------------------------------------------------------
// Gedeeld
// -----------------------------------------------------------------------------

/** De dagen als tabs: bovenaan in de lijst, en op een smal scherm ook in het raster. */
function DayTabs({
  nl,
  sessions,
  selected,
  onSelect,
  className = "",
}: {
  nl: boolean;
  sessions: OrderSession[];
  selected: OrderSession;
  onSelect: (id: string) => void;
  className?: string;
}) {
  if (sessions.length < 2) return null;
  return (
    <div className={`th-tabs ${className}`} role="group" aria-label={nl ? "Verkoopdagen" : "Sale days"}>
      {sessions.map((s) => {
        const on = s.id === selected.id;
        return (
          <button
            key={s.id}
            type="button"
            className={`th-tab${on ? " is-on" : ""}`}
            aria-pressed={on}
            aria-label={capitalize(s.dateLabel)}
            onClick={() => onSelect(s.id)}
          >
            <span className="th-tab-full">
              <span className="th-tab-day">{capitalize(s.shortLabel)}</span>
              <DayState nl={nl} session={s} />
            </span>
            <span className="th-tab-compact" aria-hidden="true">
              <span className="th-tab-dow">{s.dow}</span>
              <span className="th-tab-num th-tn">{s.dayNumber}</span>
              {s.existingOrder?.status === "RESERVED" && <span className="th-dot" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Wat er met een dag aan de hand is, in een paar woorden. */
function DayState({ nl, session }: { nl: boolean; session: OrderSession }) {
  const existing = session.existingOrder;
  if (existing) {
    const label = STATUS_LABELS[existing.status];
    return (
      <span className="th-daystate">
        {existing.status === "RESERVED" && <span className="th-dot" aria-hidden="true" />}
        {nl ? label.nl : label.en}
      </span>
    );
  }
  const text =
    session.orderWindowState === "UPCOMING"
      ? nl
        ? `Opent ${session.orderOpenShort}`
        : `Opens ${session.orderOpenShort}`
      : session.canOrder
        ? nl
          ? `Open tot ${session.orderCloseShort}`
          : `Open until ${session.orderCloseShort}`
        : nl
          ? "Gesloten"
          : "Closed";
  return <span className="th-daystate">{text}</span>;
}

/**
 * De regel onder de dagkop: de limiet, of waarom je nu niet kan bestellen. Het
 * aanbod staat er ook dan onder, zodat je al ziet wat er komt.
 */
function DayIntro({
  nl,
  session,
  order,
  limits,
  disabled,
  hideLimits = false,
}: {
  nl: boolean;
  session: OrderSession;
  order: DayOrder;
  limits: Limits;
  disabled: boolean;
  hideLimits?: boolean;
}) {
  if (order.editing) {
    return (
      <p className="th-hint">
        {nl
          ? "Je past je reservatie aan. Wat je nu kiest, vervangt wat je had."
          : "You are changing your reservation. What you pick now replaces what you had."}
      </p>
    );
  }
  if (order.existing) return null;
  if (order.showOffer) {
    return hideLimits ? null : (
      <p className="th-hint">
        {nl
          ? `Maximaal ${limits.maxItems} broodjes, waarvan ${limits.maxWeeklySpecial} broodje van de week.`
          : `Up to ${limits.maxItems} sandwiches, of which ${limits.maxWeeklySpecial} sandwich of the week.`}
      </p>
    );
  }
  if (disabled) return null;
  return (
    <p className="th-notice">
      {session.orderWindowState === "UPCOMING"
        ? nl
          ? `Reserveren voor ${session.weekdayLabel} opent ${session.orderOpenLabel} en sluit ${session.orderCloseLabel}. Dit is het aanbod.`
          : `Ordering for ${session.weekdayLabel} opens ${session.orderOpenLabel} and closes ${session.orderCloseLabel}. This is the menu.`
        : nl
          ? `Reserveren is gesloten sinds ${session.orderCloseLabel}.`
          : `Ordering has been closed since ${session.orderCloseLabel}.`}
    </p>
  );
}

/**
 * De reservatie van die dag: wanneer je afhaalt, wat je betaalt, en aanpassen
 * of annuleren. In de lijst staat ze rechts in de plaats van het mandje, in het
 * raster breed boven het aanbod.
 */
function Reservation({
  nl,
  session,
  order,
  disabled,
  wide = false,
}: {
  nl: boolean;
  session: OrderSession;
  order: DayOrder;
  disabled: boolean;
  wide?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const existing = order.existing;
  if (!existing) return null;
  const status = STATUS_LABELS[existing.status];
  const canEdit = existing.canEdit && !disabled;
  const count = existing.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className={`th-card th-reservation${wide ? " is-wide" : ""}`}>
      <div className="th-reservation-head">
        <span className="th-card-title">{nl ? "Jouw reservatie" : "Your reservation"}</span>
        <span className={`th-status is-${status.tone}`}>{nl ? status.nl : status.en}</span>
      </div>

      <div className="th-pickup">
        <DatePin dow={session.dow} day={session.dayNumber} large />
        <div className="th-pickup-text">
          <span className="th-pickup-label">{nl ? "Afhalen" : "Pickup"}</span>
          <span className="th-pickup-time th-tn">{session.pickupLabel}</span>
          <span className="th-pickup-where">{nl ? "aan de balie van het Theokot" : "at the Theokot counter"}</span>
        </div>
      </div>

      <div className="th-reservation-body">
        <ul className="th-lines">
          {existing.lines.map((line) => (
            <li key={line.sessionItemId}>
              <span>
                {line.quantity}× {line.name}
              </span>
              <span className="th-tn">{formatEuro(line.quantity * line.unitPriceCents)}</span>
            </li>
          ))}
        </ul>
        <div className="th-total">
          <span>
            {existing.status === "RESERVED"
              ? nl
                ? "Te betalen aan de balie"
                : "To pay at the counter"
              : nl
                ? "Totaal"
                : "Total"}
          </span>
          <span className="th-tn">{formatEuro(existing.totalCents)}</span>
        </div>
      </div>

      {(existing.canCancel || canEdit) && (
        <div className="th-reservation-actions">
          <div className="th-reservation-buttons">
            {canEdit && (
              <button type="button" className="th-btn th-btn-primary" onClick={order.startEditing} disabled={order.pending}>
                {nl ? "Aanpassen" : "Change"}
              </button>
            )}
            {existing.canCancel && (
              <button
                type="button"
                className="th-btn th-btn-ghost"
                onClick={() => setConfirming(true)}
                disabled={order.pending}
              >
                {nl ? "Annuleren" : "Cancel"}
              </button>
            )}
          </div>
          <p className="th-fine">
            {nl ? `Kan tot ${session.orderCloseShort}.` : `Possible until ${session.orderCloseShort}.`}
          </p>
        </div>
      )}
      {order.error && (
        <p className="th-error" role="alert">
          {order.error}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title={nl ? "Reservatie annuleren?" : "Cancel reservation?"}
        description={
          nl
            ? `Je reservatie voor ${session.dateLabel} (${count} ${count === 1 ? "broodje" : "broodjes"}) verdwijnt en de broodjes gaan terug naar de voorraad. Bedenk je je, dan bestel je opnieuw zolang er nog zijn.`
            : `Your reservation for ${session.dateLabel} (${count} ${count === 1 ? "sandwich" : "sandwiches"}) is removed and the sandwiches go back into stock. If you change your mind, order again while there are some left.`
        }
        confirmLabel={nl ? "Reservatie annuleren" : "Cancel reservation"}
        cancelLabel={nl ? "Behouden" : "Keep it"}
        pending={order.pending}
        onConfirm={() => order.cancel(() => setConfirming(false))}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

/** Het totaal en de knop in één balk: onder het raster, en op gsm onder de lijst. */
function OrderBar({
  nl,
  session,
  order,
  limits,
  className = "",
}: {
  nl: boolean;
  session: OrderSession;
  order: DayOrder;
  limits: Limits;
  className?: string;
}) {
  const { totals } = order;
  return (
    <div className={`th-bar ${className}`}>
      <div className="th-bar-text">
        <span className="th-bar-kicker">{capitalize(session.weekdayLabel)}</span>
        <span className="th-tn">
          {totals.count} {nl ? "van" : "of"} {limits.maxItems} {nl ? "broodjes" : "sandwiches"}
        </span>
      </div>
      <span className="th-bar-total th-tn">{formatEuro(totals.cents)}</span>
      {order.editing && (
        <button type="button" className="th-btn th-btn-ghost" onClick={order.stopEditing} disabled={order.pending}>
          {nl ? "Niet aanpassen" : "Keep as is"}
        </button>
      )}
      <SubmitButton nl={nl} session={session} order={order} limits={limits} short />
      {order.error && (
        <p className="th-error th-bar-error" role="alert">
          {order.error}
        </p>
      )}
    </div>
  );
}

function SubmitButton({
  nl,
  session,
  order,
  limits,
  className = "",
  short = false,
}: {
  nl: boolean;
  session: OrderSession;
  order: DayOrder;
  limits: Limits;
  className?: string;
  /** In een smalle balk volstaat "Reserveren"; de dag staat er al naast. */
  short?: boolean;
}) {
  const { totals } = order;
  const blocked =
    order.pending ||
    totals.count === 0 ||
    totals.count > limits.maxItems ||
    totals.weekly > limits.maxWeeklySpecial;
  const label = order.pending
    ? nl
      ? "Bezig..."
      : "Saving..."
    : order.editing
      ? nl
        ? "Wijziging opslaan"
        : "Save changes"
      : short
        ? nl
          ? "Reserveren"
          : "Reserve"
        : nl
          ? `Reserveer voor ${session.weekdayLabel}`
          : `Reserve for ${session.weekdayLabel}`;
  return (
    <button type="button" className={`th-btn th-btn-primary ${className}`} onClick={order.submit} disabled={blocked}>
      {label}
    </button>
  );
}

function Stepper({
  nl,
  item,
  quantity,
  atMax,
  onChange,
}: {
  nl: boolean;
  item: OrderItem;
  quantity: number;
  /** Het maximum is bereikt: enkel minder kan nog. */
  atMax: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <div className="th-stepper">
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 0}
        aria-label={nl ? `Eén ${item.name} minder` : `One ${item.name} less`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span className={`th-tn${quantity > 0 ? " is-set" : ""}`}>{quantity}</span>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= item.remaining || atMax}
        aria-label={nl ? `Eén ${item.name} meer` : `One more ${item.name}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

function StockPill({ nl, remaining }: { nl: boolean; remaining: number }) {
  if (remaining <= 0) return <span className="th-stock is-out">{nl ? "uitverkocht" : "sold out"}</span>;
  if (remaining > LOW_STOCK) return null;
  return <span className="th-stock">{nl ? `nog ${remaining}` : `${remaining} left`}</span>;
}

function SpecialLabel({ nl }: { nl: boolean }) {
  return (
    <span className="th-special">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--yellow)" stroke="var(--coin-rim)" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z" />
      </svg>
      {nl ? "Broodje van de week" : "Sandwich of the week"}
    </span>
  );
}

function InfoButton({
  nl,
  name,
  open,
  controls,
  onToggle,
}: {
  nl: boolean;
  name: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="th-info" onClick={onToggle} aria-expanded={open} aria-controls={controls}>
      <span aria-hidden="true">i</span>
      <span className="sr-only">{nl ? `Ingrediënten van ${name}` : `Ingredients of ${name}`}</span>
    </button>
  );
}

function DatePin({ dow, day, large = false }: { dow: string; day: string; large?: boolean }) {
  return (
    <span className={`th-pin${large ? " is-large" : ""}`} aria-hidden="true">
      <span className="th-pin-dow">{dow}</span>
      <span className="th-pin-day th-tn">{day}</span>
    </span>
  );
}

/** De foto van een broodje; zonder foto het gestreepte patroon van de site. */
function Thumb({ item, className, sizes }: { item: OrderItem; className: string; sizes: string }) {
  return (
    <div className={`th-photo ${className}`}>
      {item.imageUrl && <Image src={item.imageUrl} alt="" fill sizes={sizes} className="object-cover" />}
    </div>
  );
}
