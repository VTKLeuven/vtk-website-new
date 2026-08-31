'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Het paneel naast de kalender waarin één rit openstaat (P4).
 *
 * Rechts op een breed scherm, een bottom sheet op een smal. Het vorige venster
 * was een modal midden op het scherm: die dekte precies de week af waarin je aan
 * het schuiven was, terwijl de vraag "past dit ergens anders?" juist die week
 * nodig heeft. Een paneel aan de rand laat de kalender staan.
 *
 * Bewust géén portal naar `document.body`: dit paneel hoort binnen de
 * kalendercontainer te blijven, anders is het onzichtbaar zodra de planning in
 * volledig scherm staat (zie `.transport-calendar:fullscreen` in globals.css).
 */
export function TripInspector({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // De focus in het paneel zetten zodra het opengaat: wie met het toetsenbord
  // werkt, staat anders nog bij de rit in de kalender en tabt door de hele week
  // voor hij hier is.
  useEffect(() => {
    panel.current?.focus();
  }, []);

  return (
    <>
      {/* Sluiten door ernaast te klikken. Enkel op een smal scherm een donkere
          laag: op desktop mag de kalender zichtbaar en leesbaar blijven, want dat
          is het halve punt van een paneel in plaats van een modal. */}
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default bg-vtk-ink/40 sm:bg-transparent"
      />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[85vh] flex-col rounded-t-[18px] border border-vtk-navy/15 bg-vtk-surface shadow-lg outline-none sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[26rem] sm:rounded-l-[18px] sm:rounded-tr-none"
      >
        <div className="flex items-start justify-between gap-3 border-b border-vtk-navy/10 p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-vtk-ink">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm text-vtk-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Sluiten"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-vtk-navy/15 text-lg leading-none text-vtk-ink transition hover:border-vtk-navy/40"
          >
            <span aria-hidden>×</span>
            <span className="sr-only">Sluiten</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>

        {footer ? (
          <div className="border-t border-vtk-navy/10 p-4 text-xs text-vtk-muted sm:p-5">
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );
}
