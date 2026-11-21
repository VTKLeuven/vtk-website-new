/*
 * Puur en zonder imports: de verkenner (`explorer.ts`) zet dit in de
 * clientbundel.
 */

/**
 * Het deel van VTK in een bedrag uit het blad. Een activiteit die we met een
 * andere kring organiseren, staat er met haar volle bedrag in (het blok
 * "Organisatie / Verdeling" zegt hoeveel VTK draagt); de begroting is enkel
 * het deel van VTK. Null als aandeel = een eigen activiteit, dus alles.
 */
export function vtkPartCents(cents: number | null, sharePercent: number | null): number | null {
  if (cents === null || sharePercent === null) return cents;
  return Math.round((cents * sharePercent) / 100);
}
