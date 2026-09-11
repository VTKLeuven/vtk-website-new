'use client';

import { useEffect, useRef, useState } from 'react';
import { LogisticsIcon } from '@/components/logistics-icon';
import {
  DEFAULT_TRIP_FIELDS,
  TRIP_BLOCK_FIELDS,
  countChangedFields,
  type TripFields,
} from './types';

/**
 * Wat er in een rit-blok staat (R7).
 *
 * Naast de filterknop en met dezelfde vorm: één knop met een teller, een paneel
 * eronder, buitenklik en Escape sluiten. Twee knoppen die er hetzelfde uitzien,
 * antwoorden hier op twee verschillende vragen, en dat is met opzet: **de
 * filters bepalen wélke ritten er staan, dit bepaalt wat je van elke rit ziet.**
 * Dat verschil zit in de labels ("Filters" en "Weergave") en in de teller: die
 * telt hier wat er afwijkt van de standaard, niet wat er aanstaat.
 *
 * Waarom dit géén queryparameters zijn zoals de filters: het verandert niets aan
 * wat de server ophaalt, het is een voorkeur van één persoon, en zeven extra
 * parameters maken elke gedeelde link naar een bepaalde week onleesbaar. Het
 * staat in `localStorage`, zoals de zoom; de eigenaar daarvan is
 * `TransportCalendar`.
 */
export function TripFieldPicker({
  fields,
  onChange,
  /** Uit op het publieke overzicht: daar staan geen namen. Zie `showDriver`. */
  canShowDriver = true,
}: {
  fields: TripFields;
  onChange: (next: TripFields) => void;
  canShowDriver?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const changed = countChangedFields(fields);

  // Buiten het paneel klikken sluit het, zoals bij de filters ernaast.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // De chauffeur is daar geen keuze maar een verbod; een vinkje dat niets doet,
  // is erger dan geen vinkje.
  const options = TRIP_BLOCK_FIELDS.filter(
    (option) => canShowDriver || option.key !== 'driver'
  );

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          changed > 0
            ? 'border-vtk-navy bg-vtk-navy text-white'
            : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
        }`}
      >
        <LogisticsIcon name="show" className="h-4 w-4" />
        Weergave
        {changed > 0 ? <span className="tabular-nums">({changed})</span> : null}
        <LogisticsIcon
          name="chevron"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-[16px] border border-vtk-navy/15 bg-vtk-surface p-4 shadow-lg">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
            In het blok
          </p>
          <div className="mt-2 grid gap-2">
            {options.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-sm text-vtk-ink">
                <input
                  type="checkbox"
                  checked={fields[option.key]}
                  onChange={(event) =>
                    onChange({ ...fields, [option.key]: event.target.checked })
                  }
                  className="h-4 w-4 accent-vtk-navy"
                />
                {option.label}
              </label>
            ))}
          </div>
          {/* Een rit van een kwartier is 24 pixels hoog: alles aanvinken past
              niet, en dat hoort hier te staan in plaats van dat je het zelf
              ontdekt op de week waarin je iets zoekt. */}
          <p className="mt-3 text-xs text-vtk-muted">
            Een kort blok toont enkel de bovenste regels die passen; de rest staat in de tooltip en
            in het paneel van de rit.
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-vtk-navy/10 pt-3">
            <button
              type="button"
              onClick={() => onChange(DEFAULT_TRIP_FIELDS)}
              disabled={changed === 0}
              className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4 disabled:text-vtk-muted disabled:no-underline"
            >
              Standaard
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-vtk-navy/15 px-3 py-1 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
            >
              Sluiten
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
