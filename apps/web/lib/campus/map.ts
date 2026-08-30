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

const EARTH = 6371000;
const RAD = Math.PI / 180;

function metres(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

/** Verder dan dit hoort een deur bij geen enkel gebouw meer. */
const DOOR_RADIUS = 25;

/**
 * Welk gebouw hoort bij welke deur.
 *
 * **Exclusief, en dat is de hele reden dat dit hier gebeurt.** Quadrivium en
 * 200G staan tegen elkaar, dus met "elke deur binnen 25 meter" claimden ze
 * elkaars deuren; de route stuurde je dan 508 meter om het blok voor 56 meter
 * hemelsbreed. Een deur hoort bij het gebouw waar ze het dichtst tegenaan ligt,
 * en bij precies één.
 *
 * Gemeten tot de contour en niet tot het zwaartepunt: bij een lang gebouw ligt
 * elke deur ver van het midden.
 */
function buildingForDoor(
  door: [number, number],
  buildings: { id: string; outline: [number, number][] }[],
): string | null {
  let best: string | null = null;
  let bestDistance = DOOR_RADIUS;
  for (const building of buildings) {
    for (const point of building.outline) {
      const distance = metres(door, point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building.id;
      }
    }
  }
  return best;
}

/**
 * De OSM-ondergrond, met de deuren aan de juiste gebouwen gehangen.
 *
 * `ownRefs` zijn de gebouwnummers die we zelf al tekenen; die horen niet in de
 * context.
 */
export function campusMap(
  ownRefs: Set<string>,
  buildings: { id: string; outline: [number, number][] }[],
): AppCampusMap {
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
      buildingId: buildingForDoor([entrance.lat, entrance.lng], buildings),
    })),
    busStops: data.busStops,
    context: data.context
      .filter((building) => !building.ref || !ownRefs.has(building.ref))
      .map((building) => building.outline),
  };
}
