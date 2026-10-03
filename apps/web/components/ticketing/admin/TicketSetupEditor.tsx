"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { TICKET_COLORS } from "@/lib/ticketing/ticketColors";
import { poolSellableCapacity } from "@/lib/ticketing/seats";
import {
  blankTicketTemplateType,
  DEFAULT_POOL_CODE,
  formatMinutesBefore,
  templateCode,
  type TicketTemplatePool,
  type TicketTemplateType,
} from "@/lib/ticketing/templates";
import { audienceSelectOptions } from "./AudienceOptions";
import type { AdminLocale } from "./format";

/**
 * De tickets en de plaatsen van een nieuw event, of van een sjabloon.
 *
 * Elk ticket is een kaart met gelabelde velden, geen tabelrij: de tabel die hier
 * stond had zeven kolommen in een kolom van 900 px, waardoor de ledenprijs onder
 * de prijs moest en de code van het ticket als tweede invoerveld onder de naam
 * stond. Die code vraagt het scherm niet meer: ze volgt uit de naam, en een
 * ticket uit een sjabloon houdt de zijne (de vragen van het sjabloon hangen
 * eraan).
 *
 * Onder de tickets staan de plaatsen. Standaard één aantal dat alle tickets
 * delen; wie aparte aantallen nodig heeft (100 voor studenten, 50 voor proffen),
 * voegt plaatsen toe en kiest per ticket waar het van afgaat. Elke pot kan
 * daarnaast een maximum voor leden en een voor niet-leden krijgen. Zie
 * `lib/ticketing/seats.ts` en docs/design-decisions.md.
 *
 * Alles reist als JSON in twee verborgen velden naar de server
 * (`parseTicketSetup`), zoals de shiftsjablonen.
 */

type Row = {
  uid: string;
  /** De code volgt de naam: een nieuw ticket. Een ticket uit een sjabloon houdt zijn code. */
  autoCode: boolean;
  /** Komt uit een sjabloon: dan kan het uitgevinkt worden in plaats van weg. */
  fromTemplate: boolean;
  poolUid: string;
  value: TicketTemplateType;
};

type PoolRow = {
  uid: string;
  autoCode: boolean;
  /** Toont de velden voor leden en niet-leden, ook wanneer ze nog leeg zijn. */
  seatCaps: boolean;
  value: TicketTemplatePool;
};

let sequence = 0;
const nextUid = () => `setup-${(sequence += 1)}`;

/** Codes die uniek blijven: vaste codes eerst, afgeleide krijgen zo nodig `_2`. */
function assignCodes<T>(
  items: T[],
  fixed: (item: T) => string | null,
  derived: (item: T, index: number) => string
): string[] {
  const used = new Set(items.map(fixed).filter((code): code is string => code !== null));
  return items.map((item, index) => {
    const own = fixed(item);
    if (own !== null) return own;
    const base = derived(item, index);
    let code = base;
    for (let n = 2; used.has(code); n += 1) code = `${base}_${n}`;
    used.add(code);
    return code;
  });
}

/** "12,50" of "12.50" naar centen; leeg wordt null. */
function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

function formatAmount(cents: number | null, locale: AdminLocale): string {
  if (cents === null) return "";
  const amount = (cents / 100).toFixed(2);
  return locale === "nl" ? amount.replace(".", ",") : amount;
}

/**
 * Een bedrag dat je gewoon kan intikken. Het veld houdt zijn eigen tekst bij en
 * zet ze pas bij het verlaten netjes ("12" wordt "12,00"); een veld dat bij elke
 * toets herschreven wordt, maakt van "12" tikken "1,002".
 */
function AmountInput({
  id,
  cents,
  onChange,
  optional = false,
  placeholder,
  locale,
}: {
  id: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  optional?: boolean;
  placeholder?: string;
  locale: AdminLocale;
}) {
  const [text, setText] = useState(formatAmount(cents, locale));
  return (
    <div className="ticket-setup-money">
      <span aria-hidden="true">€</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(changed) => {
          setText(changed.target.value);
          const parsed = parseAmount(changed.target.value);
          onChange(parsed === null && !optional ? 0 : parsed);
        }}
        onBlur={() => setText(formatAmount(cents, locale))}
      />
    </div>
  );
}

