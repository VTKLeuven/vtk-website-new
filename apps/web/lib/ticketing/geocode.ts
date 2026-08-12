import "server-only";

export type GeocodeResult = { latitude: number; longitude: number; label: string };

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

/**
 * Zet een adres om in coördinaten via Nominatim (OpenStreetMap). Enkel nodig om
 * een geofence op een walletticket te kunnen zetten, dus:
 *
 * - Het is altijd optioneel. Mislukt het opzoeken (typfout, dienst plat, geen
 *   netwerk), dan geven we `null` terug en bewaart de aanroeper gewoon het adres
 *   zonder coördinaten. Een event opslaan mag hier nooit op stuklopen.
 * - Nominatim vraagt een herkenbare User-Agent en maximaal 1 verzoek per
 *   seconde. Dat halen we ruim: dit draait enkel wanneer een beheerder het
 *   adresveld effectief wijzigt, niet bij elke opslag.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const query = address.trim();
  if (!query) return null;

  const url = new URL(ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  // Zonder land-hint levert "Naamsestraat 22" adressen over de hele wereld op.
  url.searchParams.set("countrycodes", "be,nl,fr,de,lu");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "VTK-Leuven-Ticketing/1.0 (https://vtk.be; it@vtk.be)",
        "Accept-Language": "nl",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const results = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = results[0];
    if (!first?.lat || !first?.lon) return null;
    const latitude = Number.parseFloat(first.lat);
    const longitude = Number.parseFloat(first.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude, label: first.display_name ?? query };
  } catch (error) {
    console.warn("Geocoding failed", { query, error });
    return null;
  }
}
