"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import type { AdminLocale } from "./format";

export type PresaleGroupOption = {
  id: string;
  nameNl: string;
  nameEn: string;
  type: string;
};

const T = {
  nl: {
    label: "Voorverkoop",
    start: "Start",
    hours: "uur",
    days: "dagen",
    before: "vóór de verkoopstart",
    none: "Geen voorverkoop: iedereen begint op de verkoopstart.",
    needsStart: "Vul eerst een start verkoop in; een voorverkoop is een duur daarvoor.",
    from: (moment: string) => `Loopt van ${moment} tot de verkoopstart.`,
    praesidium: "Alle praesidiumposten",
    nobody: "Niemand: kies het praesidium of een groep",
    edit: "Aanpassen",
    done: "Klaar",
    extra: "Extra groepen, bovenop het praesidium",
    and: "en",
  },
  en: {
    label: "Presale",
    start: "Starts",
    hours: "hours",
    days: "days",
    before: "before sales open",
    none: "No presale: everyone starts when sales open.",
    needsStart: "Set a sales start first; a presale is a duration before it.",
    from: (moment: string) => `Runs from ${moment} until sales open.`,
    praesidium: "Every praesidium post",
    nobody: "Nobody: pick the praesidium or a group",
    edit: "Change",
    done: "Done",
    extra: "Extra groups, on top of the praesidium",
    and: "and",
  },
} as const;

/** Uit minuten terug naar het getal en de eenheid die iemand ingaf. */
function splitLead(minutes: number | null | undefined): { value: string; unit: "hours" | "days" } {
  if (!minutes || minutes <= 0) return { value: "", unit: "hours" };
  if (minutes % 1_440 === 0) return { value: String(minutes / 1_440), unit: "days" };
  return { value: String(Math.round(minutes / 60)), unit: "hours" };
}

/**
 * De voorverkoop op het ticketevent: hoe lang voor de verkoopstart, en voor wie.
 *
 * Eén regel die je leest als een zin ("Start 48 uur vóór de verkoopstart"), met
 * de uitkomst eronder. Dat laatste is geen franje: "48 uur eerder" zegt niets
 * zolang je zelf de verkoopstart moet aftrekken, en net in dat getal blijft een
 * misklik zitten tot het praesidium te vroeg of te laat kan kopen.
 *
 * De doelgroep staat er als één regel tekst, niet als een lijst van
 * drieëntwintig vakjes. Bijna elke voorverkoop is er een voor het praesidium;
 * wie er een werkgroep bij wil, klapt de rest open met "Aanpassen". Dat scherm
 * is een beheerformulier, geen keuzeblad.
 */
export function PresaleFields({
  salesStartLocal,
  leadMinutes,
  praesidium = true,
  groupIds = [],
  groups,
  locale,
}: {
  /** De waarde van het veld "Start verkoop", zoals ze nu in het formulier staat. */
  salesStartLocal: string;
  leadMinutes?: number | null;
  praesidium?: boolean;
  groupIds?: readonly string[];
  groups: PresaleGroupOption[];
  locale: AdminLocale;
}) {
  const t = T[locale];
  const initial = splitLead(leadMinutes);
  const [lead, setLead] = useState(initial.value);
  const [unit, setUnit] = useState<"hours" | "days">(initial.unit);
  const [withPraesidium, setWithPraesidium] = useState(praesidium);
  const [selected, setSelected] = useState<string[]>([...groupIds]);
  const [open, setOpen] = useState(false);

  const leadNumber = Number(lead);
  const active = Number.isFinite(leadNumber) && leadNumber > 0;
  const minutes = active ? leadNumber * (unit === "days" ? 1_440 : 60) : 0;
  const start =
    active && salesStartLocal
      ? new Date(new Date(salesStartLocal).getTime() - minutes * 60_000)
      : null;
  const startLabel =
    start && !Number.isNaN(start.getTime())
      ? new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        }).format(start)
      : null;

  const groupName = (group: PresaleGroupOption) => (locale === "en" ? group.nameEn : group.nameNl);
  const chosen = groups.filter((group) => selected.includes(group.id)).map(groupName);
  const chosenLabel =
    chosen.length <= 1
      ? chosen.join("")
      : `${chosen.slice(0, -1).join(", ")} ${t.and} ${chosen[chosen.length - 1]}`;
  const audience = withPraesidium
    ? chosen.length > 0
      ? `${t.praesidium} + ${chosenLabel}`
      : t.praesidium
    : chosen.length > 0
      ? chosenLabel
      : t.nobody;

  function toggleGroup(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id),
    );
  }

  return (
    <div className="ticket-admin-field" data-span="2">
      <label htmlFor="ticket-presale-lead">{t.label}</label>

      <div className="ticket-admin-presale-line">
        <span>{t.start}</span>
        <input
          id="ticket-presale-lead"
          name="presaleLeadValue"
          type="number"
          min="0"
          max="365"
          step="1"
          inputMode="numeric"
          placeholder="0"
          value={lead}
          onChange={(event) => setLead(event.target.value)}
        />
        <select
          name="presaleLeadUnit"
          aria-label={t.label}
          value={unit}
          onChange={(event) => setUnit(event.target.value === "days" ? "days" : "hours")}
        >
          <option value="hours">{t.hours}</option>
          <option value="days">{t.days}</option>
        </select>
        <span>{t.before}</span>
      </div>

      <span className="ticket-admin-help">
        {!active
          ? t.none
          : !salesStartLocal || !startLabel
            ? t.needsStart
            : t.from(startLabel)}
      </span>

      {/* De keuze reist altijd mee, ook wanneer het paneel dicht staat; de
          vakjes daarin sturen niets zelf, ze bewerken deze staat. */}
      <input type="hidden" name="presalePraesidium" value={withPraesidium ? "true" : "false"} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="presaleGroupIds" value={id} />
      ))}

      {active ? (
        <div className="ticket-admin-presale-who">
          <span data-empty={!withPraesidium && chosen.length === 0 ? "" : undefined}>
            <Users aria-hidden="true" size={15} />
            {audience}
          </span>
          <button
            type="button"
            className="ticket-admin-button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? t.done : t.edit}
          </button>
        </div>
      ) : null}

      {active && open ? (
        <div className="ticket-admin-presale-panel">
          <label className="ticket-admin-check">
            <input
              type="checkbox"
              checked={withPraesidium}
              onChange={(event) => setWithPraesidium(event.target.checked)}
            />
            {t.praesidium}
          </label>
          <span className="ticket-admin-label">{t.extra}</span>
          <div className="ticket-admin-presale-groups">
            {groups.map((group) => (
              <label className="ticket-admin-check" key={group.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(group.id)}
                  onChange={(event) => toggleGroup(group.id, event.target.checked)}
                />
                {groupName(group)}
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
