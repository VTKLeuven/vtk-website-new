import "server-only";

export type AddressSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Adressen zoeken voor de interactieve adreskiezer in admin.
 *
 * Twee aanbieders, met dezelfde uitkomst:
 *
 * - **Google Places** wanneer `GOOGLE_MAPS_API_KEY` gezet is. Dat is wat je van
 *   een bezorgadres-veld verwacht, maar het vraagt een Google Cloud-project met
 *   facturatie.
 * - **Photon (OpenStreetMap)** anders. Gratis, geen sleutel, en expliciet
 *   gebouwd voor type-ahead. Nominatim (dat we voor de losse geocoding
 *   gebruiken) mag hier bewust niet: hun gebruiksvoorwaarden verbieden
 *   autocomplete op de publieke instantie wegens het aantal verzoeken.
 *
 * De sleutel blijft server-side: de browser praat enkel met onze eigen route,
 * nooit rechtstreeks met Google.
 */
export async function searchAddresses(query: string, limit = 5): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  try {
    return key ? await searchWithGoogle(trimmed, limit, key) : await searchWithPhoton(trimmed, limit);
  } catch (error) {
    console.warn("Address search failed", { query: trimmed, error });
    return [];
  }
}

async function searchWithGoogle(query: string, limit: number, key: string): Promise<AddressSuggestion[]> {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // Zonder een veldmasker rekent Google de duurste tier aan.
      "X-Goog-FieldMask": "places.formattedAddress,places.displayName,places.location",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "nl",
      regionCode: "BE",
      maxResultCount: limit,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`GOOGLE_PLACES_${response.status}`);
  const data = (await response.json()) as {
    places?: Array<{
      formattedAddress?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
    }>;
  };
  return (data.places ?? [])
    .map((place) => {
      const latitude = place.location?.latitude;
      const longitude = place.location?.longitude;
      if (typeof latitude !== "number" || typeof longitude !== "number") return null;
      const name = place.displayName?.text;
      const address = place.formattedAddress;
      // "Theokot, Studentenwijk Arenberg 6, Heverlee" leest beter dan enkel het
      // adres: de naam is vaak precies waar de beheerder op zocht.
      const label = name && address && !address.startsWith(name) ? `${name}, ${address}` : address || name || "";
      return label ? { label, latitude, longitude } : null;
    })
    .filter((item): item is AddressSuggestion => item !== null)
    .slice(0, limit);
}

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
};

function photonLabel(properties: Record<string, string | undefined>): string {
  const street = [properties.street, properties.housenumber].filter(Boolean).join(" ");
  const city = [properties.postcode, properties.city].filter(Boolean).join(" ");
  // `name` is de plaatsnaam ("Theokot"); die staat vooraan wanneer ze niet al
  // gelijk is aan de straat.
  const parts = [properties.name, street, city, properties.country].filter(
    (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index
  );
  return parts.join(", ");
}

async function searchWithPhoton(query: string, limit: number): Promise<AddressSuggestion[]> {
  const url = new URL("https://photon.komoot.io/api");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  // Photon kent enkel default/de/en/fr; "nl" meesturen levert een 400 op.
  // De standaardtaal geeft voor België toch de lokale namen terug.
  // Rond Leuven, zodat lokale resultaten bovenaan komen.
  url.searchParams.set("lat", "50.8798");
  url.searchParams.set("lon", "4.7005");

  const response = await fetch(url, {
    headers: { "User-Agent": "VTK-Leuven-Ticketing/1.0 (https://vtk.be; it@vtk.be)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`PHOTON_${response.status}`);
  const data = (await response.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .map((feature) => {
      const coordinates = feature.geometry?.coordinates;
      const properties = feature.properties;
      if (!coordinates || !properties) return null;
      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const label = photonLabel(properties);
      return label ? { label, latitude, longitude } : null;
    })
    .filter((item): item is AddressSuggestion => item !== null)
    .slice(0, limit);
}
