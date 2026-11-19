"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";
import type { MeetingAdminView } from "./MeetingDetail";
import { personEntries, type PersonEntry } from "./meetingPeople";

import "@/app/design/vtk-meeting-handout.css";

/** Onder deze lettergrootte (in px) vult het raster niet meer, maar scrolt het. */
const MIN_FIT_FONT = 13;
const MAX_FIT_FONT = 96;

/**
 * Het uitdeelscherm: alle broodjes van één vergadering op één scherm, zodat
 * iedereen op een laptop of tv zelf ziet welk broodje van hem is.
 *
 * Het scherm is bijna enkel tegels. De kop is één dunne regel en de totalen
 * staan er niet: die staan al op de pagina eronder, bij "Uit te delen". Het
 * raster kiest zelf hoeveel kolommen en hoe groot de letters zijn
 * (`fitGrid`), zodat alle tegels samen het scherm vullen, hoeveel mensen er
 * ook besteld hebben. Past het niet meer leesbaar (een gsm met een groot
 * bureau), dan scrolt het gewoon.
 *
 * Het opent over de hele pagina (een portal naar `body`, dus buiten de
 * admin-css) en de knop die het opent, vraagt zelf de Fullscreen API aan: dat
 * moet in de klik gebeuren, niet pas na het laden van dit component. Lukt dat
 * niet (een iPhone kan geen element fullscreen zetten), dan blijft het een
 * overlay over het hele venster. Sluiten met Esc, de knop, of door de browser
 * uit fullscreen te halen.
 *
 * Er wordt niets bewaard: dit scherm leest enkel wat de pagina al had.
 */
export default function MeetingHandoutScreen({
  nl,
  meeting,
  onClose,
}: {
  nl: boolean;
  meeting: MeetingAdminView;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Wie de browser uit fullscreen haalt (Esc, F11, de knop van het
    // systeem), wil het scherm dicht.
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    // Zonder fullscreen vangt de browser Esc niet op; dan doen wij het.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  // Opnieuw passen bij elke maatwijziging: het venster dat fullscreen gaat,
  // een tablet die draait, en zodra het lettertype geladen is.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const grid = gridRef.current;
    if (!body || !grid) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitGrid(body, grid));
    };
    fitGrid(body, grid);
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const entries = personEntries(meeting);
  const ordered = entries.filter(
    (entry) => entry.theokot.length > 0 || (entry.reservation?.hasOrder && !entry.reservation.invalid),
  );
  // Ongeldig staat achteraan in hetzelfde raster, in het rood: zo blijft het
  // hele scherm voor tegels.
  const invalid = entries.filter((entry) => entry.theokot.length === 0 && entry.reservation?.invalid);
  const withoutOrder = entries.filter(
    (entry) =>
      entry.theokot.length === 0 && entry.reservation && !entry.reservation.hasOrder && !entry.reservation.invalid,
  );
  const tiles = [...ordered, ...invalid];

  return createPortal(
    <div className="mh-screen" role="dialog" aria-modal="true" aria-labelledby="mh-title">
      <header className="mh-head">
        <h2 id="mh-title" className="mh-title">
          <span className="mh-kicker">{meeting.kind === "BUREAU" ? "VTK Bureau" : "Grocomeet"}</span>
          <span className="mh-date">{meeting.dateLabel}</span>
        </h2>
        <button type="button" className="mh-close" onClick={onClose} title={nl ? "Sluiten (Esc)" : "Close (Esc)"}>
          <CloseIcon />
          <span>{nl ? "Sluiten" : "Close"}</span>
        </button>
      </header>

      <main ref={bodyRef} className="mh-body">
        {tiles.length === 0 ? (
          <div className="mh-empty">
            {entries.length === 0
              ? nl
                ? "Nog niemand ingeschreven."
                : "Nobody registered yet."
              : nl
                ? "Nog niets besteld."
                : "Nothing ordered yet."}
          </div>
        ) : (
          <ul ref={gridRef} className="mh-grid">
            {tiles.map((entry) => (
              <PersonTile key={entry.key} nl={nl} entry={entry} />
            ))}
          </ul>
        )}
      </main>

      {withoutOrder.length > 0 && (
        <footer className="mh-foot">
          <strong>{nl ? "Zonder bestelling" : "Without an order"}:</strong>{" "}
          {withoutOrder.map((entry) => entry.name).join(", ")}
        </footer>
      )}
    </div>,
    document.body,
  );
}

