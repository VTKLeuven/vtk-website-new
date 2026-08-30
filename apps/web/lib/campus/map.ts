import "server-only";

import type { AppCampusMap } from "@/lib/app-api/contract";

import raw from "./osm-campus.json";

/**
 * De OSM-ondergrond van de campuskaart.
 *
 * Bewust een geïmporteerde JSON en geen tabel: dit zijn referentiegegevens die
 * niemand met de hand bijwerkt, en `scripts/scrape-osm.ts` schrijft hem hier
 * opnieuw. Een import wordt door Next mee gebundeld; een bestand in `scripts/`
 * zou bij een deploy niet meegaan.
 *
 * Het bestand bevat meer dan de app nodig heeft (de `ref` en de naam per
 * contourgebouw, het soort ingang); dat wordt hier weggelaten in plaats van mee
 * de telefoon op te sturen.
 */
type RawCampus = {
  attribution: string;
  walk: { nodes: [number, number][]; edges: [number, number][] };
  entrances: { lat: number; lng: number; kind: string }[];
  busStops: { lat: number; lng: number; name: string | null }[];
  context: { outline: [number, number][]; ref: string | null }[];
};

/** De gebouwnummers die we zelf al tekenen; die horen niet in de context. */
export function campusMap(ownRefs: Set<string>): AppCampusMap {
  // TypeScript leest een JSON-import als `number[][]` en niet als paren; die
  // belofte maken we hier, want het schrijvende script is `scripts/scrape-osm.ts`.
  const data = raw as unknown as RawCampus;
  return {
    attribution: data.attribution,
    walk: data.walk,
    entrances: data.entrances.map((entrance) => ({
      lat: entrance.lat,
      lng: entrance.lng,
      main: entrance.kind === "main",
    })),
    busStops: data.busStops,
    context: data.context
      .filter((building) => !building.ref || !ownRefs.has(building.ref))
      .map((building) => building.outline),
  };
}
