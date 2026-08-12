'use client';

import { DAY_PARTS, dayPartLabel } from '@/lib/uitleen';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * Voormiddag, namiddag of avond naast een datum.
 *
 * Bewust optioneel en bewust geen uur: het uur spreekt het team af, en een
 * uurveld zou doen alsof de app openingsuren kent die ze niet kent. "Afhalen
 * dinsdagnamiddag" stond tot nu toe in een mail; nu staat het in de aanvraag.
 */
export function DayPartSelect({
  value,
  onChange,
  locale,
  label,
  name,
}: {
  value: string;
  onChange: (next: string) => void;
  locale: LogistiekLocale;
  /** Toegankelijke naam; het veld staat naast een datum zonder eigen opschrift. */
  label: string;
  name?: string;
}) {
  const en = locale === 'en';
  return (
    <select
      name={name}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-2 text-sm text-vtk-ink"
    >
      <option value="">{en ? 'Time of day?' : 'Dagdeel?'}</option>
      {DAY_PARTS.map((part) => (
        <option key={part} value={part}>
          {dayPartLabel(part, locale)}
        </option>
      ))}
    </select>
  );
}
