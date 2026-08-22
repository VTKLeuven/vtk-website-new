import { TICKET_COLORS, ticketColorKey } from "@/lib/ticketing/ticketColors";
import type { AdminLocale } from "./format";

/**
 * De kleurkiezer voor een tickettype: gewone radio-knoppen met een gekleurd
 * vlakje als label. Geen client component, geen kleurenwiel; de waarde is een
 * key uit het palet (zie `lib/ticketing/ticketColors.ts`) en radio's doen dat
 * zonder JavaScript.
 *
 * De naam van de kleur staat in het label en niet enkel in de kleur zelf, zodat
 * de keuze ook leesbaar is voor wie de vlakjes niet uit elkaar houdt.
 */
export function TicketColorChoice({
  name = "color",
  idPrefix,
  value,
  locale,
}: {
  name?: string;
  idPrefix: string;
  value?: string | null;
  locale: AdminLocale;
}) {
  const selected = ticketColorKey(value);
  return (
    <fieldset className="ticket-admin-colors">
      <legend>{locale === "nl" ? "Kleur" : "Colour"}</legend>
      <p className="ticket-admin-help">
        {locale === "nl"
          ? "De scanner kleurt hiermee het volledige scherm bij een aanvaard ticket."
          : "The scanner fills the whole screen with this colour when a ticket is accepted."}
      </p>
      <div className="ticket-admin-color-options">
        {TICKET_COLORS.map((color) => {
          const id = `${idPrefix}-color-${color.key}`;
          return (
            <label key={color.key} htmlFor={id} data-color={color.key}>
              <input
                id={id}
                type="radio"
                name={name}
                value={color.key}
                defaultChecked={color.key === selected}
              />
              <span aria-hidden="true" style={{ background: `var(--ticket-color-${color.key})` }} />
              {locale === "en" ? color.en : color.nl}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
