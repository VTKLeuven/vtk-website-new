"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TICKET_COLORS } from "@/lib/ticketing/ticketColors";
import {
  amountToCents,
  blankTicketTemplateType,
  centsToAmount,
  formatMinutesBefore,
  type TicketTemplateType,
} from "@/lib/ticketing/templates";
import type { AdminLocale } from "./format";

/**
 * De tickets die een sjabloon meebrengt, bewerkbaar bij het aanmaken van het
 * event.
 *
 * Een sjabloon is een vertrekpunt en geen wet: de prijs van een cantusticket
 * verandert, en een editie zonder sangria verkoopt er drie in plaats van vier.
 * Daarom staan de rijen hier open en niet als een lijstje "dit wordt
 * aangemaakt". De rijen reizen als JSON in één verborgen veld naar de server,
 * zoals de shiftsjablonen: elf velden per rij in genummerde formuliervelden
 * persen levert enkel een tweede, afwijkende lezing van hetzelfde op.
 *
 * Wordt ook gebruikt door het beheerscherm van de sjablonen zelf, met
 * `showOffsets`: daar staat geen datum, dus daar hoort het eigen verkoopvenster
 * als duur ("2 dagen vooraf") in plaats van als klokuur.
 */
export function TicketTemplateTypeRows({
  name,
  initial,
  locale,
  showOffsets = false,
}: {
  /** Naam van het verborgen veld met de JSON. */
  name: string;
  initial: TicketTemplateType[];
  locale: AdminLocale;
  /** Toon per rij het eigen verkoopvenster als offset (enkel in het sjabloonbeheer). */
  showOffsets?: boolean;
}) {
  const nl = locale === "nl";
  const [rows, setRows] = useState<TicketTemplateType[]>(
    initial.length > 0 ? initial : [blankTicketTemplateType(1)]
  );

  function update(index: number, patch: Partial<TicketTemplateType>) {
    setRows((current) =>
      current.map((row, position) => (position === index ? { ...row, ...patch } : row))
    );
  }

  const active = rows.filter((row) => row.enabled);

  return (
    <div className="ticket-admin-template-rows">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />

      <div className="ticket-admin-table-wrap">
        <table className="ticket-admin-table">
          <thead>
            <tr>
              <th>{nl ? "Naam" : "Name"}</th>
              <th>{nl ? "Prijs" : "Price"}</th>
              <th>{nl ? "Wie" : "Audience"}</th>
              <th>{nl ? "Max." : "Max."}</th>
              <th>{nl ? "Kleur" : "Colour"}</th>
              {showOffsets ? <th>{nl ? "Eigen verkoop" : "Own sales"}</th> : null}
              <th>{nl ? "Aan" : "On"}</th>
              <th>
                <span className="sr-only">{nl ? "Verwijderen" : "Remove"}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} data-enabled={row.enabled ? "true" : "false"}>
                <td>
                  <label className="sr-only" htmlFor={`${name}-name-${index}`}>
                    {nl ? `Naam van ticket ${index + 1}` : `Name of ticket ${index + 1}`}
                  </label>
                  <input
                    id={`${name}-name-${index}`}
                    value={row.nameNl}
                    onChange={(changed) => update(index, { nameNl: changed.target.value })}
                    placeholder={nl ? "Bierticket (Lid)" : "Beer ticket (member)"}
                  />
                  <label className="sr-only" htmlFor={`${name}-code-${index}`}>
                    {nl ? `Code van ticket ${index + 1}` : `Code of ticket ${index + 1}`}
                  </label>
                  <input
                    id={`${name}-code-${index}`}
                    className="ticket-admin-template-code"
                    value={row.code}
                    onChange={(changed) => update(index, { code: changed.target.value })}
                    placeholder="BIERLID"
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`${name}-price-${index}`}>
                    {nl ? `Prijs van ticket ${index + 1}` : `Price of ticket ${index + 1}`}
                  </label>
                  <input
                    id={`${name}-price-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={centsToAmount(row.unitPriceCents)}
                    onChange={(changed) =>
                      update(index, { unitPriceCents: amountToCents(changed.target.value) })
                    }
                  />
                  {/* De ledenprijs onder de gewone prijs en niet in een eigen
                      kolom: de tabel staat in een kolom van 900 px en telt er al
                      zeven, en het gaat over hetzelfde ticket. Enkel bij een
                      ticket dat voor iedereen te koop staat; bij "alleen leden"
                      is er geen tweede prijs om naast te zetten. */}
                  {row.audience === "PUBLIC" ? (
                    <>
                      <label
                        className="ticket-admin-template-subfield-label"
                        htmlFor={`${name}-memberprice-${index}`}
                      >
                        {nl ? "leden" : "members"}
                      </label>
                      <input
                        id={`${name}-memberprice-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={nl ? "geen" : "none"}
                        value={
                          row.memberPriceCents === null ? "" : centsToAmount(row.memberPriceCents)
                        }
                        onChange={(changed) =>
                          update(index, {
                            memberPriceCents:
                              changed.target.value.trim() === ""
                                ? null
                                : amountToCents(changed.target.value),
                          })
                        }
                      />
                    </>
                  ) : null}
                </td>
                <td>
                  <label className="sr-only" htmlFor={`${name}-audience-${index}`}>
                    {nl ? `Wie mag ticket ${index + 1} kopen` : `Who may buy ticket ${index + 1}`}
                  </label>
                  <select
                    id={`${name}-audience-${index}`}
                    value={row.audience}
                    onChange={(changed) => {
                      const audience = changed.target.value as TicketTemplateType["audience"];
                      // De ledenprijs mee wissen: ze verdwijnt hierboven uit
                      // beeld, en een waarde die je niet meer ziet maar wel nog
                      // meereist, duikt later op als een korting die niemand
                      // ingesteld heeft.
                      update(index, {
                        audience,
                        memberPriceCents: audience === "PUBLIC" ? row.memberPriceCents : null,
                      });
                    }}
                  >
                    <option value="PUBLIC">{nl ? "Iedereen" : "Everyone"}</option>
                    <option value="MEMBERS">{nl ? "Alleen leden" : "Members only"}</option>
                    <option value="HONORARY">{nl ? "Alleen ereleden" : "Honorary only"}</option>
                  </select>
                </td>
                <td>
                  <label className="sr-only" htmlFor={`${name}-max-${index}`}>
                    {nl
                      ? `Maximum per bestelling voor ticket ${index + 1}`
                      : `Maximum per order for ticket ${index + 1}`}
                  </label>
                  <input
                    id={`${name}-max-${index}`}
                    type="number"
                    min="1"
                    max="50"
                    value={row.maxPerOrder}
                    onChange={(changed) =>
                      update(index, { maxPerOrder: Number.parseInt(changed.target.value, 10) || 1 })
                    }
                  />
                </td>
                <td>
                  <label className="sr-only" htmlFor={`${name}-color-${index}`}>
                    {nl ? `Kleur van ticket ${index + 1}` : `Colour of ticket ${index + 1}`}
                  </label>
                  <select
                    id={`${name}-color-${index}`}
                    value={row.color}
                    onChange={(changed) => update(index, { color: changed.target.value })}
                  >
                    {TICKET_COLORS.map((color) => (
                      <option key={color.key} value={color.key}>
                        {nl ? color.nl : color.en}
                      </option>
                    ))}
                  </select>
                </td>
                {showOffsets ? (
                  <td>
                    <label className="sr-only" htmlFor={`${name}-opens-${index}`}>
                      {nl
                        ? `Verkoop opent voor ticket ${index + 1}, in minuten vooraf`
                        : `Sales open for ticket ${index + 1}, minutes before`}
                    </label>
                    <input
                      id={`${name}-opens-${index}`}
                      type="number"
                      step="60"
                      value={row.salesOpensMinutesBefore ?? ""}
                      placeholder={nl ? "volgt event" : "follows event"}
                      onChange={(changed) =>
                        update(index, {
                          salesOpensMinutesBefore:
                            changed.target.value === ""
                              ? null
                              : Number.parseInt(changed.target.value, 10),
                        })
                      }
                    />
                    <span className="ticket-admin-help">
                      {formatMinutesBefore(row.salesOpensMinutesBefore, locale)}
                    </span>
                  </td>
                ) : null}
                <td>
                  <label className="sr-only" htmlFor={`${name}-enabled-${index}`}>
                    {nl ? `Ticket ${index + 1} aanmaken` : `Create ticket ${index + 1}`}
                  </label>
                  <input
                    id={`${name}-enabled-${index}`}
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(changed) => update(index, { enabled: changed.target.checked })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="ticket-admin-icon-button"
                    title={nl ? "Rij verwijderen" : "Remove row"}
                    aria-label={
                      nl
                        ? `Rij verwijderen: ${row.nameNl || `ticket ${index + 1}`}`
                        : `Remove row: ${row.nameNl || `ticket ${index + 1}`}`
                    }
                    onClick={() =>
                      setRows((current) => current.filter((_, position) => position !== index))
                    }
                    disabled={rows.length === 1}
                  >
                    <Trash2 aria-hidden="true" size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ticket-admin-template-rows-foot">
        <button
          type="button"
          className="ticket-admin-button"
          onClick={() =>
            setRows((current) => [...current, blankTicketTemplateType(current.length + 1)])
          }
        >
          <Plus aria-hidden="true" size={15} />
          {nl ? "Ticket toevoegen" : "Add ticket"}
        </button>
        <span className="ticket-admin-help" role="status">
          {nl
            ? `${active.length} van ${rows.length} tickets worden aangemaakt.`
            : `${active.length} of ${rows.length} tickets will be created.`}
        </span>
      </div>
    </div>
  );
}
