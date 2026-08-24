"use client";

import { useState, useSyncExternalStore } from "react";
import {
  HERO_PANEL_STORAGE_KEY,
  HERO_PANEL_VARIANTS,
  isHeroPanelVariant,
  type HeroPanelVariant,
} from "@/lib/heroPanel";

/**
 * Tijdelijke testschakelaar voor de eventkaart in de hero (branch
 * `test/hero-massief-paneel`).
 *
 * De opmerking was dat de achtergrond druk is en de kaart er te weinig
 * tegen afsteekt. Voorstel C maakt van de kaart een massief navy paneel in
 * plaats van donker glas; de vraag is of daar een gele accentrail bij hoort.
 * Met deze knop bekijk je de drie toestanden op de echte homepage, met de
 * echte foto en de echte agenda.
 *
 * De keuze zelf woont in `data-hero-panel` op <html>, niet in React: het
 * bootscript zet ze al voor de eerste verf, en de CSS in
 * `app/design/vtk-home.css` hangt eraan. De component leest dat attribuut via
 * `useSyncExternalStore`, wat de manier is om externe state te volgen zonder
 * ze in een effect naar binnen te kopiëren. `?hero=rail` in de URL zet ze
 * rechtstreeks, handig om een link door te sturen.
 *
 * Dit hoort niet op main: verwijder de component, lib/heroPanel.ts, het
 * CSS-blok, het gebruik in HomeEditorial en de suppressHydrationWarning in
 * app/layout.tsx zodra de keuze gemaakt is.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readVariant(): HeroPanelVariant {
  const current = document.documentElement.dataset.heroPanel;
  return isHeroPanelVariant(current) ? current : "glas";
}

/** Op de server bestaat het attribuut nog niet; dan geldt de huidige site. */
function serverVariant(): HeroPanelVariant {
  return "glas";
}

function writeVariant(next: HeroPanelVariant) {
  document.documentElement.dataset.heroPanel = next;
  try {
    localStorage.setItem(HERO_PANEL_STORAGE_KEY, next);
  } catch {
    // Privémodus of geblokkeerde opslag: de keuze geldt dan enkel nu.
  }
  for (const listener of listeners) listener();
}

export function HeroPanelSwitch() {
  const variant = useSyncExternalStore(subscribe, readVariant, serverVariant);
  const [open, setOpen] = useState(true);

  const active = HERO_PANEL_VARIANTS.find((option) => option.id === variant);

  return (
    <div className="hero-panel-switch" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="hps-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? "Testknop verbergen" : "Testknop tonen"}
      >
        <span aria-hidden="true">◐</span>
        <span className="hps-toggle-label">Eventkaart</span>
      </button>

      {open ? (
        <div className="hps-body">
          <p className="hps-title">
            Eventkaart in de hero
            <span>testknop, enkel op deze branch</span>
          </p>
          <div
            className="hps-options"
            role="group"
            aria-label="Kies een uitvoering van de eventkaart"
          >
            {HERO_PANEL_VARIANTS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="hps-option"
                aria-pressed={variant === option.id}
                title={option.hint}
                onClick={() => writeVariant(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          {active ? <p className="hps-hint">{active.hint}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
