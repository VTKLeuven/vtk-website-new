import { palPlusAvailabilityValue, PAL_PLUS_WEEKDAYS, type PalPlusAvailabilityGridView } from "@/lib/palPlus";

import "@/app/design/vtk-palplus-tags.css";

export type AvailabilityColumn = { id: string; label: string; hours: string };

/**
 * Het rooster "wanneer kan je meestal?": de dagen onder elkaar, de dagdelen van
 * Onderwijs als kolommen, één tik per vakje. Gewone checkboxen, dus het werkt
 * ook zonder JavaScript en met een toetsenbord; het vakje zelf toont of het
 * aangeduid is.
 */
export function AvailabilityGrid({
  columns,
  nl,
  legend,
}: {
  columns: AvailabilityColumn[];
  nl: boolean;
  legend: string;
}) {
  return (
    <div className="pp-avail-wrap">
      <table className="pp-avail">
        <caption className="sr-only">{legend}</caption>
        <thead>
          <tr>
            {/* Met `table-layout: fixed` bepaalt de eerste rij de kolombreedtes. */}
            <td className="pp-avail-corner" />
            {columns.map((column) => (
              <th key={column.id} scope="col">
                <span className="pp-avail-col">{column.label}</span>
                <span className="pp-avail-hours">{column.hours}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PAL_PLUS_WEEKDAYS.map((weekday) => (
            <tr key={weekday.day}>
              <th scope="row">
                <span className="pp-avail-day">{nl ? weekday.nl : weekday.en}</span>
                <span className="pp-avail-day-short" aria-hidden="true">
                  {nl ? weekday.shortNl : weekday.shortEn}
                </span>
              </th>
              {columns.map((column) => (
                <td key={column.id}>
                  <label className="pp-avail-cell">
                    <input
                      type="checkbox"
                      name="availability"
                      value={palPlusAvailabilityValue(weekday.day, column.id)}
                    />
                    <span aria-hidden="true" />
                    <span className="sr-only">
                      {nl ? weekday.nl : weekday.en}, {column.label}
                    </span>
                  </label>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Een aangeduid rooster om te lezen (in het beheer en bij je eigen aanvraag):
 * enkel de dagen met iets aangeduid, de dagdelen zoals ze toen heetten.
 *
 * Bewust geen `<table>` maar een raster met tabelrollen: in het beheer kleurt
 * `.vtk-admin-main thead` elke tabelkop met `!important`, en dit is geen
 * beheertabel maar een handvol vakjes.
 */
export function AvailabilityView({ grid, nl }: { grid: PalPlusAvailabilityGridView; nl: boolean }) {
  if (grid.rows.length === 0) return null;
  const columns = { gridTemplateColumns: `7.5em repeat(${grid.columns.length}, minmax(0, 7em))` };
  return (
    <div className="pp-avail-read" role="table" aria-label={nl ? "Wanneer de tutor kan" : "When the tutor is available"}>
      <div className="pp-avail-read-row" role="row" style={columns}>
        <span role="columnheader" aria-hidden="true" />
        {grid.columns.map((column) => (
          <span key={column.key} role="columnheader" className="pp-avail-read-head">
            <span className="pp-avail-col">{column.label}</span>
            <span className="pp-avail-hours">{column.hours}</span>
          </span>
        ))}
      </div>
      {grid.rows.map((row) => {
        const weekday = PAL_PLUS_WEEKDAYS.find((entry) => entry.day === row.day)!;
        return (
          <div key={row.day} className="pp-avail-read-row" role="row" style={columns}>
            <span role="rowheader" className="pp-avail-read-day">
              {nl ? weekday.nl : weekday.en}
            </span>
            {grid.columns.map((column) => {
              const on = row.keys.includes(column.key);
              return (
                <span key={column.key} role="cell" className="pp-avail-mark" data-on={on ? "true" : undefined}>
                  <span className="sr-only">{on ? (nl ? "kan" : "available") : nl ? "kan niet" : "not available"}</span>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
