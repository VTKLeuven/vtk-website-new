'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@vtk/ui';
import { formatTime } from '@/components/transport-calendar/trip-block';
import { AVAILABILITY_KINDS, type AvailabilityKind } from '@/lib/availability-day';
import {
  AVAILABILITY_KIND_HINT,
  AVAILABILITY_KIND_LABEL,
  availabilityFillClass,
} from '@/lib/availability-kinds';
import { formatDateTime, toDatetimeLocalValue } from '@/lib/uitleen';
import type { AvailabilityWindow } from './availability-editor';

/** Breedte van het menuutje; ook om te weten of het rechts van de band past. */
const MENU_WIDTH = 240;
const GAP = 8;

/**
 * Het menuutje bij een venster dat je aanklikt: van soort veranderen, of
 * weghalen.
 *
 * Wissen kon tot hiertoe enkel door er nog eens over te slepen met dezelfde
 * soort, en dat gebaar vindt bijna niemand zelf. Van soort veranderen ging
 * door er met een andere soort overheen te tekenen, wat hetzelfde doet maar
 * evenmin te raden valt. Beide gebaren blijven werken; dit is de weg die je
 * ziet.
 *
 * Naast de band en niet eronder: een band is een smalle, hoge strook in één
 * dagkolom, en eronder zou het menuutje de uren bedekken waar je net naar keek.
 * Het sluit bij Escape, bij een klik ernaast en zodra er iets scrolt, want dan
 * staat het niet meer naast zijn band.
 */
export function BandMenu({
  entry,
  anchor,
  pending,
  onKind,
  onRemove,
  onClose,
}: {
  entry: AvailabilityWindow;
  anchor: DOMRect;
  pending: boolean;
  onKind: (kind: AvailabilityKind) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    setHeight(menu.current?.offsetHeight ?? 0);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    function onPointer(event: PointerEvent) {
      if (!menu.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  // Rechts van de band als dat past, anders links ervan; verticaal op haar
  // bovenrand, maar nooit buiten het venster.
  const fitsRight = anchor.right + GAP + MENU_WIDTH <= window.innerWidth - GAP;
  const left = fitsRight ? anchor.right + GAP : Math.max(GAP, anchor.left - GAP - MENU_WIDTH);
  const top = Math.min(
    Math.max(GAP, anchor.top),
    Math.max(GAP, window.innerHeight - height - GAP)
  );

  return (
    <div
      ref={menu}
      role="dialog"
      aria-label="Venster aanpassen"
      className="fixed z-50 rounded-[14px] border border-vtk-navy/15 bg-vtk-surface p-3 shadow-lg"
      style={{ left, top, width: MENU_WIDTH }}
    >
      <p className="text-sm font-semibold text-vtk-ink">{windowLabel(entry)}</p>
      {entry.note ? <p className="mt-0.5 text-xs text-vtk-muted">{entry.note}</p> : null}

      <div className="mt-3 grid gap-1" role="group" aria-label="Hoe graag">
        {AVAILABILITY_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={entry.kind === kind}
            disabled={pending}
            title={AVAILABILITY_KIND_HINT[kind]}
            onClick={() => (kind === entry.kind ? onClose() : onKind(kind))}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold transition ${
              entry.kind === kind
                ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
                : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
            }`}
          >
            <span
              aria-hidden
              className={`h-3 w-3 shrink-0 rounded-[3px] border border-vtk-navy/25 bg-vtk-yellow ${availabilityFillClass(kind)}`}
            />
            {AVAILABILITY_KIND_LABEL[kind]}
          </button>
        ))}
      </div>

      <div className="mt-3 flex justify-end">
        <Button type="button" variant="danger" size="sm" disabled={pending} onClick={onRemove}>
          Weghalen
        </Button>
      </div>
    </div>
  );
}

/**
 * "di 27 oktober 2026 om 10:00 tot 14:00": het einde enkel met datum wanneer het
 * op een andere dag valt, zoals bij een nacht. Met twee volle datums las een
 * gewoon venster als een week.
 */
export function windowLabel(entry: Pick<AvailabilityWindow, 'startAt' | 'endAt'>): string {
  const startAt = new Date(entry.startAt);
  const endAt = new Date(entry.endAt);
  const sameDay =
    toDatetimeLocalValue(startAt).slice(0, 10) === toDatetimeLocalValue(endAt).slice(0, 10);
  return `${formatDateTime(startAt)} tot ${sameDay ? formatTime(endAt) : formatDateTime(endAt)}`;
}
