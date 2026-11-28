'use client';

import { useRef, useState } from 'react';
import { parseDateOnly } from '@/lib/uitleen';
import { byLocale, useCalendarCopy } from './copy';

/**
 * De twee datums van "Aangepast", in het segment zelf.
 *
 * Klik je op Aangepast, dan kleurt het segment en schuift het open met deze twee
 * datums; een datum kiezen past de planning meteen aan. Geen apart venster en
 * geen "Toon": een groot keuzepaneel en daarna een venstertje met een knop zijn
 * allebei gebouwd en op vraag vervangen door dit.
 *
 * **Een knopje met "23 nov", en de kalender van de browser erachter.** Een
 * datumveld toont altijd het jaartal en een kalendericoon, en dat maakte het
 * segment te breed. Het knopje toont enkel dag en maand (het jaar staat in de
 * titel van de planning); een klik opent met `showPicker()` de kalender van de
 * browser onder het knopje, of op een telefoon de datumkiezer van het toestel.
 * Het echte veld ligt onzichtbaar op dezelfde plek, zodat die kalender daar
 * openklapt en niet ergens anders op de pagina.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SHORT = byLocale({ timeZone: 'UTC', day: 'numeric', month: 'short' });
const LONG = byLocale({ timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export function RangeFields({
  first,
  last,
  onChange,
}: {
  /** Het bereik waar de planning op staat, als `YYYY-MM-DD`. */
  first: string;
  last: string;
  onChange: (van: string, tot: string) => void;
}) {
  const t = useCalendarCopy();
  // De gekozen datums tot de planning ze terugstuurt, met het bereik waar ze bij
  // horen: blader je verder, dan volgen de knopjes het nieuwe bereik.
  const source = `${first}|${last}`;
  const [draft, setDraft] = useState<{ source: string; van: string; tot: string } | null>(null);
  const van = draft?.source === source ? draft.van : first;
  const tot = draft?.source === source ? draft.tot : last;

  const change = (nextVan: string, nextTot: string, moved: 'van' | 'tot') => {
    const a = parseDateOnly(nextVan);
    const b = parseDateOnly(nextTot);
    if (!a || !b) return;
    // Schuift het begin voorbij het einde, dan schuift het einde mee en blijft
    // de lengte; omgekeerd volgt het begin. Anders draaide de server het om en
    // werd een week vooruit plots een bereik van achteren naar voren.
    if (moved === 'van' && a > b) {
      const length = Math.round(((parseDateOnly(last) ?? b).getTime() - (parseDateOnly(first) ?? b).getTime()) / DAY_MS);
      nextTot = new Date(a.getTime() + length * DAY_MS).toISOString().slice(0, 10);
    } else if (moved === 'tot' && b < a) {
      nextVan = nextTot;
    }
    setDraft({ source, van: nextVan, tot: nextTot });
    onChange(nextVan, nextTot);
  };

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <DateChip label={t.range.from} value={van} onPick={(value) => change(value, tot, 'van')} />
      <span aria-hidden className="text-xs opacity-80">
        {t.range.to}
      </span>
      <DateChip label={t.range.until} value={tot} min={van} onPick={(value) => change(van, value, 'tot')} />
    </span>
  );
}

function DateChip({
  label,
  value,
  min,
  onPick,
}: {
  label: string;
  value: string;
  min?: string;
  onPick: (value: string) => void;
}) {
  const t = useCalendarCopy();
  const input = useRef<HTMLInputElement>(null);
  const day = parseDateOnly(value);

  const open = () => {
    const field = input.current;
    if (!field) return;
    try {
      field.showPicker();
    } catch {
      // Een browser zonder `showPicker`: dan het veld zelf, dat bij een klik
      // in de meeste browsers ook zijn kalender opent.
      field.focus();
      field.click();
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={open}
        aria-label={`${label}: ${day ? LONG[t.locale].format(day) : value}`}
        className="h-7 rounded-full bg-vtk-surface px-2.5 text-xs font-semibold tabular-nums text-vtk-ink transition hover:bg-vtk-paper"
      >
        {day ? SHORT[t.locale].format(day).replace('.', '') : value}
      </button>
      {/* Het echte veld, onzichtbaar op de plek van het knopje: daar klapt de
          kalender van de browser open. Niet in de tabvolgorde; het knopje is
          wat je bedient. */}
      <input
        ref={input}
        type="date"
        value={value}
        min={min}
        onChange={(event) => onPick(event.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </span>
  );
}
