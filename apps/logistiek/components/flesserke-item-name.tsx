import { LogisticsIcon } from './logistics-icon';

/**
 * Naam van een flesserke-item, met de Colruyt-link erop wanneer die ingevuld is.
 *
 * De link stond wel in de databank maar nergens op het scherm, zodat niemand er
 * ooit bij kwam. De naam zelf is de klikbare plek: een aparte kolom met een
 * URL-tekst zou de tabel breder maken zonder iets toe te voegen.
 */
export function FlesserkeItemName({
  name,
  colruytUrl,
}: {
  name: string;
  colruytUrl: string | null;
}) {
  if (!colruytUrl) return <>{name}</>;
  return (
    <a
      href={colruytUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`${name} bij Colruyt`}
      className="inline-flex items-center gap-1 underline decoration-vtk-yellow decoration-2 underline-offset-4 hover:decoration-vtk-navy"
    >
      {name}
      <LogisticsIcon name="external" className="h-3.5 w-3.5 shrink-0 text-vtk-muted" />
    </a>
  );
}
