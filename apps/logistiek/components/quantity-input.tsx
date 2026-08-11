'use client';

import { useState } from 'react';

/**
 * Aantal van één item in een aanvraag: intypen of met de knoppen ernaast.
 *
 * Er stonden eerst enkel een min- en een plusknop, en dertig cantuskannen waren
 * dus dertig kliks. Het veld is de snelle weg; de knoppen blijven voor het
 * bijstellen met één.
 *
 * Terwijl je typt blijft staan wat je typt (`draft`), zodat het veld niet onder
 * je vingers wijzigt. De waarde die de aanvraag ingaat wordt wel meteen op
 * `max` geklemd, en bij het verlaten van het veld springt de weergave naar die
 * geklemde waarde. Zo kan je nooit meer aanvragen dan er beschikbaar is, maar
 * zie je ook niet halverwege je getal iets anders verschijnen.
 */
export function QuantityInput({
  value,
  max,
  onChange,
  label,
  className = '',
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** Toegankelijke naam, met de itemnaam erin: "Aantal: Cantuskan". */
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);

  function handleChange(raw: string) {
    setDraft(raw);
    if (raw.trim() === '') {
      onChange(0);
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(Math.max(parsed, 0), Math.max(max, 0)));
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={Math.max(max, 0)}
      step={1}
      value={shown}
      aria-label={label}
      onFocus={(e) => {
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={`h-9 w-14 shrink-0 rounded-full border border-transparent px-2 text-center text-sm font-semibold tabular-nums text-vtk-ink focus:border-vtk-navy/25 focus:outline-none ${
        value > 0 ? 'bg-vtk-yellow' : 'bg-vtk-paper-2/60'
      } ${className}`}
    />
  );
}