/**
 * Kiest het aantal kolommen en de lettergrootte waarbij alle tegels samen de
 * ruimte vullen en de grootste letters krijgen. Per kolomaantal zoekt het
 * binair naar de grootste letter waarbij niets uit een tegel loopt; dat meet
 * het in de DOM zelf, zodat een lange naam of een broodje dat op twee regels
 * valt vanzelf meetelt. Alles in layoutpixels (`clientWidth`, `scrollHeight`),
 * dus de zoom van 90% op een laptop maakt hier niets uit.
 */
function fitGrid(body: HTMLElement, grid: HTMLUListElement) {
  const tiles = [...grid.children] as HTMLElement[];
  const count = tiles.length;
  if (count === 0) return;

  const style = getComputedStyle(body);
  const width = body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;

  const apply = (cols: number, rows: number, font: number) => {
    grid.dataset.fit = "";
    grid.style.setProperty("--mh-cols", String(cols));
    grid.style.setProperty("--mh-rows", String(rows));
    grid.style.setProperty("--mh-font", `${font}px`);
  };
  const fits = () =>
    tiles.every((tile) => tile.scrollHeight <= tile.clientHeight + 1 && tile.scrollWidth <= tile.clientWidth + 1);

  let best: { cols: number; rows: number; font: number } | null = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    // Een kolom erbij die geen rij uitspaart, maakt de tegels enkel smaller.
    if (cols > 1 && Math.ceil(count / (cols - 1)) === rows) continue;
    const tileWidth = (width - gap * (cols - 1)) / cols;
    const tileHeight = (height - gap * (rows - 1)) / rows;
    // Tegels die veel hoger dan breed of veel breder dan hoog zijn, lezen
    // slecht en winnen het toch nooit; die vormen slaan we over.
    const ratio = tileWidth / tileHeight;
    if (ratio < 0.8 || ratio > 8) continue;

    let low = MIN_FIT_FONT;
    let high = Math.min(MAX_FIT_FONT, Math.floor(tileHeight / 2));
    if (high < low) continue;
    apply(cols, rows, low);
    if (!fits()) continue;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      apply(cols, rows, mid);
      if (fits()) low = mid;
      else high = mid - 1;
    }
    if (!best || low > best.font) best = { cols, rows, font: low };
  }

  if (best) {
    apply(best.cols, best.rows, best.font);
  } else {
    // Leesbaar vullen lukt niet: dan een gewoon raster dat scrolt.
    delete grid.dataset.fit;
    grid.style.removeProperty("--mh-cols");
    grid.style.removeProperty("--mh-rows");
    grid.style.removeProperty("--mh-font");
  }
}

/** Eén persoon: de naam, en daaronder groot wat die mag nemen. */
function PersonTile({ nl, entry }: { nl: boolean; entry: PersonEntry }) {
  const row = entry.reservation;
  const invalid = Boolean(row?.invalid);
  return (
    <li className="mh-tile" data-state={invalid ? "invalid" : undefined}>
      <span className="mh-name">{entry.name}</span>
      {row?.hasOrder && (
        <>
          {/* Enkel een drankje: dan is dat wat die persoon neemt, groot. */}
          <span className="mh-item">{row.item ?? row.drink}</span>
          {(row.external || row.extra || invalid || !row.item) && (
            <span className="mh-tags">
              {invalid && <span className="mh-tag mh-tag--danger">{nl ? "ongeldig" : "invalid"}</span>}
              {!row.item && <span className="mh-tag">{nl ? "enkel een drankje" : "drink only"}</span>}
              {row.external && <span className="mh-tag">{nl ? "extern" : "external"}</span>}
              {row.extra && <span className="mh-tag">{nl ? "bureauvoorraad" : "bureau stock"}</span>}
            </span>
          )}
          {row.item && row.drink && <span className="mh-drink">+ {row.drink}</span>}
        </>
      )}
      {entry.theokot.map((order) =>
        order.lines.map((line, index) => (
          <span key={`${order.id}-${index}`} className="mh-item">
            {line.quantity > 1 && <span className="mh-qty">{line.quantity}× </span>}
            {line.name}
          </span>
        )),
      )}
      {entry.theokot.length > 0 && (
        <span className="mh-tags">
          <span className="mh-tag">{nl ? "zelf bij Theokot" : "ordered at Theokot"}</span>
        </span>
      )}
      {row?.comment && <span className="mh-comment">“{row.comment}”</span>}
    </li>
  );
}
