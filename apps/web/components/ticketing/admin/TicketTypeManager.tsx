"use client";

import { audienceSelectOptions } from "./AudienceOptions";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { poolSellableCapacity, poolTaken } from "@/lib/ticketing/seats";
import {
  ticketAudienceFrom,
  ticketAudienceHelp,
  ticketAudienceLabel,
  type TicketAudience,
} from "@/lib/ticketing/audience";
import { useRef, useState, useTransition } from "react";
import {
  archiveTicketTypeAction,
  createInventoryPoolAction,
  createTicketTypeAction,
  deleteInventoryPoolAction,
  deleteTicketTypeAction,
  reorderTicketTypesAction,
  saveTicketTypeAction,
  updateInventoryPoolAction,
} from "@/app/actions/tickets";
import {
  Archive,
  Package,
  Plus,
  Ticket,
  Trash2,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { SaveForm } from "@/components/ui/SaveForm";
import { DangerActionButton } from "./DangerActionButton";
import { ticketColorKey, ticketColorLabel } from "@/lib/ticketing/ticketColors";
import { TicketColorChoice } from "./TicketColorChoice";
import { formatMoney, toDatetimeLocal, type AdminLocale } from "./format";
import { SettingsPanel } from "./SettingsPanel";
import { formatNonMemberDelay, NonMemberDelayInput } from "./NonMemberDelayInput";

type InventoryPool = {
  id: string;
  code: string;
  nameNl: string;
  nameEn: string | null;
  capacity: number;
  reservedCount: number;
  soldCount: number;
  memberCapacity: number | null;
  nonMemberCapacity: number | null;
  memberReservedCount: number;
  memberSoldCount: number;
  active: boolean;
  _count?: { ticketTypes: number; orderItems: number };
};

const poolErrorMessages = (nl: boolean): Record<string, string> => ({
  NAME_REQUIRED: nl ? "Niet opgeslagen: geef deze plaatsen een naam." : "Not saved: give these places a name.",
  INVALID_CAPACITY: nl
    ? "Niet opgeslagen: het aantal plaatsen moet een geheel getal zijn."
    : "Not saved: the number of places must be a whole number.",
  CAPACITY_BELOW_ALLOCATED: nl
    ? "Niet opgeslagen: er zijn al meer plaatsen verkocht of gereserveerd dan dat aantal."
    : "Not saved: more places have already been sold or reserved than that number.",
  INVALID_SEAT_CAPS: nl
    ? "Niet opgeslagen: het maximum voor leden of niet-leden ligt tussen 0 en het aantal plaatsen."
    : "Not saved: the maximum for members or non-members lies between 0 and the number of places.",
  POOL_NOT_FOUND: nl ? "Niet opgeslagen: deze plaatsen bestaan niet meer." : "Not saved: these places no longer exist.",
});

/**
 * Het vinkje "apart maximum voor leden en niet-leden" met de twee velden die
 * het opent. Uit stuurt de server "geen plafond", ook als er nog een getal
 * stond: wat je niet ziet, hoort niet mee te tellen.
 */
function SeatCapsFields({
  idPrefix,
  pool,
  locale,
}: {
  idPrefix: string;
  pool?: Pick<InventoryPool, "capacity" | "memberCapacity" | "nonMemberCapacity">;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(
    pool ? pool.memberCapacity !== null || pool.nonMemberCapacity !== null : false
  );
  return (
    <>
      <label className="ticket-admin-check" htmlFor={`${idPrefix}-caps`} data-span="2">
        <input type="hidden" name="seatCaps" value="false" />
        <input
          id={`${idPrefix}-caps`}
          type="checkbox"
          name="seatCaps"
          value="true"
          checked={open}
          onChange={(changed) => setOpen(changed.target.checked)}
        />
        {nl ? "Apart maximum voor leden en niet-leden" : "Separate maximum for members and non-members"}
      </label>
      {open ? (
        <>
          <div className="ticket-admin-field">
            <label htmlFor={`${idPrefix}-members`}>{nl ? "Hoogstens voor leden" : "At most for members"}</label>
            <input
              id={`${idPrefix}-members`}
              name="memberCapacity"
              type="number"
              min="0"
              defaultValue={pool?.memberCapacity ?? ""}
              placeholder={nl ? "geen grens" : "no limit"}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`${idPrefix}-nonmembers`}>
              {nl ? "Hoogstens voor niet-leden" : "At most for non-members"}
            </label>
            <input
              id={`${idPrefix}-nonmembers`}
              name="nonMemberCapacity"
              type="number"
              min="0"
              defaultValue={pool?.nonMemberCapacity ?? ""}
              placeholder={nl ? "geen grens" : "no limit"}
            />
          </div>
          <span className="ticket-admin-help" data-span="2">
            {nl
              ? "Leeg is geen eigen grens. Een ticket telt voor leden wanneer een lid het koopt, behalve aan de gewone prijs van een ticket met ledenprijs: dat is voor een niet-lid. Een grens onder wat al verkocht is, stopt enkel de verdere verkoop aan die groep."
              : "Empty means no separate limit. A ticket counts for members when a member buys it, except at the regular price of a ticket with a member price: that one is for a non-member. A limit below what has been sold only stops further sales to that group."}
          </span>
        </>
      ) : null}
    </>
  );
}

/** "32 leden · 8 niet-leden (hoogstens 20)", voor onder de voortgangsbalk. */
function seatSplit(pool: InventoryPool, locale: AdminLocale): string | null {
  const nl = locale === "nl";
  const taken = poolTaken(pool);
  const hasCaps = pool.memberCapacity !== null || pool.nonMemberCapacity !== null;
  if (!hasCaps) return null;
  const part = (count: number, cap: number | null, word: string) =>
    `${count} ${word}${cap === null ? "" : ` ${nl ? "van hoogstens" : "of at most"} ${cap}`}`;
  return [
    part(taken.member, pool.memberCapacity, nl ? "leden" : "members"),
    part(taken.nonMember, pool.nonMemberCapacity, nl ? "niet-leden" : "non-members"),
  ].join(" · ");
}

type TicketType = {
  id: string;
  code: string;
  nameNl: string;
  nameEn: string | null;
  unitPriceCents: number;
  memberPriceCents: number | null;
  honoraryPriceCents: number | null;
  nonMemberDelayMinutes: number | null;
  currency: string;
  audience: string;
  color: string;
  minPerOrder: number;
  maxPerOrder: number;
  salesStartAt: Date | null;
  salesEndAt: Date | null;
  active: boolean;
  inventoryPool: InventoryPool;
  _count?: { orderItems: number; questions: number };
};

/** De meldingen voor de wachttijd voor niet-leden en de ereledenprijs, bij aanmaken en bewerken. */
function delayAndHonoraryErrors(locale: AdminLocale, prefixNl: string, prefixEn: string) {
  const nl = locale === "nl";
  return {
    HONORARY_PRICE_TOO_HIGH: nl
      ? `${prefixNl}: de ereledenprijs mag niet hoger zijn dan de gewone prijs.`
      : `${prefixEn}: the honorary member price cannot be higher than the regular price.`,
    INVALID_NON_MEMBER_DELAY: nl
      ? `${prefixNl}: de wachttijd voor niet-leden is hoogstens 30 dagen, in hele uren en minuten.`
      : `${prefixEn}: the wait for non-members is at most 30 days, in whole hours and minutes.`,
    NON_MEMBER_DELAY_NEEDS_START: nl
      ? `${prefixNl}: niet-leden later laten kopen vraagt een verkoopstart, bij dit ticket of bij het event.`
      : `${prefixEn}: letting non-members buy later needs a sales start, on this ticket or on the event.`,
  };
}

/** " (leden € 14,00, ereleden gratis)", of niets voor een ticket met één prijs. */
function otherPrices(ticketType: TicketType, locale: AdminLocale): string {
  const nl = locale === "nl";
  const parts = [
    ticketType.audience === "PUBLIC" && ticketType.memberPriceCents != null
      ? `${nl ? "leden" : "members"} ${formatMoney(ticketType.memberPriceCents, ticketType.currency, locale)}`
      : null,
    ticketType.honoraryPriceCents != null
      ? `${nl ? "ereleden" : "honorary"} ${
          ticketType.honoraryPriceCents === 0
            ? nl ? "gratis" : "free"
            : formatMoney(ticketType.honoraryPriceCents, ticketType.currency, locale)
        }`
      : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function audienceLabel(audience: string, locale: AdminLocale): string {
  if (audience === "PUBLIC") return locale === "nl" ? "Publiek" : "Public";
  return ticketAudienceLabel(audience, locale);
}

/**
 * De optionele ledenprijs. Enkel bij "leden en niet-leden": een ticket dat al
 * alleen voor leden is, heeft geen gewone prijs om naast te staan. Uitgezet
 * wordt het veld niet meegestuurd, en de server wist de ledenprijs dan.
 */
function MemberPriceField({
  id,
  audience,
  defaultCents,
  currency,
  locale,
}: {
  id: string;
  audience: TicketAudience;
  defaultCents?: number | null;
  currency: string;
  locale: AdminLocale;
}) {
  const applies = audience === "PUBLIC";
  return (
    <div className="ticket-admin-field">
      <label htmlFor={id}>
        {locale === "nl" ? `Ledenprijs (${currency}, optioneel)` : `Member price (${currency}, optional)`}
      </label>
      <input
        id={id}
        name="memberPrice"
        type="number"
        min="0"
        step="0.01"
        defaultValue={defaultCents == null ? "" : (defaultCents / 100).toFixed(2)}
        disabled={!applies}
      />
      <span className="ticket-admin-help">
        {applies
          ? locale === "nl"
            ? "Leeg laten voor één prijs. Vul je ze in, dan zien leden twee prijzen en kunnen ze beide kopen; niet-leden zien enkel de gewone prijs."
            : "Leave empty for a single price. Fill it in and members see both prices and can buy either; non-members only see the regular price."
          : locale === "nl"
            ? "Enkel bij “leden en niet-leden”: dit ticket heeft maar één doelgroep."
            : "Only with “members and non-members”: this ticket has a single audience."}
      </span>
    </div>
  );
}

/**
 * De ereledenprijs: een vinkje, standaard uit, zoals het "Gratis voor ereleden"
 * dat ze vervangt. Aangevinkt staat de prijs op 0 (gratis), en die kan hoger.
 * De hidden input stuurt "uit" mee wanneer het vinkje leeg is, en dan wist de
 * server de prijs.
 */
function HonoraryPriceField({
  id,
  defaultCents,
  currency,
  locale,
}: {
  id: string;
  defaultCents?: number | null;
  currency: string;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const [on, setOn] = useState(defaultCents != null);
  return (
    <div className="ticket-admin-field" data-span="2">
      <label className="ticket-admin-check" htmlFor={`${id}-on`}>
        <input type="hidden" name="honoraryPriceOn" value={on ? "true" : "false"} />
        <input
          id={`${id}-on`}
          type="checkbox"
          checked={on}
          onChange={(changed) => setOn(changed.target.checked)}
        />
        {nl ? "Ereledenprijs" : "Honorary member price"}
      </label>
      {on ? (
        <>
          <label htmlFor={id}>{nl ? `Prijs voor een erelid (${currency})` : `Price for an honorary member (${currency})`}</label>
          <input
            id={id}
            className="ticket-admin-honorary-price"
            name="honoraryPrice"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={((defaultCents ?? 0) / 100).toFixed(2)}
          />
        </>
      ) : null}
      <span className="ticket-admin-help">
        {nl
          ? "Een erelid ziet dit ticket dan ook aan deze prijs, naast de gewone prijs: standaard gratis, maar je kan ze verhogen tot de gewone prijs. Hoogstens één per erelid voor dit event, over al zijn bestellingen heen; voor iedereen anders bestaat de prijs niet."
          : "An honorary member then also sees this ticket at this price, next to the regular price: free by default, but you can raise it up to the regular price. At most one per honorary member for this event, across all their orders; for everyone else the price does not exist."}
      </span>
    </div>
  );
}

/** "di 14 okt. 20:00" uit een `datetime-local`-waarde of een datum, of null. */
function formatLocalMoment(value: string | Date | null, locale: AdminLocale): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Niet-leden pas later: hoeveel na de verkoopstart van dit ticket de plaatsen
 * voor niet-leden te koop gaan. Enkel bij "leden en niet-leden"; uitgezet
 * stuurt het veld niets mee en wist de server de wachttijd.
 *
 * Onder de vakjes staat de uitkomst in klokuren, net als bij de voorverkoop:
 * "2 uur na de leden" zegt niets zolang je zelf moet optellen, en net in dat
 * getal blijft een misklik zitten.
 */
function NonMemberDelayField({
  idPrefix,
  audience,
  defaultMinutes,
  salesStartLocal,
  eventSalesStartAt,
  locale,
}: {
  idPrefix: string;
  audience: TicketAudience;
  defaultMinutes?: number | null;
  /** Wat er nu in "Verkoop start" van dit ticket staat; leeg volgt het event. */
  salesStartLocal: string;
  eventSalesStartAt: Date | null;
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const applies = audience === "PUBLIC";
  const [minutes, setMinutes] = useState<number | null>(defaultMinutes ?? null);
  const start = salesStartLocal ? new Date(salesStartLocal) : eventSalesStartAt;
  const memberMoment = formatLocalMoment(start, locale);
  const nonMemberMoment =
    start && minutes ? formatLocalMoment(new Date(start.getTime() + minutes * 60_000), locale) : null;

  return (
    <div className="ticket-admin-field" data-span="2">
      <label htmlFor={`${idPrefix}-hours`}>
        {nl ? "Verkoop voor niet-leden (optioneel)" : "Sales for non-members (optional)"}
      </label>
      {applies ? <input type="hidden" name="nonMemberDelayMinutes" value={minutes ?? ""} /> : null}
      <NonMemberDelayInput
        idPrefix={idPrefix}
        minutes={defaultMinutes}
        onChange={setMinutes}
        disabled={!applies}
        locale={locale}
      />
      <span className="ticket-admin-help">
        {!applies
          ? nl
            ? "Enkel bij “leden en niet-leden”: dit ticket heeft maar één doelgroep."
            : "Only with “members and non-members”: this ticket has a single audience."
          : !minutes
            ? nl
              ? "Leeg: leden en niet-leden kunnen tegelijk kopen."
              : "Empty: members and non-members can buy at the same time."
            : !start
              ? nl
                ? "Vul een verkoopstart in, bij dit ticket of bij het event: zonder start staat de verkoop al voor iedereen open."
                : "Set a sales start, on this ticket or on the event: without one, sales are already open to everyone."
              : nl
                ? `Leden kopen vanaf ${memberMoment}, niet-leden vanaf ${nonMemberMoment}. Wie in de voorverkoop zit, wacht niet. Bij een ledenprijs wacht ook de gewone prijs, die een lid voor een vriend koopt.`
                : `Members buy from ${memberMoment}, non-members from ${nonMemberMoment}. Whoever is in the presale does not wait. With a member price, the regular price a member buys for a friend waits too.`}
      </span>
    </div>
  );
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
 * Alles van het tickettype is hier te wijzigen, ook nadat het event
 * gepubliceerd is en er al besteld is. Wat verkocht is verandert niet mee (een
 * bestelregel bewaart zijn eigen naam en prijs), dus een correctie geldt voor
 * wat er daarna besteld wordt. Eerder stonden naam, prijs en verkoopvenster
 * vast vanaf het aanmaken, en dan was een typfout in de prijs of in "maximum
 * per bestelling" enkel recht te zetten door het type te archiveren en opnieuw
 * aan te maken.
 *
 * De hulpteksten reageren live op de gekozen doelgroep, want het gevolg (het
 * type verdwijnt uit de shop van een uitgelogde bezoeker) is niet af te lezen
 * aan de keuze zelf.
 */
function TicketTypeEditPanel({
  eventId,
  ticketType,
  pools,
  guestBuyableElsewhere,
  eventSalesStartAt,
  locale,
}: {
  eventId: string;
  ticketType: TicketType;
  pools: InventoryPool[];
  guestBuyableElsewhere: boolean;
  eventSalesStartAt: Date | null;
  locale: AdminLocale;
}) {
  const [audience, setAudience] = useState<TicketAudience>(ticketAudienceFrom(ticketType.audience));
  const [salesStartLocal, setSalesStartLocal] = useState(toDatetimeLocal(ticketType.salesStartAt));
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
            INVALID_ORDER_LIMITS:
              locale === "nl"
                ? "Het maximum per bestelling mag niet onder het minimum liggen."
                : "The maximum per order cannot be below the minimum.",
            INVALID_SALES_DATES:
              locale === "nl"
                ? "Het einde van de verkoop moet na de start liggen."
                : "Sales must end after they start.",
            INVALID_AMOUNT:
              locale === "nl" ? "Vul een geldige prijs in." : "Enter a valid price.",
            MEMBER_PRICE_NOT_LOWER:
              locale === "nl"
                ? "Niet opgeslagen: de ledenprijs moet lager zijn dan de gewone prijs."
                : "Not saved: the member price must be lower than the regular price.",
            ...delayAndHonoraryErrors(locale, "Niet opgeslagen", "Not saved"),
            POOL_NOT_FOUND:
              locale === "nl"
                ? "Niet opgeslagen: de gekozen plaatsen bestaan niet meer."
                : "Not saved: the chosen places no longer exist.",
          }}
          fallbackErrorMessage={
            locale === "nl" ? "Tickettype niet opgeslagen." : "Ticket type was not saved."
          }
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="ticketTypeId" value={ticketType.id} />
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-name-nl`}>Naam (NL)</label>
              <input
                id={`ticket-type-${ticketType.id}-name-nl`}
                name="nameNl"
                defaultValue={ticketType.nameNl}
                required
              />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-name-en`}>Naam (EN)</label>
              <input
                id={`ticket-type-${ticketType.id}-name-en`}
                name="nameEn"
                defaultValue={ticketType.nameEn ?? ""}
              />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-price`}>
                {locale === "nl"
                  ? `Prijs per ticket (${ticketType.currency})`
                  : `Price per ticket (${ticketType.currency})`}
              </label>
              <input
                id={`ticket-type-${ticketType.id}-price`}
                name="unitPrice"
                type="number"
                min="0"
                step="0.01"
                defaultValue={(ticketType.unitPriceCents / 100).toFixed(2)}
                required
              />
              {orderedTickets > 0 ? (
                <span className="ticket-admin-help">
                  {locale === "nl"
                    ? "De al verkochte tickets houden de prijs van toen."
                    : "Tickets already sold keep the price of that moment."}
                </span>
              ) : null}
            </div>
            <MemberPriceField
              id={`ticket-type-${ticketType.id}-member-price`}
              audience={audience}
              defaultCents={ticketType.memberPriceCents}
              currency={ticketType.currency}
              locale={locale}
            />
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-min`}>
                {locale === "nl" ? "Minimum per bestelling" : "Minimum per order"}
              </label>
              <input
                id={`ticket-type-${ticketType.id}-min`}
                name="minPerOrder"
                type="number"
                min="1"
                max="50"
                defaultValue={ticketType.minPerOrder}
                required
              />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-max`}>
                {locale === "nl" ? "Maximum per bestelling" : "Maximum per order"}
              </label>
              <input
                id={`ticket-type-${ticketType.id}-max`}
                name="maxPerOrder"
                type="number"
                min="1"
                max="50"
                defaultValue={ticketType.maxPerOrder}
                required
              />
            </div>
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-sales-start`}>
                {locale === "nl" ? "Verkoop start" : "Sales start"}
              </label>
              <input
                id={`ticket-type-${ticketType.id}-sales-start`}
                name="salesStartAt"
                type="datetime-local"
                value={salesStartLocal}
                onChange={(changed) => setSalesStartLocal(changed.target.value)}
              />
              <span className="ticket-admin-help">
                {locale === "nl"
                  ? "Leeg laten volgt het verkoopvenster van het event."
                  : "Leave empty to follow the event's sales window."}
              </span>
            </div>
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-sales-end`}>
                {locale === "nl" ? "Verkoop einde" : "Sales end"}
              </label>
              <input
                id={`ticket-type-${ticketType.id}-sales-end`}
                name="salesEndAt"
                type="datetime-local"
                defaultValue={toDatetimeLocal(ticketType.salesEndAt)}
              />
            </div>
          </div>
          <div className="ticket-admin-field">
            <label htmlFor={`ticket-type-${ticketType.id}-audience`}>
              {locale === "nl" ? "Wie mag dit ticket kopen?" : "Who may buy this ticket?"}
            </label>
            <ThemedSelect
              id={`ticket-type-${ticketType.id}-audience`}
              name="audience"
              options={audienceSelectOptions(locale)}
              value={audience}
              onChange={(value) => setAudience(value as TicketAudience)}
            />
            <span className="ticket-admin-help">{ticketAudienceHelp(audience, locale)}</span>
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
          {pools.length > 1 ? (
            <div className="ticket-admin-field">
              <label htmlFor={`ticket-type-${ticketType.id}-pool`}>
                {locale === "nl" ? "Gaat af van de plaatsen" : "Takes from the places"}
              </label>
              <ThemedSelect
                id={`ticket-type-${ticketType.id}-pool`}
                name="inventoryPoolId"
                options={pools.map((pool) => ({
                  value: pool.id,
                  label: locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl,
                }))}
                defaultValue={ticketType.inventoryPool.id}
              />
              {orderedTickets > 0 ? (
                <span className="ticket-admin-help">
                  {locale === "nl"
                    ? "Wat al besteld is, blijft tellen bij de plaatsen waar het van afging."
                    : "What has been ordered keeps counting against the places it came from."}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="ticket-admin-form-grid">
            <NonMemberDelayField
              idPrefix={`ticket-type-${ticketType.id}-delay`}
              audience={audience}
              defaultMinutes={ticketType.nonMemberDelayMinutes}
              salesStartLocal={salesStartLocal}
              eventSalesStartAt={eventSalesStartAt}
              locale={locale}
            />
            <HonoraryPriceField
              id={`ticket-type-${ticketType.id}-honorary`}
              defaultCents={ticketType.honoraryPriceCents}
              currency={ticketType.currency}
              locale={locale}
            />
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

/**
 * Wat er weg is en wat blijft, in de bevestiging zelf. Enkel de vragen die aan
 * dít type hangen verdwijnen mee; die gelden zonder hun type nergens meer voor.
 */
function deleteTypeDescription(ticketType: TicketType, locale: AdminLocale): string {
  const questions = ticketType._count?.questions ?? 0;
  const name = locale === "en" && ticketType.nameEn ? ticketType.nameEn : ticketType.nameNl;
  if (locale === "nl") {
    return `"${name}" verdwijnt definitief uit dit event. Er is nog niets van besteld, dus er gaan geen tickets of bestellingen verloren.${
      questions === 0
        ? ""
        : ` ${questions === 1 ? "De vraag die enkel aan dit type hangt, verdwijnt" : `De ${questions} vragen die enkel aan dit type hangen, verdwijnen`} mee.`
    } De rest van het event blijft staan.`;
  }
  return `"${name}" is permanently removed from this event. Nothing has been ordered yet, so no tickets or orders are lost.${
    questions === 0
      ? ""
      : ` ${questions === 1 ? "The question that only belongs to this type goes" : `The ${questions} questions that only belong to this type go`} with it.`
  } The rest of the event stays.`;
}

export function TicketTypeManager({
  eventId,
  pools,
  ticketTypes,
  currency,
  eventSalesStartAt,
  locale,
}: {
  eventId: string;
  pools: InventoryPool[];
  ticketTypes: TicketType[];
  currency: string;
  /** De verkoopstart van het event: daar telt de wachttijd voor niet-leden van af. */
  eventSalesStartAt: Date | null;
  locale: AdminLocale;
}) {
  const activePools = pools.filter((pool) => pool.active);
  const [newSalesStartLocal, setNewSalesStartLocal] = useState("");
  const [prevTicketTypes, setPrevTicketTypes] = useState<TicketType[]>(ticketTypes);
  const [items, setItems] = useState<TicketType[]>(ticketTypes);
  const [, startTransition] = useTransition();
  const [newAudience, setNewAudience] = useState<TicketAudience>("PUBLIC");

  if (ticketTypes !== prevTicketTypes) {
    setPrevTicketTypes(ticketTypes);
    setItems(ticketTypes);
  }

  const hasActiveTicketType = items.some((ticketType) => ticketType.active);
  const nl = locale === "nl";
  const capacity = pools.reduce((sum, pool) => sum + pool.capacity, 0);
  const taken = pools.reduce((sum, pool) => sum + pool.soldCount + pool.reservedCount, 0);
  const places = nl
    ? capacity === 1 ? "plaats" : "plaatsen"
    : capacity === 1 ? "place" : "places";
  const inventoryStatus =
    pools.length === 0
      ? nl ? "Nog geen plaatsen" : "No places yet"
      : `${capacity} ${places}${pools.length > 1 ? ` ${nl ? "in" : "in"} ${pools.length} ${nl ? "delen" : "parts"}` : ""} · ${taken} ${nl ? "bezet" : "taken"}`;
  const activeCount = items.filter((ticketType) => ticketType.active).length;
  const typesStatus = nl
    ? `${activeCount} actief${items.length > activeCount ? ` · ${items.length - activeCount} gearchiveerd` : ""}`
    : `${activeCount} active${items.length > activeCount ? ` · ${items.length - activeCount} archived` : ""}`;

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
      <SettingsPanel
        title={nl ? "Plaatsen" : "Places"}
        status={inventoryStatus}
        icon={<Package aria-hidden="true" size={17} />}
      >
        <p className="ticket-admin-help">
          {pools.length > 1
            ? nl
              ? "Elk ticket gaat af van de plaatsen die erbij gekozen zijn (bij Tickettypes)."
              : "Each ticket takes from the places chosen for it (under Ticket types)."
            : nl
              ? "Alle tickets delen deze plaatsen. Heb je een apart aantal nodig voor bepaalde tickets (bv. proffen naast studenten), voeg dan plaatsen toe en kies ze bij dat ticket."
              : "All tickets share these places. Need a separate number for some tickets (e.g. professors next to students)? Add places and pick them on that ticket."}
        </p>
        {pools.length === 0 ? (
          <div className="ticket-admin-alert">
            {nl
              ? "Er zijn nog geen plaatsen. Voeg ze hieronder toe."
              : "There are no places yet. Add them below."}
          </div>
        ) : (
          <ul className="ticket-admin-list">
            {pools.map((pool) => {
              const occupied = Math.min(pool.capacity, pool.soldCount + pool.reservedCount);
              const percentage = pool.capacity > 0 ? Math.round((occupied / pool.capacity) * 100) : 0;
              const split = seatSplit(pool, locale);
              const sellable = poolSellableCapacity(pool);
              const poolName = locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl;
              const typesInPool = items.filter((ticketType) => ticketType.inventoryPool.id === pool.id);
              const deletable =
                (pool._count?.ticketTypes ?? typesInPool.length) === 0 &&
                (pool._count?.orderItems ?? 1) === 0;
              return (
                <li key={pool.id}>
                  <div className="ticket-admin-row-head">
                    <div>
                      <p className="ticket-admin-row-title">
                        {poolName}
                        {!pool.active ? (
                          <span className="ticket-admin-status" data-tone="neutral">
                            {nl ? "Uit" : "Off"}
                          </span>
                        ) : null}
                      </p>
                      <p className="ticket-admin-row-meta">
                        {typesInPool.length === 0
                          ? nl ? "Nog geen ticket" : "No ticket yet"
                          : typesInPool
                              .map((ticketType) =>
                                locale === "en" && ticketType.nameEn ? ticketType.nameEn : ticketType.nameNl
                              )
                              .join(", ")}
                      </p>
                    </div>
                    <strong>
                      {pool.soldCount} / {pool.capacity}
                    </strong>
                  </div>
                  <div className="ticket-admin-progress" aria-label={`${percentage}%`}>
                    <span style={{ width: `${percentage}%` }} />
                  </div>
                  <p className="ticket-admin-row-meta">
                    {pool.reservedCount} {nl ? "tijdelijk gereserveerd" : "temporarily reserved"}
                    {split ? ` · ${split}` : ""}
                    {sellable < pool.capacity
                      ? nl
                        ? ` · samen maar ${sellable} te verkopen`
                        : ` · only ${sellable} sellable together`
                      : ""}
                  </p>
                  <div className="ticket-admin-row-actions">
                    <details className="ticket-admin-details">
                      <summary className="ticket-admin-pill-summary">
                        {nl ? "Plaatsen aanpassen" : "Edit places"}
                      </summary>
                      <div className="ticket-admin-details-body">
                        <SaveForm
                          action={updateInventoryPoolAction}
                          className="ticket-admin-form"
                          resetOnSuccess={false}
                          submitLabel={nl ? "Plaatsen opslaan" : "Save places"}
                          savingLabel={nl ? "Opslaan" : "Saving"}
                          savedMessage={nl ? "Plaatsen opgeslagen." : "Places saved."}
                          errorMessages={poolErrorMessages(nl)}
                          fallbackErrorMessage={nl ? "Plaatsen niet opgeslagen." : "Places were not saved."}
                        >
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
                              <label htmlFor={`pool-capacity-${pool.id}`}>{nl ? "Aantal plaatsen" : "Number of places"}</label>
                              <input
                                id={`pool-capacity-${pool.id}`}
                                name="capacity"
                                type="number"
                                min={pool.soldCount + pool.reservedCount}
                                defaultValue={pool.capacity}
                                required
                              />
                            </div>
                            <SeatCapsFields idPrefix={`pool-${pool.id}`} pool={pool} locale={locale} />
                          </div>
                          <label className="ticket-admin-check">
                            <input type="hidden" name="active" value="false" />
                            <input type="checkbox" name="active" value="true" defaultChecked={pool.active} />
                            {nl ? "Plaatsen actief" : "Places active"}
                          </label>
                        </SaveForm>
                      </div>
                    </details>
                    {deletable ? (
                      <DangerActionButton
                        action={deleteInventoryPoolAction}
                        fields={{ locale, eventId, poolId: pool.id }}
                        label={nl ? "Verwijderen" : "Delete"}
                        icon={<Trash2 aria-hidden="true" size={15} />}
                        title={nl ? "Plaatsen verwijderen?" : "Delete places?"}
                        description={
                          nl
                            ? `"${poolName}" (${pool.capacity} plaatsen) verdwijnt uit dit event. Er hangt geen ticket aan en er is nooit uit besteld, dus er gaat niets verloren. De andere plaatsen en tickets blijven staan.`
                            : `"${poolName}" (${pool.capacity} places) is removed from this event. No ticket uses it and nothing was ever ordered from it, so nothing is lost. The other places and tickets stay.`
                        }
                        confirmLabel={nl ? "Verwijderen" : "Delete"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Plaatsen verwijderd." : "Places deleted."}
                        errorMessages={{
                          POOL_HAS_TICKET_TYPES: nl
                            ? "Niet verwijderd: er hangt intussen een ticket aan. Kies bij dat ticket eerst andere plaatsen."
                            : "Not deleted: a ticket uses these places now. Pick other places on that ticket first.",
                          POOL_HAS_ORDERS: nl
                            ? "Niet verwijderd: er is al uit deze plaatsen besteld."
                            : "Not deleted: tickets have been ordered from these places.",
                          POOL_NOT_FOUND: nl ? "Deze plaatsen bestaan niet meer." : "These places no longer exist.",
                        }}
                        fallbackErrorMessage={nl ? "Plaatsen niet verwijderd." : "Places were not deleted."}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="ticket-admin-add-type-wrap">
          <details className="ticket-admin-details" open={pools.length === 0}>
            <summary className="ticket-admin-pill-summary">
              {nl ? "Plaatsen toevoegen" : "Add places"}
            </summary>
            <div className="ticket-admin-details-body">
              <SaveForm
                action={createInventoryPoolAction}
                className="ticket-admin-form"
                submitLabel={nl ? "Plaatsen toevoegen" : "Add places"}
                savingLabel={nl ? "Toevoegen" : "Adding"}
                savedMessage={
                  nl
                    ? "Plaatsen toegevoegd. Kies ze bij een ticket onder Tickettypes."
                    : "Places added. Pick them on a ticket under Ticket types."
                }
                errorMessages={poolErrorMessages(nl)}
                fallbackErrorMessage={nl ? "Plaatsen niet toegevoegd." : "Places were not added."}
              >
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="eventId" value={eventId} />
                <div className="ticket-admin-form-grid">
                  <div className="ticket-admin-field">
                    <label htmlFor="pool-new-name-nl">Naam (NL)</label>
                    <input id="pool-new-name-nl" name="nameNl" placeholder={nl ? "Proffen" : "Professors"} required />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="pool-new-name-en">Naam (EN)</label>
                    <input id="pool-new-name-en" name="nameEn" />
                  </div>
                  <div className="ticket-admin-field">
                    <label htmlFor="pool-new-capacity">{nl ? "Aantal plaatsen" : "Number of places"}</label>
                    <input id="pool-new-capacity" name="capacity" type="number" min="1" required />
                  </div>
                  <SeatCapsFields idPrefix="pool-new" locale={locale} />
                </div>
              </SaveForm>
            </div>
          </details>
        </div>
      </SettingsPanel>

      <SettingsPanel
        id="tickettype-aanmaken"
        title={locale === "nl" ? "Tickettypes" : "Ticket types"}
        status={typesStatus}
        icon={<Ticket aria-hidden="true" size={17} />}
        defaultOpen
      >
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
                        {formatMoney(ticketType.unitPriceCents, ticketType.currency, locale)}
                        {otherPrices(ticketType, locale)}{" "}
                        {pools.length > 1 ? ` · ${ticketType.inventoryPool.nameNl}` : ""} · {audienceLabel(ticketType.audience, locale)}
                        {ticketType.audience === "PUBLIC" && ticketType.nonMemberDelayMinutes
                          ? ` · ${locale === "nl" ? "niet-leden" : "non-members"} ${formatNonMemberDelay(ticketType.nonMemberDelayMinutes, locale)} later`
                          : ""}
                      </p>
                      <p className="ticket-admin-row-meta ticket-admin-inline-meta">
                        <UsersRound aria-hidden="true" size={13} />
                        {ticketType._count?.orderItems ?? 0} {locale === "nl" ? "bestelde tickets" : "ordered tickets"}
                        <span className="ticket-admin-code">{ticketType.code}</span>
                      </p>
                    </div>
                  </div>
                  {/* Twee verschillende dingen, allebei beschikbaar zolang ze
                      kunnen: archiveren haalt het type uit de verkoop en laat
                      het staan, verwijderen gooit het weg. Dat laatste kan enkel
                      zolang er niets van besteld is, want een verkocht ticket
                      blijft naar zijn type wijzen. */}
                  <div className="ticket-admin-row-actions">
                    {ticketType.active ? (
                      <form action={archiveTicketTypeAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="eventId" value={eventId} />
                        <input type="hidden" name="ticketTypeId" value={ticketType.id} />
                        <button className="ticket-admin-button" data-variant="danger" type="submit">
                          <Archive aria-hidden="true" size={15} />
                          {nl ? "Archiveren" : "Archive"}
                        </button>
                      </form>
                    ) : (
                      <span className="ticket-admin-status" data-tone="neutral">
                        {nl ? "Gearchiveerd" : "Archived"}
                      </span>
                    )}
                    {(ticketType._count?.orderItems ?? 0) === 0 ? (
                      <DangerActionButton
                        action={deleteTicketTypeAction}
                        fields={{ locale, eventId, ticketTypeId: ticketType.id }}
                        label={nl ? "Verwijderen" : "Delete"}
                        icon={<Trash2 aria-hidden="true" size={15} />}
                        title={nl ? "Tickettype verwijderen?" : "Delete ticket type?"}
                        description={deleteTypeDescription(ticketType, locale)}
                        confirmLabel={nl ? "Verwijderen" : "Delete"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Tickettype verwijderd." : "Ticket type deleted."}
                        errorMessages={{
                          TICKET_TYPE_HAS_ORDERS: nl
                            ? "Niet verwijderd: er is intussen een ticket van dit type besteld. Archiveer het in de plaats."
                            : "Not deleted: a ticket of this type has been ordered in the meantime. Archive it instead.",
                          TICKET_TYPE_NOT_FOUND: nl
                            ? "Dit tickettype bestaat niet meer."
                            : "This ticket type no longer exists.",
                        }}
                        fallbackErrorMessage={
                          nl ? "Tickettype niet verwijderd." : "Ticket type was not deleted."
                        }
                      />
                    ) : null}
                  </div>
                </div>
                <TicketTypeEditPanel
                  eventId={eventId}
                  ticketType={ticketType}
                  pools={pools}
                  guestBuyableElsewhere={items.some(
                    (other) => other.id !== ticketType.id && guestCanBuy(other)
                  )}
                  eventSalesStartAt={eventSalesStartAt}
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
                  ? "Zet eerst plaatsen aan, of voeg ze toe onder Plaatsen."
                  : "Turn on places first, or add them under Places."}
              </div>
            ) : (
              <SaveForm
                action={createTicketTypeAction}
                className="ticket-admin-form"
                submitLabel={locale === "nl" ? "Tickettype toevoegen" : "Add ticket type"}
                savingLabel={locale === "nl" ? "Toevoegen" : "Adding"}
                savedMessage={locale === "nl" ? "Tickettype toegevoegd." : "Ticket type added."}
                onSuccess={() => {
                  setNewAudience("PUBLIC");
                  setNewSalesStartLocal("");
                }}
                errorMessages={{
                  NAME_REQUIRED:
                    locale === "nl" ? "Niet toegevoegd: vul een naam in." : "Not added: enter a name.",
                  INVALID_AMOUNT:
                    locale === "nl" ? "Niet toegevoegd: vul een geldige prijs in." : "Not added: enter a valid price.",
                  INVALID_ORDER_LIMITS:
                    locale === "nl"
                      ? "Niet toegevoegd: het maximum per bestelling mag niet onder het minimum liggen."
                      : "Not added: the maximum per order cannot be below the minimum.",
                  INVALID_SALES_DATES:
                    locale === "nl"
                      ? "Niet toegevoegd: het einde van de verkoop moet na de start liggen."
                      : "Not added: sales must end after they start.",
                  MEMBER_PRICE_NOT_LOWER:
                    locale === "nl"
                      ? "Niet toegevoegd: de ledenprijs moet lager zijn dan de gewone prijs."
                      : "Not added: the member price must be lower than the regular price.",
                  ...delayAndHonoraryErrors(locale, "Niet toegevoegd", "Not added"),
                }}
                fallbackErrorMessage={
                  locale === "nl" ? "Tickettype niet toegevoegd." : "Ticket type was not added."
                }
              >
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
                  {activePools.length > 1 ? (
                    <div className="ticket-admin-field">
                      <label htmlFor="ticket-type-pool">{nl ? "Gaat af van de plaatsen" : "Takes from the places"}</label>
                      <ThemedSelect
                        id="ticket-type-pool"
                        name="inventoryPoolId"
                        options={activePools.map((pool) => ({
                          value: pool.id,
                          label: locale === "en" && pool.nameEn ? pool.nameEn : pool.nameNl,
                        }))}
                        defaultValue={activePools.at(-1)?.id}
                        required
                      />
                    </div>
                  ) : (
                    <input type="hidden" name="inventoryPoolId" value={activePools[0]?.id ?? ""} />
                  )}
                  <div className="ticket-admin-field">
                    <label htmlFor="ticket-type-price">
                      {locale === "nl" ? `Prijs per ticket (${currency})` : `Price per ticket (${currency})`}
                    </label>
                    <input id="ticket-type-price" name="unitPrice" type="number" min="0" step="0.01" required />
                    <span className="ticket-admin-help">
                      {locale === "nl" ? "Gebruik 0 voor een gratis ticket." : "Use 0 for a free ticket."}
                    </span>
                  </div>
                  <MemberPriceField
                    id="ticket-type-member-price"
                    audience={newAudience}
                    currency={currency}
                    locale={locale}
                  />
                  <div className="ticket-admin-field" data-span="2">
                    <label htmlFor="ticket-type-audience">{locale === "nl" ? "Wie mag dit ticket kopen?" : "Who may buy this ticket?"}</label>
                    <ThemedSelect
                      id="ticket-type-audience"
                      name="audience"
                      options={audienceSelectOptions(locale)}
                      value={newAudience}
                      onChange={(value) => setNewAudience(value as TicketAudience)}
                    />
                    <span className="ticket-admin-help">{ticketAudienceHelp(newAudience, locale)}</span>
                  </div>
                  <div className="ticket-admin-field" data-span="2">
                    <TicketColorChoice idPrefix="ticket-type-new" locale={locale} />
                  </div>
                  <NonMemberDelayField
                    idPrefix="ticket-type-new-delay"
                    audience={newAudience}
                    salesStartLocal={newSalesStartLocal}
                    eventSalesStartAt={eventSalesStartAt}
                    locale={locale}
                  />
                  <HonoraryPriceField id="ticket-type-new-honorary" currency={currency} locale={locale} />
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
                    <input
                      id="ticket-type-sales-start"
                      name="salesStartAt"
                      type="datetime-local"
                      value={newSalesStartLocal}
                      onChange={(changed) => setNewSalesStartLocal(changed.target.value)}
                    />
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
              </SaveForm>
            )}
          </div>
        </details>
        </div>
      </SettingsPanel>
    </>
  );
}
