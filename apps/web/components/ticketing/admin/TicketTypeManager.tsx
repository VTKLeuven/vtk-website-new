"use client";

import { useRef, useState, useTransition } from "react";
import {
  archiveTicketTypeAction,
  createTicketTypeAction,
  reorderTicketTypesAction,
  saveTicketTypeAction,
  updateInventoryPoolAction,
} from "@/app/actions/tickets";
import { Archive, Package, Plus, Save, Ticket, TriangleAlert, UsersRound } from "lucide-react";
import { SaveForm } from "@/components/ui/SaveForm";
import { ticketColorKey, ticketColorLabel } from "@/lib/ticketing/ticketColors";
import { TicketColorChoice } from "./TicketColorChoice";
import { formatMoney, type AdminLocale } from "./format";

type InventoryPool = {
  id: string;
  code: string;
  nameNl: string;
  nameEn: string | null;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  active: boolean;
};

type TicketType = {
  id: string;
  code: string;
  nameNl: string;
  nameEn: string | null;
  unitPriceCents: number;
  currency: string;
  audience: string;
  color: string;
  minPerOrder: number;
  maxPerOrder: number;
  active: boolean;
  inventoryPool: InventoryPool;
  _count?: { orderItems: number };
};

type TicketAudience = "PUBLIC" | "MEMBERS" | "HONORARY";

function audienceLabel(audience: string, locale: AdminLocale): string {
  if (audience === "MEMBERS") return locale === "nl" ? "Alleen leden" : "Members only";
  if (audience === "HONORARY") return locale === "nl" ? "Alleen ereleden" : "Honorary members only";
  return locale === "nl" ? "Publiek" : "Public";
}

/**
 * Kan een bezoeker zonder account dit tickettype kopen?
 *
 * Een gratis ticket vereist altijd een login, ook bij doelgroep "publiek"
 * (`ticketTypeRequiresLogin` in lib/ticketing/audience.ts). Die regel staat hier
 * mee in, want zonder haar zou het beheer een waarschuwing missen die de shop
 * wel toont.
 */
function guestCanBuy(ticketType: TicketType): boolean {
  return ticketType.active && ticketType.audience === "PUBLIC" && ticketType.unitPriceCents > 0;
}

/**
 * Kleur en doelgroep van een bestaand tickettype.
 *
 * Dit is bewust het enige bewerkpaneel per rij: naam, prijs en verkoopvenster
 * blijven staan zoals ze aangemaakt zijn. De hulpteksten reageren live op de
 * gekozen doelgroep, want het gevolg (het type verdwijnt uit de shop van een
 * uitgelogde bezoeker) is niet af te lezen aan de keuze zelf.
 */
