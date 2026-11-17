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
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  actions?: ReactNode;
  navLabel: string;
  tabs: ModuleTab[];
  children: ReactNode;
}) {
  return (
    <div className="ticket-admin">
      <div className="ticket-admin-event">
        <header className="ticket-admin-event-head">
          <div className="ticket-admin-event-title">
            <div>
              <h1>{title}</h1>
              {lead ? <p>{lead}</p> : null}
            </div>
            {actions ? <div className="ticket-admin-event-actions">{actions}</div> : null}
          </div>
          <ModuleTabNav label={navLabel} tabs={tabs} />
        </header>
        {children}
      </div>
    </div>
  );
}
