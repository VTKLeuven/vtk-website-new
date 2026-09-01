'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Het venster waarin één rit openstaat (P4).
 *
 * Op een breed scherm een **kaartje naast het blok waar je op klikte**, zoals in
 * een agenda-app: het staat bij de rit waar het over gaat, en de rest van de
 * week blijft leesbaar. Op een smal scherm blijft het een bottom sheet; een
 * kaartje van 22rem naast een blok van 112px is daar geen kaartje meer maar een
 * scherm.
 *
 * Twee vormen die het hiervóór was, en waarom ze het niet meer zijn:
 *
 * - **Een modal midden op het scherm.** Die dekte precies de week af waarin je
 *   aan het schuiven was, terwijl de vraag "past dit ergens anders?" juist die
 *   week nodig heeft.
 * - **Een volle zijbalk rechts.** Beter, maar hij stond even ver van de rit als
 *   van alle andere: je klikte links op dinsdag en het antwoord verscheen
 *   rechts, over de zaterdag heen. Het kaartje staat nu tegen zijn eigen blok.
 *
 * Bewust géén portal naar `document.body`: dit paneel hoort binnen de
 * kalendercontainer te blijven, anders is het onzichtbaar zodra de planning in
 * volledig scherm staat (zie `.transport-calendar:fullscreen` in globals.css).
 */

/** Vanaf hier is er plaats voor een kaartje naast het blok; eronder een sheet. */
const POPOVER_MIN_WIDTH = 640;
/** Breedte van het kaartje, en de lucht die het van het blok en van de rand houdt. */
const POPOVER_WIDTH = 352;
const GAP = 12;
const EDGE = 8;

type Position = { left: number; top: number; maxHeight: number };

export function TripInspector({
  title,
  subtitle,
  onClose,
  children,
  footer,
  anchorId,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * De rit waar dit over gaat. Het kaartje zoekt het blok met dat
   * `data-trip`-attribuut op en gaat ernaast staan. Zonder id (of wanneer het
   * blok buiten beeld staat, bijvoorbeeld omdat de kalender ondertussen naar een
   * andere week ging) valt het terug op de rechterkant.
   */
  anchorId?: string | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

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

  /**
   * Het kaartje naast zijn blok leggen.
   *
   * Rechts ernaast wanneer dat past, anders links; past geen van beide (een blok
   * op zondag op een smalle laptop), dan tegen de rechterrand. Verticaal begint
   * het bij de bovenkant van het blok, maar het schuift omhoog zodra het onderaan
   * uit beeld zou lopen, en het krijgt een maximumhoogte zodat het binnen het
   * scherm blijft in plaats van eronder door te lopen.
   */
  const place = useCallback(() => {
    const node = panel.current;
    if (!node) return;
    if (window.innerWidth < POPOVER_MIN_WIDTH) {
      setPosition(null);
      return;
    }
    const block = anchorId
      ? document.querySelector<HTMLElement>(`[data-trip="${CSS.escape(anchorId)}"]`)
      : null;
    const rect = block?.getBoundingClientRect();
    const height = node.offsetHeight;
    const maxHeight = Math.min(520, window.innerHeight - EDGE * 2);

    if (!rect || rect.width === 0) {
      setPosition({
        left: window.innerWidth - POPOVER_WIDTH - EDGE,
        top: Math.max(EDGE, (window.innerHeight - Math.min(height, maxHeight)) / 2),
        maxHeight,
      });
      return;
    }

    const right = rect.right + GAP;
    const left = rect.left - GAP - POPOVER_WIDTH;
    const x =
      right + POPOVER_WIDTH <= window.innerWidth - EDGE
        ? right
        : left >= EDGE
          ? left
          : window.innerWidth - POPOVER_WIDTH - EDGE;

    const wanted = Math.min(height, maxHeight);
    const y = Math.min(Math.max(EDGE, rect.top), window.innerHeight - wanted - EDGE);
    setPosition({ left: x, top: y, maxHeight });
  }, [anchorId]);

  // In een layout-effect: het kaartje mag niet één frame linksboven verschijnen
  // en dan naar zijn plek springen.
  useLayoutEffect(() => {
    place();
  }, [place, children]);

  useEffect(() => {
    // De kalender scrolt binnen zijn eigen doos, dus `scroll` in de capture-fase:
    // anders horen we de scroll van die doos niet en blijft het kaartje achter
    // terwijl zijn blok wegschuift.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);

  const popover = position !== null;

  return (
    <>
      {/* Sluiten door ernaast te klikken. Enkel op een smal scherm een donkere
          laag: op desktop mag de kalender zichtbaar en leesbaar blijven, want dat
          is het halve punt van een kaartje in plaats van een modal. */}
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
        style={
          popover
            ? {
                left: position.left,
                top: position.top,
                width: POPOVER_WIDTH,
                maxHeight: position.maxHeight,
              }
            : undefined
        }
        className={
          popover
            ? 'tg-popover fixed z-[61] flex flex-col rounded-[16px] border border-vtk-navy/15 bg-vtk-surface shadow-xl outline-none'
            : 'fixed inset-x-0 bottom-0 z-[61] flex max-h-[85vh] flex-col rounded-t-[18px] border border-vtk-navy/15 bg-vtk-surface shadow-lg outline-none'
        }
      >
        <div
          className={`flex items-start justify-between gap-3 border-b border-vtk-navy/10 ${
            popover ? 'p-3.5' : 'p-4'
          }`}
        >
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

        <div className={`min-h-0 flex-1 overflow-y-auto ${popover ? 'p-3.5' : 'p-4'}`}>
          {children}
        </div>

        {footer ? (
          <div
            className={`border-t border-vtk-navy/10 text-xs text-vtk-muted ${
              popover ? 'p-3.5' : 'p-4'
            }`}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </>
  );
}