function TicketTypeEditPanel({
  eventId,
  ticketType,
  guestBuyableElsewhere,
  locale,
}: {
  eventId: string;
  ticketType: TicketType;
  guestBuyableElsewhere: boolean;
  locale: AdminLocale;
}) {
  const [audience, setAudience] = useState<TicketAudience>(
    ticketType.audience === "MEMBERS" || ticketType.audience === "HONORARY"
      ? ticketType.audience
      : "PUBLIC"
  );
  const orderedTickets = ticketType._count?.orderItems ?? 0;
  const closesShopForGuests = audience !== "PUBLIC" && !guestBuyableElsewhere;
  const freeAndPublic = audience === "PUBLIC" && ticketType.unitPriceCents === 0;

  return (
    <details className="ticket-admin-details">
      <summary className="ticket-admin-pill-summary">
        <span
          className="ticket-admin-color-dot"
          style={{ background: `var(--ticket-color-${ticketColorKey(ticketType.color)})` }}
          aria-hidden="true"
        />
        {locale === "nl" ? "Bewerken" : "Edit"} ({ticketColorLabel(ticketType.color, locale)} ·{" "}
        {audienceLabel(ticketType.audience, locale)})
      </summary>
      <div className="ticket-admin-details-body">
        <SaveForm
          action={saveTicketTypeAction}
          className="ticket-admin-form"
          resetOnSuccess={false}
          submitLabel={locale === "nl" ? "Opslaan" : "Save"}
          savingLabel={locale === "nl" ? "Opslaan" : "Saving"}
          savedMessage={locale === "nl" ? "Tickettype opgeslagen." : "Ticket type saved."}
          errorMessages={{
            TICKET_TYPE_NOT_FOUND:
              locale === "nl"
                ? "Niet opgeslagen: dit tickettype bestaat niet meer."
                : "Not saved: this ticket type no longer exists.",
          }}
          fallbackErrorMessage={
            locale === "nl" ? "Tickettype niet opgeslagen." : "Ticket type was not saved."
          }
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="ticketTypeId" value={ticketType.id} />
          <div className="ticket-admin-field">
            <label htmlFor={`ticket-type-${ticketType.id}-audience`}>
              {locale === "nl" ? "Wie mag dit ticket kopen?" : "Who may buy this ticket?"}
            </label>
            <select
              id={`ticket-type-${ticketType.id}-audience`}
              name="audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value as TicketAudience)}
            >
              <option value="PUBLIC">
                {locale === "nl" ? "Leden en niet-leden" : "Members and non-members"}
              </option>
              <option value="MEMBERS">{locale === "nl" ? "Alleen leden" : "Members only"}</option>
              {/* Onzichtbaar voor iedereen behalve ereleden; niet uitgegrijsd
                  maar echt weggefilterd, zodat de rest van de site die
                  uitzondering niet ziet. */}
              <option value="HONORARY">
                {locale === "nl" ? "Alleen ereleden" : "Honorary members only"}
              </option>
            </select>
            <span className="ticket-admin-help">
              {audience === "PUBLIC"
                ? locale === "nl"
                  ? "Iedereen kan dit ticket kopen, ook zonder account."
                  : "Anyone can buy this ticket, also without an account."
                : audience === "MEMBERS"
                  ? locale === "nl"
                    ? "Enkel wie ingelogd is met een VTK-account ziet dit ticket en kan het kopen."
                    : "Only visitors signed in with a VTK account see this ticket and can buy it."
                  : locale === "nl"
                    ? "Enkel ereleden zien dit ticket; voor alle anderen bestaat het niet."
                    : "Only honorary members see this ticket; for everyone else it does not exist."}
            </span>
            {freeAndPublic || closesShopForGuests ? (
              <div className="ticket-admin-alert">
                <TriangleAlert aria-hidden="true" size={16} />
                <span>
                  {freeAndPublic
                    ? locale === "nl"
                      ? "Dit ticket is gratis, en een gratis ticket vraagt sowieso een login. Zonder account komt een bezoeker er dus niet aan, ook niet bij “leden en niet-leden”."
                      : "This ticket is free, and a free ticket always requires a sign-in. Without an account a visitor cannot get it, not even with “members and non-members”."
                    : locale === "nl"
                      ? "Er blijft dan geen enkel ticket over voor een bezoeker zonder account: de shop toont hem een inlogscherm."
                      : "No ticket then remains for a visitor without an account: the shop shows them a sign-in screen."}
                </span>
              </div>
            ) : null}
            {orderedTickets > 0 ? (
              <span className="ticket-admin-help">
                {locale === "nl"
                  ? `De ${orderedTickets} al bestelde tickets blijven geldig; dit geldt enkel voor nieuwe bestellingen.`
                  : `The ${orderedTickets} tickets already ordered stay valid; this only applies to new orders.`}
              </span>
            ) : null}
          </div>
          <TicketColorChoice
            idPrefix={`ticket-type-${ticketType.id}`}
            value={ticketType.color}
            locale={locale}
          />
        </SaveForm>
      </div>
    </details>
  );
}

