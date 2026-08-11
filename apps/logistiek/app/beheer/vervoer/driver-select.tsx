'use client';

import type { DriverOption } from '@/lib/uitleen-server';

/**
 * De keuzelijst met chauffeurs.
 *
 * Normaal gegroepeerd per bron: eerst de post Logistiek, daarna wie het team
 * zelf toevoegde in /beheer/chauffeurs. Zonder die groepen staat een externe
 * chauffeur naamloos tussen de postleden.
 *
 * Vraagt het voertuig een karchauffeur (`needsTrailerDriver`), dan wint dat
 * onderscheid: wie met de kar rijdt staat bovenaan, de rest onder "Niet met de
 * kar". Ze blijven kiesbaar, want het team beslist; ze mogen enkel niet per
 * ongeluk gekozen worden.
 */
export function DriverOptions({
  drivers,
  current,
  needsTrailerDriver = false,
}: {
  drivers: DriverOption[];
  /** De chauffeur die nu op de rit staat, voor het geval die uit de lijst is gehaald. */
  current?: { id: string; name: string } | null;
  needsTrailerDriver?: boolean;
}) {
  // Een toegewezen rit blijft staan als de chauffeur uit de lijst gaat. Zonder
  // deze optie zou de keuzelijst "Nog geen" tonen terwijl er wel iemand rijdt.
  const removed = current && !drivers.some((driver) => driver.id === current.id) ? current : null;

  const removedGroup = removed ? (
    <optgroup label="Niet meer in de chauffeurslijst">
      <option value={removed.id}>{removed.name}</option>
    </optgroup>
  ) : null;

  if (needsTrailerDriver) {
    const withTrailer = drivers.filter((driver) => driver.canDriveTrailer);
    const without = drivers.filter((driver) => !driver.canDriveTrailer);
    return (
      <>
        {withTrailer.length > 0 ? (
          <optgroup label="Rijdt met de kar">
            {withTrailer.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {without.length > 0 ? (
          <optgroup label="Niet met de kar">
            {without.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </optgroup>
        ) : null}
        {removedGroup}
      </>
    );
  }

  const fromPost = drivers.filter((driver) => driver.source === 'POST');
  const extra = drivers.filter((driver) => driver.source === 'EXTRA');

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
      {removedGroup}
    </>
  );
}
