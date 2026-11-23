'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
 * **Het kaartje woont in de kalender zelf** (`data-inspector-host`), niet vast in
 * het venster. Het stond eerst `position: fixed` en zocht bij elke scroll zijn
 * blok opnieuw op; die scroll loopt in de browser los van JavaScript, dus het
 * kaartje kwam altijd een beeld te laat en beefde naast zijn blok zodra je met
 * een trackpad scrolde. Nu staat het in dezelfde laag als het blok en schuift
 * het vanzelf mee. Er wordt enkel opnieuw gerekend wanneer er iets van maat
 * verandert (de zoom, de inhoud van het kaartje, het venster).
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

type Placement =
  | { mode: 'sheet' }
  | { mode: 'fixed' | 'host'; left: number; top: number; maxHeight: number };

/**
 * Het blok van deze rit. Liefst dat in het rooster zelf: een rit die over 06:00
 * loopt, staat met de nacht ingeklapt ook als pil in de kop, en dan hoort het
 * kaartje bij het blok en niet bij de pil.
 */
function findAnchor(anchorId: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-trip="${CSS.escape(anchorId)}"]`);
  for (const element of all) {
    if (element.closest('[data-inspector-host="grid"]')) return element;
  }
  return all[0] ?? null;
}

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
  const [placement, setPlacement] = useState<Placement | null>(null);
  /**
   * Waar het kaartje in hangt: het rooster of de pane (`data-inspector-host`),
   * `null` voor vast in het venster, en `undefined` zolang dat nog niet bekeken
   * is. In die laatste stand rendert het kaartje nog niet, anders zou zijn
   * inhoud (formulieren, nota's) twee keer opbouwen: eerst vast en dan in de
   * kalender.
   */
  const [host, setHost] = useState<HTMLElement | null | undefined>(undefined);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Waar het kaartje hoort, telkens wanneer het over een andere rit gaat. In een
  // layout-effect: het staat er dan vóór de browser iets schildert.
  useLayoutEffect(() => {
    if (window.innerWidth < POPOVER_MIN_WIDTH || !anchorId) {
      setHost(null);
      return;
    }
    setHost(findAnchor(anchorId)?.closest<HTMLElement>('[data-inspector-host]') ?? null);
  }, [anchorId]);

  // De focus in het paneel zetten zodra het opengaat: wie met het toetsenbord
  // werkt, staat anders nog bij de rit in de kalender en tabt door de hele week
  // voor hij hier is.
  useEffect(() => {
    if (host !== undefined) panel.current?.focus();
  }, [host]);

  /**
   * De gemeten hoogte van het kaartje. In een ref en niet in de berekening zelf,
   * en dat is met opzet: `place()` las eerst `offsetHeight` en zette daarmee de
   * positie, terwijl die positie de hoogte weer kon veranderen (een scrollbalk
   * die binnenin verschijnt of verdwijnt). Dat is een lus die zichzelf voedt en
   * de pagina laat vastlopen. De hoogte wordt nu enkel bijgewerkt wanneer ze
   * écht verandert, door een `ResizeObserver`.
   */
  const height = useRef(0);

  /**
   * Het kaartje naast zijn blok leggen.
   *
   * Rechts ernaast wanneer dat past, anders links; past geen van beide (een blok
   * op zondag op een smalle laptop), dan tegen de rechterrand. Verticaal begint
   * het bij de bovenkant van het blok, maar het schuift omhoog zodra het onderaan
   * uit beeld zou lopen, en het krijgt een maximumhoogte zodat het binnen het
   * zichtbare stuk blijft.
   *
   * In het rooster is "zichtbaar" het stuk van de scroller onder de vastgeplakte
   * kop: daarbuiten knipt de scroller het kaartje af. De positie wordt in
   * schermcoördinaten berekend en daarna omgezet naar de laag waarin het hangt;
   * die laag schuift mee met de scroll, dus het verschil blijft kloppen.
   */
  const place = useCallback(() => {
    const node = panel.current;
    if (!node || host === undefined) return;

    // Alleen zetten wat echt verandert. Zonder deze vergelijking geeft elke
    // meting een nieuw object en dus een nieuwe render, ook wanneer het kaartje
    // op precies dezelfde plek blijft staan.
    const apply = (next: Placement) =>
      setPlacement((current) =>
        current &&
        current.mode === next.mode &&
        (next.mode === 'sheet' ||
          (current.mode !== 'sheet' &&
            current.left === next.left &&
            current.top === next.top &&
            current.maxHeight === next.maxHeight))
          ? current
          : next
      );

    if (window.innerWidth < POPOVER_MIN_WIDTH) {
      apply({ mode: 'sheet' });
      return;
    }

    const block = anchorId ? findAnchor(anchorId) : null;
    const rect = block?.getBoundingClientRect();

    let area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const scroller = host?.dataset.inspectorHost === 'grid' ? host.closest<HTMLElement>('.tg-scroller') : null;
    if (scroller) {
      const box = scroller.getBoundingClientRect();
      const headBottom = scroller.querySelector('.tg-head')?.getBoundingClientRect().bottom ?? box.top;
      area = {
        left: Math.max(0, box.left),
        top: Math.max(0, headBottom),
        right: Math.min(window.innerWidth, box.right),
        bottom: Math.min(window.innerHeight, box.bottom),
      };
    }
    const maxHeight = Math.max(180, Math.min(520, area.bottom - area.top - EDGE * 2));
    const wanted = Math.min(height.current || maxHeight, maxHeight);

    let x: number;
    let y: number;
    if (!rect || rect.width === 0) {
      x = area.right - POPOVER_WIDTH - EDGE;
      y = Math.max(area.top + EDGE, Math.round((area.top + area.bottom - wanted) / 2));
    } else {
      const right = rect.right + GAP;
      const left = rect.left - GAP - POPOVER_WIDTH;
      x =
        right + POPOVER_WIDTH <= area.right - EDGE
          ? right
          : left >= area.left + EDGE
            ? left
            : Math.max(area.left + EDGE, area.right - POPOVER_WIDTH - EDGE);
      y = Math.max(area.top + EDGE, Math.min(rect.top, area.bottom - wanted - EDGE));
    }

    if (host) {
      const origin = host.getBoundingClientRect();
      apply({ mode: 'host', left: Math.round(x - origin.left), top: Math.round(y - origin.top), maxHeight });
    } else {
      apply({ mode: 'fixed', left: Math.round(x), top: Math.round(y), maxHeight });
    }
  }, [anchorId, host]);

  // In een layout-effect: het kaartje mag niet één frame linksboven verschijnen
  // en dan naar zijn plek springen. `children` staat bewust niet in de
  // afhankelijkheden: dat is bij elke render van de ouder een nieuw object, en
  // dan zou dit effect eindeloos blijven lopen. Verandert de inhoud van hoogte,
  // dan meldt de `ResizeObserver` hieronder dat.
  useLayoutEffect(() => {
    const node = panel.current;
    if (node) height.current = node.offsetHeight;
    place();
  }, [place]);

  useEffect(() => {
    const node = panel.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      height.current = node.offsetHeight;
      place();
    });
    observer.observe(node);
    // Zoomen maakt het rooster hoger of lager en verschuift dus het blok; dan
    // moet het kaartje mee. De laag zelf meet dat.
    if (host) observer.observe(host);
    window.addEventListener('resize', place);
    // Enkel zonder laag (vast in het venster) moet het kaartje een scroll volgen;
    // in de kalender doet de browser dat zelf, zonder vertraging.
    if (!host) window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place, host]);

  const popover = placement !== null && placement.mode !== 'sheet';

  const card = (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      style={
        placement && placement.mode !== 'sheet'
          ? {
              left: placement.left,
              top: placement.top,
              width: POPOVER_WIDTH,
              maxHeight: placement.maxHeight,
            }
          : undefined
      }
      className={
        popover
          ? `tg-popover ${placement.mode === 'host' ? 'absolute' : 'fixed'} z-[61] flex flex-col rounded-[16px] border border-vtk-navy/15 bg-vtk-surface shadow-xl outline-none`
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-vtk-navy/15 text-lg leading-none text-vtk-ink transition-colors hover:border-vtk-navy/40"
        >
          <span aria-hidden>×</span>
          <span className="sr-only">Sluiten</span>
        </button>
      </div>

      <div className={`min-h-0 flex-1 overflow-y-auto ${popover ? 'p-3.5' : 'p-4'}`}>{children}</div>

      {footer ? (
        <div
          className={`border-t border-vtk-navy/10 text-xs text-vtk-muted ${popover ? 'p-3.5' : 'p-4'}`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Sluiten door ernaast te klikken. Enkel op een smal scherm een donkere
          laag: op desktop mag de kalender zichtbaar en leesbaar blijven, want dat
          is het halve punt van een kaartje in plaats van een modal. */}
      <button
        type="button"
        aria-label="Sluiten"
        onClick={onClose}
        className="fixed inset-0 z-[60] cursor-default bg-vtk-scrim/40 sm:bg-transparent"
      />
      {host === undefined ? null : host ? createPortal(card, host) : card}
    </>
  );
}
