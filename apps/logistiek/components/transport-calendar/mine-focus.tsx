'use client';

import { useEffect, useState } from 'react';

/**
 * "Enkel mijn post benadrukken" (F6.17).
 *
 * Een rail langs de rand bleek niet genoeg: tussen een volle week gekleurde
 * ritten valt één rit van je eigen post nog altijd weg. Dit zet alle andere
 * ritten lichter, zodat de jouwe overblijft zonder dat er iets verdwijnt.
 *
 * Een attribuut op `body` en een regel in `globals.css` (`.trip-block`), geen
 * prop door dag-, week- en maandweergave heen: de ritblokken staan in drie
 * componenten, en de legende (waar deze schakelaar staat) is geen ouder van
 * hen. De keuze blijft in de browser; ze is een voorkeur, geen gegeven.
 */
const STORAGE_KEY = 'logistiek.transportplanning.focusMine';

export function MineFocus({ label }: { label: string }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Privévenster of geblokkeerde opslag: dan start het uit.
    }
  }, []);

  useEffect(() => {
    document.body.dataset.focusMine = on ? 'true' : 'false';
    return () => {
      delete document.body.dataset.focusMine;
    };
  }, [on]);

  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-vtk-muted">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => {
          setOn(event.target.checked);
          try {
            window.localStorage.setItem(STORAGE_KEY, event.target.checked ? '1' : '0');
          } catch {
            // Zonder opslag werkt de schakelaar nog, enkel niet over een herlaad heen.
          }
        }}
        className="h-3.5 w-3.5"
      />
      {label}
    </label>
  );
}
