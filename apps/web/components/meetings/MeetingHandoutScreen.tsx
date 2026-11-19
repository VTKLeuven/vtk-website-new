"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";
import type { MeetingAdminView } from "./MeetingDetail";
import { personEntries } from "./meetingPeople";
import { PersonSummary } from "./PersonSummary";

import "@/app/design/vtk-meeting-handout.css";

/** Onder deze lettergrootte (in px) vult de lijst niet meer, maar scrolt ze. */
const MIN_FIT_FONT = 13;
const MAX_FIT_FONT = 64;
const MAX_COLUMNS = 10;

/**
 * Het uitdeelscherm: iedereen van één vergadering op één scherm, zodat
 * iedereen op een laptop of tv zelf ziet welk broodje van hem is.
 *
 * Het is dezelfde lijst als "Per persoon" › "Twee kolommen" (`PersonSummary`):
 * alfabetisch, de naam vet en daaronder het broodje en het drankje, met een
 * haarlijn tussen de mensen. Enkel zijn er hier meer kolommen, en de lijst
 * loopt van boven naar onder, kolom per kolom. `fitList` kiest het aantal
 * kolommen en de lettergrootte zodat de lijst het scherm vult; past het niet
 * meer leesbaar (een gsm met een groot bureau), dan scrolt ze gewoon.
 *
 * De kop is één lichte regel in de stijl van de admin (geen navy band, geen
 * gele streep: het is een werkblad, geen paginakop), met enkel het aantal
 * mensen; de totalen staan al op de pagina eronder, bij "Uit te delen".
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
  const listRef = useRef<HTMLUListElement>(null);

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
    // Het slot moet op <html>, niet op <body>: `html` heeft `overflow-x: clip`
    // (globals.css), en dan gaat de overflow van body niet meer naar het
    // venster. Met enkel body bleef de pagina onder dit scherm scrollen.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  // Opnieuw passen bij elke maatwijziging: het venster dat fullscreen gaat,
  // een tablet die draait, en zodra het lettertype geladen is.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const list = listRef.current;
    if (!body || !list) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fitList(list));
    };
    fitList(list);
    const observer = new ResizeObserver(schedule);
    observer.observe(body);
    void document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const entries = personEntries(meeting);

  return createPortal(
    <div className="mh-screen" role="dialog" aria-modal="true" aria-labelledby="mh-title">
      <header className="mh-head">
        <h2 id="mh-title" className="mh-title">
          <span className="mh-kicker">{meeting.kind === "BUREAU" ? "VTK Bureau" : "Grocomeet"}</span>
          <span className="mh-date">{meeting.dateLabel}</span>
        </h2>
        <div className="mh-actions">
          {entries.length > 0 && (
            <span className="mh-count">
              {entries.length} {nl ? (entries.length === 1 ? "persoon" : "personen") : entries.length === 1 ? "person" : "people"}
            </span>
          )}
          <button type="button" className="mh-close" onClick={onClose} title={nl ? "Sluiten (Esc)" : "Close (Esc)"}>
            <CloseIcon />
            <span>{nl ? "Sluiten" : "Close"}</span>
          </button>
        </div>
      </header>

      <main ref={bodyRef} className="mh-body">
        {entries.length === 0 ? (
          <div className="mh-empty">{nl ? "Nog niemand ingeschreven." : "Nobody registered yet."}</div>
        ) : (
          <ul ref={listRef} className="mh-list">
            {entries.map((entry) => (
              <li key={entry.key}>
                <PersonSummary nl={nl} entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>,
    document.body,
  );
}

/**
 * Kiest het aantal kolommen en de lettergrootte waarbij de hele lijst op het
 * scherm past met de grootste letters. Per kolomaantal zoekt het binair naar
 * de grootste letter waarbij er geen kolom bij moet komen buiten beeld en
 * geen naam of broodje uit zijn kolom loopt. Dat meet het in de DOM zelf,
 * zodat een lange naam of een broodje over twee regels vanzelf meetelt. Alles
 * in layoutpixels (`clientWidth`, `scrollWidth`), dus de zoom van 90% op een
 * laptop maakt hier niets uit.
 */
function fitList(list: HTMLUListElement) {
  const items = [...list.children] as HTMLElement[];
  if (items.length === 0) return;

  const apply = (cols: number, font: number) => {
    list.dataset.fit = "";
    list.style.setProperty("--mh-cols", String(cols));
    list.style.setProperty("--mh-font", `${font}px`);
  };
  const fits = () =>
    list.scrollWidth <= list.clientWidth + 1 &&
    list.scrollHeight <= list.clientHeight + 1 &&
    items.every((item) => item.scrollWidth <= item.clientWidth + 1);

  let best: { cols: number; font: number } | null = null;
  for (let cols = 1; cols <= Math.min(items.length, MAX_COLUMNS); cols++) {
    apply(cols, MIN_FIT_FONT);
    if (!fits()) continue;
    let low = MIN_FIT_FONT;
    let high = MAX_FIT_FONT;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      apply(cols, mid);
      if (fits()) low = mid;
      else high = mid - 1;
    }
    if (!best || low > best.font) best = { cols, font: low };
  }

  if (best) {
    apply(best.cols, best.font);
  } else {
    // Leesbaar vullen lukt niet: dan een gewone lijst die scrolt.
    delete list.dataset.fit;
    list.style.removeProperty("--mh-cols");
    list.style.removeProperty("--mh-font");
  }
}
