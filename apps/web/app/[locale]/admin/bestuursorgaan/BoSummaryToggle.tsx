"use client";

import { useState } from "react";

/**
 * Met of zonder de stand tegenover de begroting in "Resultaten per post".
 * Beheer zet een schermafbeelding van het kader op een slide voor het BO, en
 * daar horen de bedragen niet altijd bij. De schakelaar staat bewust boven het
 * kader en niet erin: anders staat hij mee op de schermafbeelding.
 *
 * Verbergen gaat in CSS (`data-begroting` in `vtk-admin.css`), zodat het kader
 * zelf een servercomponent blijft. Elke keer opnieuw "met begroting": wie de
 * pagina opent zonder te weten dat er een schakelaar is, ziet zo alles.
 */
export function BoSummaryToggle({ nl, children }: { nl: boolean; children: React.ReactNode }) {
  const [withBudget, setWithBudget] = useState(true);

  const options = [
    { value: true, label: nl ? "Met begroting" : "With budget" },
    { value: false, label: nl ? "Zonder begroting" : "Without budget" },
  ];

  return (
    <div className="vtk-bo-sum-wrap" data-begroting={withBudget ? "on" : "off"}>
      <div className="vtk-bo-sum-switch">
        <span className="vtk-bo-views" role="group" aria-label={nl ? "Stand tegenover de begroting" : "Standing against the budget"}>
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={withBudget === option.value}
              onClick={() => setWithBudget(option.value)}
            >
              {option.label}
            </button>
          ))}
        </span>
      </div>
      {children}
    </div>
  );
}
