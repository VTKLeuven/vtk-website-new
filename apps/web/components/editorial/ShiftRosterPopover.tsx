import type { ShiftRosterEntry } from "@/lib/shift";

/**
 * Wie er al op een shift staat, als popover naast de vrije plaatsen.
 *
 * Eén tekening voor de homepage: de shiftkaartjes (`FrontpageShiftBand`) en de
 * shiften in de hero (`HeroShifts`) tonen allebei deze lijst. De klassen staan
 * in `vtk-home.css`; de popover verschijnt in CSS op hover en focus van de
 * omhullende `.shift-spots-wrap`, dus dit werkt ook vanuit een servercomponent.
 *
 * `aria-hidden`, want de trigger draagt dezelfde namen in zijn `aria-label`.
 */
export function ShiftRosterPopover({
  roster,
  taken,
  max,
  nl,
}: {
  roster: ShiftRosterEntry[];
  taken: number;
  max: number;
  nl: boolean;
}) {
  return (
    <div className="shift-spots-popover" role="tooltip" aria-hidden="true">
      <div className="shift-spots-popover-head">
        <span className="shift-spots-popover-title">{nl ? "Ingeschreven" : "Registered"}</span>
        <span className="shift-spots-popover-count">
          {taken}/{max}
        </span>
      </div>
      {roster.length === 0 ? (
        <p className="shift-spots-popover-empty">{nl ? "Nog geen inschrijvingen" : "No sign-ups yet"}</p>
      ) : (
        <ul className="shift-spots-popover-list">
          {roster.map((person, idx) => (
            <li
              key={idx}
              className="shift-spots-popover-person"
              data-self={person.isSelf ? "true" : undefined}
            >
              <span className="shift-spots-popover-initial">
                {person.name.trim().slice(0, 1).toUpperCase() || "?"}
              </span>
              <span className="shift-spots-popover-name">
                {person.name}
                {person.isSelf ? (
                  <span className="shift-spots-popover-you"> ({nl ? "jij" : "you"})</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Dezelfde namen als tekst, voor de `aria-label` en `title` van de trigger. */
export function shiftRosterSummary(roster: ShiftRosterEntry[], nl: boolean): string {
  if (roster.length === 0) return nl ? "Nog geen inschrijvingen" : "No sign-ups yet";
  const names = roster.map((p) => (p.isSelf ? `${p.name} (${nl ? "jij" : "you"})` : p.name));
  return `${nl ? "Ingeschreven" : "Registered"}: ${names.join(", ")}`;
}