/** Een aantal; leeg mag enkel waar `optional`, en betekent dan "geen grens". */
function CountInput({
  id,
  value,
  onChange,
  min = 0,
  max,
  optional = false,
  placeholder,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  optional?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <input
      id={id}
      inputMode="numeric"
      autoComplete="off"
      value={text}
      placeholder={placeholder}
      onChange={(changed) => {
        const raw = changed.target.value.replace(/[^\d]/g, "");
        setText(raw);
        if (raw === "") {
          if (optional) onChange(null);
          return;
        }
        const parsed = Number.parseInt(raw, 10);
        onChange(Math.max(min, max === undefined ? parsed : Math.min(max, parsed)));
      }}
      onBlur={() => setText(value === null ? "" : String(value))}
    />
  );
}

function initialRows(
  types: TicketTemplateType[],
  pools: PoolRow[],
  fromTemplate: boolean
): Row[] {
  const poolUidByCode = new Map(pools.map((pool) => [pool.value.code, pool.uid]));
  return types.map((type) => ({
    uid: nextUid(),
    autoCode: !fromTemplate,
    fromTemplate,
    poolUid: (type.poolCode && poolUidByCode.get(type.poolCode)) || pools[0].uid,
    value: type,
  }));
}

export function TicketSetupEditor({
  typesName,
  poolsName,
  initialTypes,
  initialPools,
  orderMax,
  fromTemplate = false,
  mode = "event",
  locale,
}: {
  /** Naam van het verborgen veld met de tickets als JSON. */
  typesName: string;
  /** Idem voor de plaatsen. */
  poolsName: string;
  initialTypes: TicketTemplateType[];
  initialPools: TicketTemplatePool[];
  /** Het maximum per bestelling over alle tickets samen; hoort bij de tickets en niet bij de planning. */
  orderMax: { name: string; defaultValue: number };
  /** De rijen komen uit een sjabloon: ze houden hun code en kunnen uitgevinkt worden. */
  fromTemplate?: boolean;
  /** "template": in het sjabloonbeheer, met het eigen verkoopvenster per ticket als duur. */
  mode?: "event" | "template";
  locale: AdminLocale;
}) {
  const nl = locale === "nl";
  const idPrefix = useId();
  const field = (key: string) => `${idPrefix}-${key}`;
  const templateMode = mode === "template";

  const [pools, setPools] = useState<PoolRow[]>(() =>
    (initialPools.length > 0 ? initialPools : [{
      code: DEFAULT_POOL_CODE,
      nameNl: "Algemene capaciteit",
      nameEn: "General capacity",
      capacity: 100,
      memberCapacity: null,
      nonMemberCapacity: null,
    }]).map((pool) => ({
      uid: nextUid(),
      autoCode: false,
      seatCaps: pool.memberCapacity !== null || pool.nonMemberCapacity !== null,
      value: pool,
    }))
  );
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows(
      initialTypes.length > 0 ? initialTypes : [blankTicketTemplateType(1)],
      pools,
      fromTemplate || templateMode
    )
  );
  const [maxPerOrder, setMaxPerOrder] = useState<number | null>(orderMax.defaultValue);

  const several = pools.length > 1;

  const poolCodes = assignCodes(
    pools,
    (pool) => (pool.autoCode ? null : pool.value.code),
    (pool, index) => templateCode(pool.value.nameNl, index === 0 ? DEFAULT_POOL_CODE : `PLAATSEN_${index + 1}`)
  );
  const poolCodeByUid = new Map(pools.map((pool, index) => [pool.uid, poolCodes[index]]));
  const ticketCodes = assignCodes(
    rows,
    (row) => (row.autoCode ? null : row.value.code),
    (row, index) => templateCode(row.value.nameNl, `TICKET_${index + 1}`)
  );
  const typesJson = JSON.stringify(
    rows.map((row, index) => ({
      ...row.value,
      code: ticketCodes[index],
      poolCode: poolCodeByUid.get(row.poolUid) ?? null,
    }))
  );
  const poolsJson = JSON.stringify(
    pools.map((pool, index) => ({
      ...pool.value,
      code: poolCodes[index],
      memberCapacity: pool.seatCaps ? pool.value.memberCapacity : null,
      nonMemberCapacity: pool.seatCaps ? pool.value.nonMemberCapacity : null,
    }))
  );

  function updateRow(uid: string, patch: Partial<TicketTemplateType>) {
    setRows((current) =>
      current.map((row) => (row.uid === uid ? { ...row, value: { ...row.value, ...patch } } : row))
    );
  }

  function updatePool(uid: string, patch: Partial<TicketTemplatePool>) {
    setPools((current) =>
      current.map((pool) => (pool.uid === uid ? { ...pool, value: { ...pool.value, ...patch } } : pool))
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        uid: nextUid(),
        autoCode: true,
        fromTemplate: false,
        // Een nieuw ticket gaat van de laatst toegevoegde plaatsen af: wie net
        // "Proffen" maakte, voegt meestal meteen het proffenticket toe.
        poolUid: pools.at(-1)!.uid,
        value: blankTicketTemplateType(current.length + 1),
      },
    ]);
  }

  function addPool() {
    setPools((current) => {
      const first = current[0];
      // Van één naar twee: de eerste pot krijgt dan pas een naam die je ziet.
      // "Algemene capaciteit" naast "Proffen" zegt niets; leeg vraagt erom.
      const renamed =
        current.length === 1 && first.value.nameNl === "Algemene capaciteit"
          ? [{ ...first, value: { ...first.value, nameNl: "", nameEn: "" } }]
          : current;
      return [
        ...renamed,
        {
          uid: nextUid(),
          autoCode: true,
          seatCaps: false,
          value: {
            code: "",
            nameNl: "",
            nameEn: "",
            capacity: 50,
            memberCapacity: null,
            nonMemberCapacity: null,
          },
        },
      ];
    });
  }

  function removePool(uid: string) {
    const remaining = pools.filter((pool) => pool.uid !== uid);
    if (remaining.length === 0) return;
    // De tickets van die plaatsen vallen terug op de eerste, in plaats van naar
    // plaatsen te wijzen die niet meer bestaan.
    setRows((current) =>
      current.map((row) => (row.poolUid === uid ? { ...row, poolUid: remaining[0].uid } : row))
    );
    setPools(
      remaining.length === 1 && remaining[0].value.nameNl === ""
        ? [{ ...remaining[0], value: { ...remaining[0].value, nameNl: "Algemene capaciteit", nameEn: "General capacity" } }]
        : remaining
    );
  }

  const enabledRows = rows.filter((row) => row.value.enabled);
  const colorOptions = TICKET_COLORS.map((color) => ({
    value: color.key,
    label: nl ? color.nl : color.en,
    swatch: `var(--ticket-color-${color.key})`,
  }));
  const audienceOptions = audienceSelectOptions(locale, nl ? "Iedereen" : "Everyone");
  const poolOptions = pools.map((pool, index) => ({
    value: pool.uid,
    label: pool.value.nameNl || (nl ? `Plaatsen ${index + 1}` : `Places ${index + 1}`),
  }));
  const totalCapacity = pools.reduce((sum, pool) => sum + pool.value.capacity, 0);

  return (
    <div className="ticket-setup">
      <input type="hidden" name={typesName} value={typesJson} />
      <input type="hidden" name={poolsName} value={poolsJson} />

      <ul className="ticket-setup-list">
        {rows.map((row, index) => {
          const type = row.value;
          const label = type.nameNl || (nl ? `ticket ${index + 1}` : `ticket ${index + 1}`);
          const canToggle = row.fromTemplate || templateMode;
          return (
            <li key={row.uid} className="ticket-setup-row" data-enabled={type.enabled ? "true" : "false"}>
              <div className="ticket-setup-fields">
                <div className="ticket-admin-field" data-area="name">
                  <label htmlFor={field(`${row.uid}-name`)}>{nl ? "Naam" : "Name"}</label>
                  <input
                    id={field(`${row.uid}-name`)}
                    required={type.enabled}
                    value={type.nameNl}
                    onChange={(changed) => updateRow(row.uid, { nameNl: changed.target.value })}
                    placeholder={nl ? "Bierticket" : "Beer ticket"}
                  />
                </div>
                <div className="ticket-admin-field" data-area="audience">
                  <label htmlFor={field(`${row.uid}-audience`)}>{nl ? "Wie mag kopen" : "Who may buy"}</label>
                  <ThemedSelect
                    id={field(`${row.uid}-audience`)}
                    name={`${field(row.uid)}-audience`}
                    options={audienceOptions}
                    value={type.audience}
                    onChange={(audience) =>
                      // De ledenprijs mee wissen: ze verdwijnt uit beeld, en een
                      // waarde die je niet meer ziet maar wel nog meereist, duikt
                      // later op als een korting die niemand ingesteld heeft.
                      updateRow(row.uid, {
                        audience: audience as TicketTemplateType["audience"],
                        memberPriceCents: audience === "PUBLIC" ? type.memberPriceCents : null,
                      })
                    }
                  />
                </div>
                <div className="ticket-admin-field" data-area="color">
                  <label htmlFor={field(`${row.uid}-color`)}>{nl ? "Kleur" : "Colour"}</label>
                  <ThemedSelect
                    id={field(`${row.uid}-color`)}
                    name={`${field(row.uid)}-color`}
                    options={colorOptions}
                    value={type.color}
                    onChange={(color) => updateRow(row.uid, { color })}
                  />
                </div>
                <div className="ticket-admin-field" data-area="price">
                  <label htmlFor={field(`${row.uid}-price`)}>{nl ? "Prijs" : "Price"}</label>
                  <AmountInput
                    id={field(`${row.uid}-price`)}
                    cents={type.unitPriceCents}
                    onChange={(cents) => updateRow(row.uid, { unitPriceCents: cents ?? 0 })}
                    locale={locale}
                  />
                </div>
                {type.audience === "PUBLIC" ? (
                  <div className="ticket-admin-field" data-area="member">
                    <label htmlFor={field(`${row.uid}-member`)}>{nl ? "Ledenprijs" : "Member price"}</label>
                    <AmountInput
                      id={field(`${row.uid}-member`)}
                      cents={type.memberPriceCents}
                      optional
                      placeholder={nl ? "geen" : "none"}
                      onChange={(cents) => updateRow(row.uid, { memberPriceCents: cents })}
                      locale={locale}
                    />
                  </div>
                ) : null}
                <div className="ticket-admin-field" data-area="max">
                  <label htmlFor={field(`${row.uid}-max`)}>{nl ? "Max. per bestelling" : "Max. per order"}</label>
                  <CountInput
                    id={field(`${row.uid}-max`)}
                    value={type.maxPerOrder}
                    min={1}
                    max={50}
                    onChange={(value) => updateRow(row.uid, { maxPerOrder: value ?? 1 })}
                  />
                </div>
                {several ? (
                  <div className="ticket-admin-field" data-area="pool">
                    <label htmlFor={field(`${row.uid}-pool`)}>{nl ? "Plaatsen" : "Places"}</label>
                    <ThemedSelect
                      id={field(`${row.uid}-pool`)}
                      name={`${field(row.uid)}-pool`}
                      options={poolOptions}
                      value={row.poolUid}
                      onChange={(poolUid) =>
                        setRows((current) =>
                          current.map((candidate) =>
                            candidate.uid === row.uid ? { ...candidate, poolUid } : candidate
                          )
                        )
                      }
                    />
                  </div>
                ) : null}
                <label className="ticket-setup-toggle" data-area="honorary" htmlFor={field(`${row.uid}-honorary`)}>
                  <input
                    id={field(`${row.uid}-honorary`)}
                    type="checkbox"
                    checked={type.honoraryFree}
                    onChange={(changed) => updateRow(row.uid, { honoraryFree: changed.target.checked })}
                  />
                  {nl
                    ? "Gratis voor ereleden (1 per erelid voor dit event)"
                    : "Free for honorary members (1 per honorary member for this event)"}
                </label>
                {templateMode ? (
                  <div className="ticket-admin-field" data-area="offset">
                    <label htmlFor={field(`${row.uid}-opens`)}>
                      {nl ? "Eigen verkoopstart (min. vooraf)" : "Own sales start (min. before)"}
                    </label>
                    <CountInput
                      id={field(`${row.uid}-opens`)}
                      value={type.salesOpensMinutesBefore}
                      optional
                      placeholder={nl ? "volgt event" : "follows event"}
                      onChange={(value) => updateRow(row.uid, { salesOpensMinutesBefore: value })}
                    />
                    {type.salesOpensMinutesBefore !== null ? (
                      <span className="ticket-admin-help">
                        {formatMinutesBefore(type.salesOpensMinutesBefore, locale)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="ticket-setup-actions">
                {canToggle ? (
                  <label className="ticket-setup-toggle" htmlFor={field(`${row.uid}-enabled`)}>
                    <input
                      id={field(`${row.uid}-enabled`)}
                      type="checkbox"
                      checked={type.enabled}
                      onChange={(changed) => updateRow(row.uid, { enabled: changed.target.checked })}
                    />
                    {templateMode ? (nl ? "Standaard aan" : "On by default") : nl ? "Aanmaken" : "Create"}
                  </label>
                ) : null}
                <button
                  type="button"
                  className="ticket-admin-icon-button"
                  title={nl ? "Ticket weghalen" : "Remove ticket"}
                  aria-label={nl ? `Ticket weghalen: ${label}` : `Remove ticket: ${label}`}
                  onClick={() => setRows((current) => current.filter((candidate) => candidate.uid !== row.uid))}
                  disabled={rows.length === 1}
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="ticket-setup-foot">
        <button type="button" className="ticket-admin-button" onClick={addRow}>
          <Plus aria-hidden="true" size={15} />
          {nl ? "Ticket toevoegen" : "Add ticket"}
        </button>
        {enabledRows.length < rows.length ? (
          <span className="ticket-admin-help" role="status">
            {templateMode
              ? nl
                ? `${enabledRows.length} van ${rows.length} tickets staan standaard aan.`
                : `${enabledRows.length} of ${rows.length} tickets are on by default.`
              : nl
                ? `${enabledRows.length} van ${rows.length} tickets worden aangemaakt.`
                : `${enabledRows.length} of ${rows.length} tickets will be created.`}
          </span>
        ) : null}
      </div>

      <div className="ticket-setup-places">
        <div className="ticket-setup-places-head">
          <h3>{nl ? "Plaatsen" : "Places"}</h3>
          <p className="ticket-admin-help">
            {several
              ? nl
                ? `${totalCapacity} plaatsen in ${pools.length} delen. Elk ticket gaat af van de plaatsen die je erbij kiest.`
                : `${totalCapacity} places in ${pools.length} parts. Each ticket takes from the places you pick for it.`
              : nl
                ? "Alle tickets hierboven delen deze plaatsen: of het water- of biertickets worden, maakt niet uit."
                : "All tickets above share these places, whichever kind gets sold."}
          </p>
        </div>

        <ul className="ticket-setup-pools">
          {pools.map((pool, index) => {
            const tickets = rows.filter((row) => row.poolUid === pool.uid && row.value.enabled);
            const sellable = poolSellableCapacity({
              capacity: pool.value.capacity,
              memberCapacity: pool.seatCaps ? pool.value.memberCapacity : null,
              nonMemberCapacity: pool.seatCaps ? pool.value.nonMemberCapacity : null,
            });
            const poolLabel = pool.value.nameNl || (nl ? `plaatsen ${index + 1}` : `places ${index + 1}`);
            return (
              <li key={pool.uid} className="ticket-setup-pool">
                <div className="ticket-setup-pool-fields">
                  {several ? (
                    <div className="ticket-admin-field" data-area="name">
                      <label htmlFor={field(`${pool.uid}-name`)}>{nl ? "Naam" : "Name"}</label>
                      <input
                        id={field(`${pool.uid}-name`)}
                        required
                        value={pool.value.nameNl}
                        placeholder={index === 0 ? (nl ? "Studenten" : "Students") : nl ? "Proffen" : "Professors"}
                        onChange={(changed) => updatePool(pool.uid, { nameNl: changed.target.value })}
                      />
                    </div>
                  ) : null}
                  <div className="ticket-admin-field" data-area="capacity">
                    <label htmlFor={field(`${pool.uid}-capacity`)}>
                      {nl ? "Aantal plaatsen" : "Number of places"}
                    </label>
                    <CountInput
                      id={field(`${pool.uid}-capacity`)}
                      value={pool.value.capacity}
                      min={1}
                      max={1_000_000}
                      onChange={(value) => updatePool(pool.uid, { capacity: value ?? 1 })}
                    />
                  </div>
                  <label className="ticket-setup-toggle" htmlFor={field(`${pool.uid}-caps`)}>
                    <input
                      id={field(`${pool.uid}-caps`)}
                      type="checkbox"
                      checked={pool.seatCaps}
                      onChange={(changed) =>
                        setPools((current) =>
                          current.map((candidate) =>
                            candidate.uid === pool.uid ? { ...candidate, seatCaps: changed.target.checked } : candidate
                          )
                        )
                      }
                    />
                    {nl ? "Apart maximum voor leden en niet-leden" : "Separate maximum for members and non-members"}
                  </label>
                  {several ? (
                    <button
                      type="button"
                      className="ticket-admin-icon-button"
                      title={nl ? "Plaatsen weghalen" : "Remove places"}
                      aria-label={nl ? `Plaatsen weghalen: ${poolLabel}` : `Remove places: ${poolLabel}`}
                      onClick={() => removePool(pool.uid)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>

                {pool.seatCaps ? (
                  <div className="ticket-setup-caps">
                    <div className="ticket-admin-field">
                      <label htmlFor={field(`${pool.uid}-members`)}>{nl ? "Hoogstens voor leden" : "At most for members"}</label>
                      <CountInput
                        id={field(`${pool.uid}-members`)}
                        value={pool.value.memberCapacity}
                        optional
                        max={pool.value.capacity}
                        placeholder={nl ? "geen grens" : "no limit"}
                        onChange={(value) => updatePool(pool.uid, { memberCapacity: value })}
                      />
                    </div>
                    <div className="ticket-admin-field">
                      <label htmlFor={field(`${pool.uid}-nonmembers`)}>
                        {nl ? "Hoogstens voor niet-leden" : "At most for non-members"}
                      </label>
                      <CountInput
                        id={field(`${pool.uid}-nonmembers`)}
                        value={pool.value.nonMemberCapacity}
                        optional
                        max={pool.value.capacity}
                        placeholder={nl ? "geen grens" : "no limit"}
                        onChange={(value) => updatePool(pool.uid, { nonMemberCapacity: value })}
                      />
                    </div>
                    <p className="ticket-admin-help" data-span="2">
                      {nl
                        ? "Leeg is geen eigen grens: dan mag die groep tot alle plaatsen. Een ticket telt voor leden wanneer een lid het koopt, behalve aan de gewone prijs van een ticket met ledenprijs: dat is voor een niet-lid."
                        : "Empty means no separate limit: that group may take every place. A ticket counts for members when a member buys it, except at the regular price of a ticket with a member price: that one is for a non-member."}
                      {sellable < pool.value.capacity
                        ? nl
                          ? ` Samen kunnen er zo maar ${sellable} van de ${pool.value.capacity} plaatsen verkocht worden.`
                          : ` Together only ${sellable} of the ${pool.value.capacity} places can be sold this way.`
                        : ""}
                    </p>
                  </div>
                ) : null}

                {several ? (
                  <p className="ticket-setup-pool-tickets" data-empty={tickets.length === 0 || undefined}>
                    {tickets.length === 0
                      ? nl
                        ? "Nog geen ticket: kies deze plaatsen bij een ticket hierboven."
                        : "No ticket yet: pick these places on a ticket above."
                      : `${nl ? "Tickets" : "Tickets"}: ${tickets.map((row) => row.value.nameNl || "…").join(", ")}`}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <button type="button" className="ticket-admin-button" onClick={addPool}>
          <Plus aria-hidden="true" size={15} />
          {several
            ? nl ? "Plaatsen toevoegen" : "Add places"
            : nl ? "Apart aantal plaatsen voor bepaalde tickets" : "Separate places for some tickets"}
        </button>

        <div className="ticket-admin-field ticket-setup-order-max">
          <label htmlFor={field("order-max")}>
            {nl ? "Max. tickets per bestelling, alle tickets samen" : "Max. tickets per order, all tickets together"}
          </label>
          <input type="hidden" name={orderMax.name} value={maxPerOrder ?? 1} />
          <CountInput
            id={field("order-max")}
            value={maxPerOrder}
            min={1}
            max={50}
            onChange={(value) => setMaxPerOrder(value ?? 1)}
          />
          <span className="ticket-admin-help">
            {nl
              ? "Bovenop het maximum van elk ticket. De shop toont het kleinste van de twee."
              : "On top of each ticket's own maximum. The shop shows whichever is lower."}
          </span>
        </div>
      </div>
    </div>
  );
}
