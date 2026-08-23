/**
 * De kleur van een chauffeur in het transportoverzicht (B4, T7).
 *
 * Afgeleid uit zijn id en niet ingesteld: het doel is onderscheiden wie welke
 * rit doet, niet dat Jonas geel wil. Een vaste hash geeft dezelfde persoon altijd
 * dezelfde kleur, zonder kolom in de databank en zonder beheerscherm waar iemand
 * kleuren moet gaan zitten kiezen.
 *
 * De kleuren zelf staan als tokens in `app/globals.css` (`--driver-1` tot
 * `--driver-8`), zodat ze op één plek bijgesteld kunnen worden.
 */
export const DRIVER_COLOR_COUNT = 8;

/**
 * Stabiele, kleine hash (djb2). Niet cryptografisch: hij moet enkel dezelfde
 * uitkomst geven op de server en in de browser, en dat doet hij.
 */
function hash(value: string): number {
  let result = 5381;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) + result + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

/** 1 tot en met {@link DRIVER_COLOR_COUNT}; 0 wanneer er geen chauffeur is. */
export function driverColorIndex(driverId: string | null | undefined): number {
  if (!driverId) return 0;
  return (hash(driverId) % DRIVER_COLOR_COUNT) + 1;
}

/** De CSS-variabele voor deze chauffeur, of de neutrale kleur zonder chauffeur. */
export function driverColorVar(driverId: string | null | undefined): string {
  const index = driverColorIndex(driverId);
  return index === 0 ? 'var(--driver-none)' : `var(--driver-${index})`;
}
