"use client";

import type { ReactNode } from "react";
import { dayKey, monthCells, weekdayLabels } from "./rentalGrid";

/**
 * Het maandraster dat het beheer en de publieke pagina delen.
 *
 * De component bezit de 42 cellen, de kop met de weekdagen en het onderscheid
 * tussen deze maand, de aangrenzende dagen en vandaag. Wat er ín een cel staat,
 * bepaalt de beller: in het beheer klikbare blokjes met de aanvrager erop,
 * publiek een blokje "bezet" of niets. Dat is precies de grens die klopt, want
 * het raster is overal hetzelfde en de inhoud nergens.
 *
 * `todayKey` komt van buiten en wordt hier niet uit `new Date()` gehaald: de
 * publieke pagina rendert op de server en zou anders bij het hydrateren een
 * andere dag kunnen markeren dan de laptop van de bezoeker.
 */

export type MonthGridCell = {
  /** "YYYY-MM-DD" */
  key: string;
  date: Date;
  /** Een dag van de vorige of volgende maand, die het raster volmaakt. */
  outside: boolean;
  today: boolean;
};

export function RentalMonthGrid({
  nl,
  cursor,
  todayKey,
  renderCell,
  cellState,
}: {
  nl: boolean;
  cursor: Date;
  todayKey: string;
  renderCell: (cell: MonthGridCell) => ReactNode;
  /**
   * Optioneel: de toestand van de dag zelf, als `data-state` op de cel. De
   * publieke kalender kleurt daarmee vrij, bezet, voorbij en te-kort-dag; het
   * beheer laat dit weg.
   */
  cellState?: (cell: MonthGridCell) => string | undefined;
}) {
  return (
    <div className="tv-month">
      <div className="tv-month-head">
        {weekdayLabels(nl).map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="tv-month-body">
        {monthCells(cursor).map((date) => {
          const cell: MonthGridCell = {
            key: dayKey(date),
            date,
            outside: date.getMonth() !== cursor.getMonth(),
            today: dayKey(date) === todayKey,
          };
          return (
            <div
              key={cell.key}
              className="tv-day"
              data-outside={cell.outside}
              data-today={cell.today}
              data-state={cellState?.(cell)}
            >
              <span className="tv-daynum">{date.getDate()}</span>
              {renderCell(cell)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