export function TicketTypeManager({
  eventId,
  pools,
  ticketTypes,
  currency,
  locale,
}: {
  eventId: string;
  pools: InventoryPool[];
  ticketTypes: TicketType[];
  currency: string;
  locale: AdminLocale;
}) {
  const activePools = pools.filter((pool) => pool.active);
  const [prevTicketTypes, setPrevTicketTypes] = useState<TicketType[]>(ticketTypes);
  const [items, setItems] = useState<TicketType[]>(ticketTypes);
  const [, startTransition] = useTransition();

  if (ticketTypes !== prevTicketTypes) {
    setPrevTicketTypes(ticketTypes);
    setItems(ticketTypes);
  }

  const hasActiveTicketType = items.some((ticketType) => ticketType.active);

  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("eventId", eventId);
      fd.set("locale", locale);
      for (const t of next) fd.append("ids", t.id);
      await reorderTicketTypesAction(fd);
    });
  }

  return (
    <>
      <section className="ticket-admin-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Package aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Voorraad" : "Inventory"}</h2>
            </div>
          </div>
        </div>
        {pools.length === 0 ? (
          <div className="ticket-admin-alert">
            {locale === "nl"
              ? "Er is nog geen voorraadpool. Maak het event opnieuw aan of laat een beheerder de initiële pool toevoegen."
              : "There is no inventory pool yet. Recreate the event or ask an administrator to add the initial pool."}
          </div>
        ) : (
          <ul className="ticket-admin-list">
            {pools.map((pool) => {
              const occupied = Math.min(pool.capacity, pool.soldCount + pool.reservedCount);
              const percentage = pool.capacity > 0 ? Math.round((occupied / pool.capacity) * 100) : 0;
              return (
                <li key={pool.id}>
                  <div className="ticket-admin-row-head">
                    <div>
                      <p className="ticket-admin-row-title">
                        {locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl}
                      </p>
                      <p className="ticket-admin-row-meta ticket-admin-code">{pool.code}</p>
                    </div>
                    <strong>
                      {pool.soldCount} / {pool.capacity}
                    </strong>
                  </div>
                  <div className="ticket-admin-progress" aria-label={`${percentage}%`}>
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <p className="ticket-admin-row-meta">
                    {pool.reservedCount} {locale === "nl" ? "tijdelijk gereserveerd" : "temporarily reserved"}
                  </p>
                  <details className="ticket-admin-details">
                    <summary className="ticket-admin-pill-summary">{locale === "nl" ? "Capaciteit aanpassen" : "Edit capacity"}</summary>
                    <div className="ticket-admin-details-body">
                      <form action={updateInventoryPoolAction} className="ticket-admin-form">
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="poolId" value={pool.id} />
                        <div className="ticket-admin-form-grid">
                          <div className="ticket-admin-field">
                            <label htmlFor={`pool-name-nl-${pool.id}`}>Naam (NL)</label>
                            <input id={`pool-name-nl-${pool.id}`} name="nameNl" defaultValue={pool.nameNl} required />
                          </div>
                          <div className="ticket-admin-field">
                            <label htmlFor={`pool-name-en-${pool.id}`}>Naam (EN)</label>
                            <input id={`pool-name-en-${pool.id}`} name="nameEn" defaultValue={pool.nameEn ?? ""} />
                          </div>
                          <div className="ticket-admin-field">
                            <label htmlFor={`pool-capacity-${pool.id}`}>{locale === "nl" ? "Capaciteit" : "Capacity"}</label>
                            <input
                              id={`pool-capacity-${pool.id}`}
                              name="capacity"
                              type="number"
                              min={pool.soldCount + pool.reservedCount}
                              defaultValue={pool.capacity}
                              required
                            />
                          </div>
                        </div>
                        <label className="ticket-admin-check">
                          <input type="checkbox" name="active" value="true" defaultChecked={pool.active} />
                          <input type="hidden" name="active" value="false" />
                          {locale === "nl" ? "Pool actief" : "Pool active"}
                        </label>
                        <button className="ticket-admin-button" type="submit">
                          <Save aria-hidden="true" size={15} />
                          {locale === "nl" ? "Voorraad opslaan" : "Save inventory"}
                        </button>
                      </form>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="tickettype-aanmaken" className="ticket-admin-section ticket-admin-anchor-section">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon"><Ticket aria-hidden="true" size={17} /></span>
            <div>
            <h2>{locale === "nl" ? "Tickettypes" : "Ticket types"}</h2>
            </div>
          </div>
        </div>
        {!hasActiveTicketType ? (
          <div className="ticket-admin-alert" role="status">
            <span>
              {locale === "nl"
                ? "Stel hieronder een actief tickettype en de prijs per ticket in. Daarna kan je het event publiceren."
                : "Set up an active ticket type and price per ticket below. You can then publish the event."}
            </span>
          </div>
        ) : null}
        {items.length > 0 ? (
          <ul className="ticket-admin-list">
            {items.map((ticketType, index) => (
              <li
                key={ticketType.id}
                draggable
                onDragStart={() => {
                  dragFrom.current = index;
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setOverIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(index);
                }}
                className={`transition-colors rounded-xl ${
                  overIndex === index ? "bg-vtk-yellow/20" : ""
                }`}
              >
                <div className="ticket-admin-row-head">
                  <div className="flex items-start gap-2">
                    <span
                      className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-700 px-1 text-base select-none mt-0.5"
                      title={locale === "nl" ? "Sleep om volgorde te wijzigen" : "Drag to reorder"}
                      aria-hidden="true"
                    >
                      ⠿
                    </span>
                    <div>
                      <p className="ticket-admin-row-title">
                        <span
                          className="ticket-admin-color-dot"
                          style={{ background: `var(--ticket-color-${ticketColorKey(ticketType.color)})` }}
                          aria-hidden="true"
                        />
                        {locale === "en" && ticketType.nameEn ? ticketType.nameEn : ticketType.nameNl}
                      </p>
                      <p className="ticket-admin-row-meta">
                        {formatMoney(ticketType.unitPriceCents, ticketType.currency, locale)} · {ticketType.inventoryPool.nameNl} · {audienceLabel(ticketType.audience, locale)}
                      </p>
                      <p className="ticket-admin-row-meta ticket-admin-inline-meta">
                        <UsersRound aria-hidden="true" size={13} />
                        {ticketType._count?.orderItems ?? 0} {locale === "nl" ? "bestelde tickets" : "ordered tickets"}
                        <span className="ticket-admin-code">{ticketType.code}</span>
                      </p>
                    </div>
                  </div>
                  {ticketType.active ? (
                    <form action={archiveTicketTypeAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="eventId" value={eventId} />
                      <input type="hidden" name="ticketTypeId" value={ticketType.id} />
                      <button className="ticket-admin-button" data-variant="danger" type="submit">
                        <Archive aria-hidden="true" size={15} />
                        {locale === "nl" ? "Archiveren" : "Archive"}
                      </button>
                    </form>
                  ) : (
                    <span className="ticket-admin-status" data-tone="neutral">
                      {locale === "nl" ? "Gearchiveerd" : "Archived"}
                    </span>
                  )}
                </div>
                <TicketTypeEditPanel
                  eventId={eventId}
                  ticketType={ticketType}
                  guestBuyableElsewhere={items.some(
                    (other) => other.id !== ticketType.id && guestCanBuy(other)
                  )}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        ) : null}

        <div className="ticket-admin-add-type-wrap">
          <details className="ticket-admin-details" open={!hasActiveTicketType}>
            <summary className="ticket-admin-pill-summary">
              <Plus aria-hidden="true" size={15} />
              {locale === "nl" ? "Tickettype toevoegen" : "Add ticket type"}
            </summary>
          <div className="ticket-admin-details-body">
            {activePools.length === 0 ? (
              <div className="ticket-admin-alert">
                {locale === "nl"
                  ? "Activeer eerst een voorraadpool."
                  : "Activate an inventory pool first."}
              </div>
            ) : (
              <form action={createTicketTypeAction} className="ticket-admin-form">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="eventId" value={eventId} />
                <div className="ticket-admin-form-grid">
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-name-nl">Naam (NL)</label>
                    <input id="ticket-type-name-nl" name="nameNl" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-name-en">Naam (EN)</label>
                    <input id="ticket-type-name-en" name="nameEn" />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-code">Code</label>
                    <input id="ticket-type-code" name="code" placeholder="STANDARD" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-pool">{locale === "nl" ? "Voorraadpool" : "Inventory pool"}</label>
                    <select id="ticket-type-pool" name="inventoryPoolId" defaultValue={activePools[0]?.id} required>
                      {activePools.map((pool) => (
                        <option key={pool.id} value={pool.id}>
                          {locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-price">
                      {locale === "nl" ? `Prijs per ticket (${currency})` : `Price per ticket (${currency})`}
                    </label>
                    <input id="ticket-type-price" name="unitPrice" type="number" min="0" step="0.01" required />
                    <span className="ticket-admin-help">
                      {locale === "nl" ? "Gebruik 0 voor een gratis ticket." : "Use 0 for a free ticket."}
                    </span>
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-audience">{locale === "nl" ? "Wie mag dit ticket kopen?" : "Who may buy this ticket?"}</label>
                    <select id="ticket-type-audience" name="audience" defaultValue="PUBLIC">
                      <option value="PUBLIC">{locale === "nl" ? "Leden en niet-leden" : "Members and non-members"}</option>
                      <option value="MEMBERS">{locale === "nl" ? "Alleen leden" : "Members only"}</option>
                      {/* Onzichtbaar voor iedereen behalve ereleden; niet
                          uitgegrijsd maar echt weggefilterd, zodat de rest van
                          de site die uitzondering niet ziet. */}
                      <option value="HONORARY">{locale === "nl" ? "Alleen ereleden" : "Honorary members only"}</option>
                    </select>
                  </div>
                  <div className="ticket-admin-field" data-span="2">
                    <TicketColorChoice idPrefix="ticket-type-new" locale={locale} />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-min">{locale === "nl" ? "Minimum per bestelling" : "Minimum per order"}</label>
                    <input id="ticket-type-min" name="minPerOrder" type="number" min="1" defaultValue="1" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-max">{locale === "nl" ? "Maximum per bestelling" : "Maximum per order"}</label>
                    <input id="ticket-type-max" name="maxPerOrder" type="number" min="1" defaultValue="8" required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-sales-start">{locale === "nl" ? "Verkoop start" : "Sales start"}</label>
                    <input id="ticket-type-sales-start" name="salesStartAt" type="datetime-local" />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-sales-end">{locale === "nl" ? "Verkoop einde" : "Sales end"}</label>
                    <input id="ticket-type-sales-end" name="salesEndAt" type="datetime-local" />
                  </div>
                  <div className="ticket-admin-field" data-span="2">
                    <label htmlFor="ticket-type-description-nl">Beschrijving (NL)</label>
                    <textarea id="ticket-type-description-nl" name="descriptionNl" rows={2} />
                  </div>
                  <div className="ticket-admin-field" data-span="2">
                    <label htmlFor="ticket-type-description-en">Beschrijving (EN)</label>
                    <textarea id="ticket-type-description-en" name="descriptionEn" rows={2} />
                  </div>
                </div>
                <button className="ticket-admin-button" data-variant="primary" type="submit">
                  <Plus aria-hidden="true" size={16} />
                  {locale === "nl" ? "Tickettype toevoegen" : "Add ticket type"}
                </button>
              </form>
            )}
          </div>
        </details>
        </div>
      </section>
    </>
  );
}
