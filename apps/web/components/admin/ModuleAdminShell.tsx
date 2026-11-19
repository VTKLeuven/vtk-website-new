import "@/app/design/vtk-ticket-admin.css";

import type { ReactNode } from "react";
import { ModuleTabNav, type ModuleTab } from "./ModuleTabs";

export type { ModuleTab };

/**
 * De kop van een beheermodule met tabbladen, zoals Tickets en Media: titel,
 * eventueel een korte uitleg en knoppen rechts, daaronder de tabbladen, en het
 * tabblad dat open staat eronder. Elk tabblad is een eigen route onder de
 * layout van de module, zodat een tabblad te delen en te bookmarken is.
 *
 * Voor een module die anders één lange pagina met kaarten onder elkaar werd:
 * Grocomeet, VTK Bureau, POC's, Lesbezoeken, PAL+. Zie docs/design-decisions.md,
 * "Beheermodules in tabbladen".
 */
export function ModuleAdminShell({
  title,
  lead,
  actions,
  navLabel,
  tabs,
  preserveParams,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  navLabel: string;
  tabs: ModuleTab[];
  /** Zie `ModuleTabNav`: queryparameters die meereizen naar elk tabblad. */
  preserveParams?: string[];
  children: ReactNode;
}) {
  return (
    // Bewust zonder `.ticket-admin`: die zet de kleur van elke link op `inherit`,
    // en dan stond de tekst van een donkere knop-link donker op donker. De kop en
    // de tabbladen zelf hangen niet aan die klasse.
    <div className="vtk-module-admin">
      <div className="ticket-admin-event">
        {/* Niet op papier: een afdruk (de turflijst van Theokot) begint met wat er te lezen valt. */}
        <header className="ticket-admin-event-head print:hidden">
          <div className="ticket-admin-event-title">
            <div>
              <h1>{title}</h1>
              {lead ? <p>{lead}</p> : null}
            </div>
            {actions ? <div className="ticket-admin-event-actions">{actions}</div> : null}
          </div>
          {/* Eén tabblad is geen keuze: wie maar één onderdeel mag zien, krijgt enkel de kop. */}
          {tabs.length > 1 ? <ModuleTabNav label={navLabel} tabs={tabs} preserveParams={preserveParams} /> : null}
        </header>
        {children}
      </div>
    </div>
  );
}
