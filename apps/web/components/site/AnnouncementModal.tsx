"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { isExternalUrl } from "@/lib/href";

/**
 * Aankondigingsvenster op de homepage.
 *
 * Het verschijnt één keer per aankondiging per browser: wie het wegklikt, krijgt
 * het niet opnieuw bij elke navigatie. Dat onthouden we in localStorage op id,
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

export function AnnouncementModal({
  id,
  title,
  closeLabel,
  ctaLabel,
  ctaUrl,
  children,
}: {
  id: string;
  title: string;
  closeLabel: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** De markdown van het bericht, al gerenderd op de server. */
  children: ReactNode;
}) {
  // De server weet niet wat deze bezoeker al weggeklikt heeft, dus het venster
  // verschijnt pas na de hydratie; anders zou het even flikkeren bij wie het al
  // gezien heeft.
  const isClient = useSyncExternalStore(subscribeToClient, () => true, () => false);
  const [closed, setClosed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = isClient && !closed && !readDismissed().includes(id);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    <div
      className="vtk-announcement-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        className="vtk-announcement"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vtk-announcement-title"
      >
        <div className="vtk-announcement-head">
          <h2 id="vtk-announcement-title">{title}</h2>
          <button
            ref={closeRef}
            type="button"
            className="vtk-announcement-close"
            onClick={dismiss}
            aria-label={closeLabel}
            title={closeLabel}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="vtk-announcement-body prose-vtk">{children}</div>

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
      </div>
    </div>
  );
}
