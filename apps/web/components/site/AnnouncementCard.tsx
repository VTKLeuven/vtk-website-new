"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Megaphone } from "lucide-react";
import { isExternalUrl } from "@/lib/href";

/**
 * De aankondiging als kaart: rechtsonder op een groot scherm, bovenaan onder de
 * sitekop op een telefoon (vtk-base.css).
 *
 * Geen venster meer over de pagina. Wie via Google of een QR-code op een
 * infopagina landt, moest eerst een modal wegklikken voor die pagina leesbaar
 * was; de kaart laat de pagina bruikbaar en zegt toch meteen dat er iets is.
 * Ze neemt dus ook de focus niet over: wie met het toetsenbord werkt, vindt ze
 * direct na de sitekop, en Escape sluit ze enkel wanneer de focus erin staat.
 *
 * Ze verschijnt één keer per aankondiging per browser: wie ze wegklikt, krijgt
 * ze niet opnieuw bij elke navigatie. Dat onthouden we in localStorage op id,
 * zodat een nieuwe aankondiging wel weer verschijnt.
 */
const STORAGE_KEY = "vtk.announcement.dismissed";

/** Alleen op de client bekend; op de server bestaat localStorage niet. */
const subscribeToClient = () => () => undefined;

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function AnnouncementCard({
  id,
  title,
  kicker,
  dateLabel,
  closeLabel,
  readMoreLabel,
  readLessLabel,
  ctaLabel,
  ctaUrl,
  children,
}: {
  id: string;
  title: string;
  /** "Aankondiging", boven de datum in de navy kop. */
  kicker: string;
  /** Sinds wanneer het bericht er staat, al opgemaakt in de taal van de pagina. */
  dateLabel?: string | null;
  closeLabel: string;
  readMoreLabel: string;
  readLessLabel: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** De markdown van het bericht, al gerenderd op de server. */
  children: ReactNode;
}) {
  // De server weet niet wat deze bezoeker al weggeklikt heeft, dus de kaart
  // verschijnt pas na de hydratie; anders zou ze even flikkeren bij wie ze al
  // gezien heeft.
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [closed, setClosed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const open = isClient && !closed && !readDismissed().includes(id);

  // Een lang bericht staat ingeklapt op drie regels; "Lees verder" verschijnt
  // enkel wanneer er ook echt iets verborgen is. Gemeten en niet geteld in
  // tekens: hoeveel er op drie regels past, hangt van de breedte af, en die is
  // op een telefoon anders dan in de hoek van een laptop. Ingeklapt heeft het
  // blok altijd een maximale hoogte (ook een kort bericht, dat er gewoon onder
  // blijft), dus de meting klopt enkel dan; uitgeklapt blijft de vorige
  // uitkomst staan, anders verdween "Minder" zodra je erop klikte.
  useEffect(() => {
    const text = textRef.current;
    if (!open || expanded || !text) return;
    const observer = new ResizeObserver(() => {
      setOverflows(text.scrollHeight > text.clientHeight + 4);
    });
    observer.observe(text);
    return () => observer.disconnect();
  }, [open, expanded]);

  function dismiss() {
    setClosed(true);
    try {
      // Enkel de laatste tien bijhouden: oudere aankondigingen bestaan niet meer,
      // dus die id's hoeven niet eeuwig in de browser te blijven staan.
      const dismissed = readDismissed().filter((x) => x !== id);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([id, ...dismissed].slice(0, 10)));
    } catch {
      /* Geen opslag beschikbaar (private mode): dan verschijnt ze opnieuw. */
    }
  }

  if (!open) return null;

  return (
    <aside
      className="vtk-announcement"
      aria-labelledby="vtk-announcement-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") dismiss();
      }}
    >
      <div className="vtk-announcement-top">
        <span className="vtk-announcement-kicker">{kicker}</span>
        {dateLabel ? <span className="vtk-announcement-date">{dateLabel}</span> : null}
        <span className="vtk-announcement-pin" aria-hidden="true">
          <Megaphone strokeWidth={1.9} />
        </span>
        <button
          type="button"
          className="vtk-announcement-close"
          onClick={dismiss}
          aria-label={closeLabel}
          title={closeLabel}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="vtk-announcement-body">
        <h2 id="vtk-announcement-title" className="vtk-announcement-title">
          {title}
        </h2>
        <div
          ref={textRef}
          id="vtk-announcement-text"
          className="vtk-announcement-text prose-vtk"
          data-state={expanded ? "open" : overflows ? "clamped" : undefined}
        >
          {children}
        </div>
        {overflows ? (
          <button
            type="button"
            className="vtk-announcement-more"
            aria-expanded={expanded}
            aria-controls="vtk-announcement-text"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? readLessLabel : readMoreLabel}
          </button>
        ) : null}
      </div>

      <div className="vtk-announcement-actions">
        {ctaLabel && ctaUrl ? (
          <a
            href={ctaUrl}
            className="vtk-button vtk-button-primary"
            target={isExternalUrl(ctaUrl) ? "_blank" : undefined}
            rel={isExternalUrl(ctaUrl) ? "noreferrer noopener" : undefined}
            onClick={dismiss}
          >
            {ctaLabel}
          </a>
        ) : null}
        <button type="button" className="vtk-button vtk-button-ghost" onClick={dismiss}>
          {closeLabel}
        </button>
      </div>
    </aside>
  );
}
