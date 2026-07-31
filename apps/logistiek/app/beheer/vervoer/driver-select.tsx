'use client';

import type { DriverOption } from '@/lib/uitleen-server';

/**
 * De keuzelijst met chauffeurs, gegroepeerd per bron: eerst de post Logistiek,
 * daarna wie het team zelf toevoegde in /beheer/chauffeurs. Zonder die groepen
 * staat een externe chauffeur naamloos tussen de postleden.
 */
export function DriverOptions({
  drivers,
  current,
}: {
  drivers: DriverOption[];
  /** De chauffeur die nu op de rit staat, voor het geval die uit de lijst is gehaald. */
  current?: { id: string; name: string } | null;
}) {
  const fromPost = drivers.filter((driver) => driver.source === 'POST');
  const extra = drivers.filter((driver) => driver.source === 'EXTRA');
  // Een toegewezen rit blijft staan als de chauffeur uit de lijst gaat. Zonder
  // deze optie zou de keuzelijst "Nog geen" tonen terwijl er wel iemand rijdt.
  const removed = current && !drivers.some((driver) => driver.id === current.id) ? current : null;

  return (
    <>
      {fromPost.length > 0 ? (
        <optgroup label="Post Logistiek">
          {fromPost.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {extra.length > 0 ? (
        <optgroup label="Toegevoegde chauffeurs">
          {extra.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {removed ? (
        <optgroup label="Niet meer in de chauffeurslijst">
          <option value={removed.id}>{removed.name}</option>
        </optgroup>
      ) : null}
    </>
  );
}
