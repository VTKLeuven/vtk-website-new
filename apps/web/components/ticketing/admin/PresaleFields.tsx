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
    legend: "Voorverkoop",
    lead: "Voorverkoop",
    hours: "uur eerder",
    days: "dagen eerder",
    none: "Geen voorverkoop: iedereen begint op de verkoopstart.",
    needsStart: "Vul eerst een start verkoop in; een voorverkoop is een duur daarvoor.",
    from: (moment: string) => `De voorverkoop loopt van ${moment} tot de verkoopstart.`,
    audience: "Wie mag er in de voorverkoop?",
    praesidium: "Alle praesidiumposten",
    extra: "Extra groepen",
    extraHelp:
      "Optioneel, bovenop het praesidium. Bijvoorbeeld de werkgroep die het event organiseert.",
    empty: "Kies minstens het praesidium of één groep, anders kan niemand in voorverkoop.",
  },
  en: {
    legend: "Presale",
    lead: "Presale",
    hours: "hours earlier",
    days: "days earlier",
    none: "No presale: everyone starts at the sales start.",
    needsStart: "Set a sales start first; a presale is a duration before it.",
    from: (moment: string) => `The presale runs from ${moment} until sales open.`,
    audience: "Who may buy during the presale?",
    praesidium: "Every praesidium post",
    extra: "Extra groups",
    extraHelp: "Optional, on top of the praesidium. For instance the working group organising it.",
    empty: "Pick the praesidium or at least one group, otherwise nobody can buy early.",
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
 * Bewust een duur en geen tweede datum (zie `lib/ticketing/presale.ts`), en
 * bewust met de uitkomst eronder: "48 uur eerder" zegt niets zolang je zelf de
 * verkoopstart moet aftrekken, en dat is net het getal waar een misklik in
 * blijft zitten tot het praesidium te vroeg of te laat kan kopen.
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

  function toggleGroup(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, id])] : current.filter((entry) => entry !== id),
    );
  }

  return (
    <div className="ticket-admin-field" data-span="2">
      <label htmlFor="ticket-presale-lead">{t.lead}</label>
      <div className="ticket-admin-presale-lead">
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
          aria-label={t.legend}
          value={unit}
          onChange={(event) => setUnit(event.target.value === "days" ? "days" : "hours")}
        >
          <option value="hours">{t.hours}</option>
          <option value="days">{t.days}</option>
        </select>
      </div>
      <span className="ticket-admin-help">
        {!active ? t.none : !salesStartLocal ? t.needsStart : startLabel ? t.from(startLabel) : t.needsStart}
      </span>

      {active ? (
        <fieldset className="ticket-admin-presale-audience">
          <legend>
            <Users aria-hidden="true" size={15} /> {t.audience}
          </legend>
          <label className="ticket-admin-check">
            <input type="hidden" name="presalePraesidium" value="false" />
            <input
              type="checkbox"
              name="presalePraesidium"
              value="true"
              checked={withPraesidium}
              onChange={(event) => setWithPraesidium(event.target.checked)}
            />
            {t.praesidium}
          </label>
          <div className="ticket-admin-presale-groups">
            <span className="ticket-admin-label">{t.extra}</span>
            <div className="ticket-admin-presale-group-list">
              {groups.map((group) => (
                <label className="ticket-admin-check" key={group.id}>
                  <input
                    type="checkbox"
                    name="presaleGroupIds"
                    value={group.id}
                    checked={selected.includes(group.id)}
                    onChange={(event) => toggleGroup(group.id, event.target.checked)}
                  />
                  {locale === "en" ? group.nameEn : group.nameNl}
                </label>
              ))}
            </div>
            <span className="ticket-admin-help">
              {!withPraesidium && selected.length === 0 ? t.empty : t.extraHelp}
            </span>
          </div>
        </fieldset>
      ) : (
        // Zonder voorverkoop sturen we de keuze niet mee; de action ruimt de
        // groepen dan zelf op, zodat er niets blijft hangen dat niemand ziet.
        <input type="hidden" name="presalePraesidium" value={withPraesidium ? "true" : "false"} />
      )}
    </div>
  );
}
