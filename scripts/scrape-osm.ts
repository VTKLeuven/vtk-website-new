/**
 * Haalt de OpenStreetMap-gegevens van de campus op en schrijft er een compacte
 * loopkaart van: het wandelnetwerk, de ingangen, de bushaltes en de gebouwen die
 * KULag niet kent (Alma, IMEC, het kasteel).
 *
 * **Waarom OSM naast KULag en niet in plaats van.** KU Leuven heeft de
 * gezaghebbende voetafdruk en de lokalen; OSM heeft wat KU Leuven niet
 * publiceert: de **paden tussen de gebouwen**. Dat wandelnetwerk is wat "breng
 * me erheen" van een speld op een kaart naar een echte route maakt, en het is
 * klein genoeg om mee te geven aan de app en offline te laten werken.
 *
 * OSM tagt een universiteitsgebouw met `ref` = het gebouwnummer van KU Leuven,
 * dus de twee bronnen koppelen op dezelfde sleutel als `kulag_id`.
 *
 * Gegevens zijn ODbL: **"© OpenStreetMap contributors" hoort zichtbaar bij elke
 * kaart die hiermee getekend wordt.**
 *
 * Gebruik:
 *   npx tsx scripts/scrape-osm.ts
 *   npx tsx scripts/scrape-osm.ts --bbox 50.86,4.67,50.87,4.69
 */

import { writeFile } from "node:fs/promises";

const OVERPASS = "https://overpass-api.de/api/interpreter";

/**
 * Overpass weigert een verzoek zonder herkenbare User-Agent met 406, zonder uit
 * te leggen waarom. Zet er dus een naam en een adres in, dat is ook wat hun
 * gebruiksvoorwaarden vragen.
 */
const UA = "vtk-website-new/lokalenzoeker (https://vtk.be)";

/** Celestijnenlaan 200 plus wat lucht eromheen: zuid, west, noord, oost. */
const DEFAULT_BBOX = [50.8605, 4.6715, 50.8665, 4.6825] as const;

/**
 * Wat als beloopbaar telt. `service` zit erbij omdat de wegen tussen de
 * parkings en de inkomhallen zo getagd staan; zonder die valt het netwerk in
 * losse stukken uiteen.
 */
const WALKABLE = "footway|path|pedestrian|steps|service|residential|cycleway|living_street|track";

type OverpassWay = {
  type: "way";
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags: Record<string, string>;
};
type OverpassNode = {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};
type OverpassElement = OverpassWay | OverpassNode;

export type CampusOsm = {
  fetchedAt: string;
  attribution: string;
  bbox: [number, number, number, number];
  /**
   * Het wandelnetwerk als graaf. `nodes` zijn [lat, lng]-paren; `edges` verwijst
   * met indexen in `nodes`, twee per boog. Bewust indexen en geen OSM-id's: dat
   * scheelt hier ruim de helft van het bestand en de app heeft de id's niet nodig.
   */
  walk: { nodes: [number, number][]; edges: [number, number][] };
  /** Ingangen; `main` is de hoofdingang. Hier eindigt een route, niet in het zwaartepunt. */
  entrances: { lat: number; lng: number; kind: string; ref: string | null; name: string | null }[];
  busStops: { lat: number; lng: number; name: string | null }[];
  /** Gebouwen die KULag niet kent, als context op de kaart. */
  context: { ref: string | null; name: string | null; kind: string; outline: [number, number][] }[];
};

async function overpass(query: string): Promise<OverpassElement[]> {
  const resp = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ data: query }),
  });
  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const json = (await resp.json()) as { elements: OverpassElement[] };
  return json.elements;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Bouwt de graaf en houdt enkel de grootste samenhangende component over.
 *
 * Een los stukje pad dat nergens aan vasthangt (een doodlopend fietspad aan de
 * rand van de bbox) is geen route maar wel een val: het dichtstbijzijnde
 * knooppunt bij een gebouw kan erin liggen, en dan vindt de zoektocht niets.
 */
function buildWalkGraph(ways: OverpassWay[]): CampusOsm["walk"] {
  const pos = new Map<number, [number, number]>();
  const adjacency = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a)!.add(b);
  };

  for (const way of ways) {
    if (!way.nodes || !way.geometry || way.nodes.length !== way.geometry.length) continue;
    way.nodes.forEach((id, i) => pos.set(id, [round6(way.geometry[i].lat), round6(way.geometry[i].lon)]));
    for (let i = 1; i < way.nodes.length; i += 1) {
      link(way.nodes[i - 1], way.nodes[i]);
      link(way.nodes[i], way.nodes[i - 1]);
    }
  }

  let largest: Set<number> = new Set();
  const seen = new Set<number>();
  for (const start of pos.keys()) {
    if (seen.has(start)) continue;
    const component = new Set<number>([start]);
    const queue = [start];
    seen.add(start);
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const next of adjacency.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        component.add(next);
        queue.push(next);
      }
    }
    if (component.size > largest.size) largest = component;
  }

  const index = new Map<number, number>();
  const nodes: [number, number][] = [];
  for (const id of largest) {
    index.set(id, nodes.length);
    nodes.push(pos.get(id)!);
  }

  const edges: [number, number][] = [];
  for (const [a, neighbours] of adjacency) {
    if (!index.has(a)) continue;
    for (const b of neighbours) {
      if (!index.has(b) || a >= b) continue;
      edges.push([index.get(a)!, index.get(b)!]);
    }
  }

  return { nodes, edges };
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const raw = get("--bbox");
  const bbox = raw
    ? (raw.split(",").map(Number) as [number, number, number, number])
    : ([...DEFAULT_BBOX] as [number, number, number, number]);
  if (bbox.length !== 4 || bbox.some(Number.isNaN)) {
    throw new Error("--bbox verwacht zuid,west,noord,oost");
  }
  // Naast de app-API, want de app haalt hem daar op en Next bundelt een JSON
  // die geïmporteerd wordt. In `scripts/` zou hij niet mee gedeployd worden.
  return { bbox, out: get("--out") ?? "apps/web/lib/campus/osm-campus.json" };
}

async function main() {
  const { bbox, out } = parseArgs(process.argv.slice(2));
  const box = bbox.join(",");

  const elements = await overpass(`[out:json][timeout:90];
(
  way["highway"~"${WALKABLE}"](${box});
  way["building"](${box});
);
out geom;`);

  const nodeElements = await overpass(`[out:json][timeout:90];
(
  node["entrance"](${box});
  node["highway"="bus_stop"](${box});
);
out body;`);

  const ways = elements.filter((e): e is OverpassWay => e.type === "way");
  const walk = buildWalkGraph(ways.filter((w) => "highway" in w.tags));

  const entrances = nodeElements
    .filter((e): e is OverpassNode => e.type === "node" && Boolean(e.tags?.entrance))
    .map((n) => ({
      lat: round6(n.lat),
      lng: round6(n.lon),
      kind: n.tags!.entrance,
      ref: n.tags!.ref ?? null,
      name: n.tags!.name ?? null,
    }));

  const busStops = nodeElements
    .filter((e): e is OverpassNode => e.type === "node" && e.tags?.highway === "bus_stop")
    .map((n) => ({ lat: round6(n.lat), lng: round6(n.lon), name: n.tags!.name ?? null }));

  const context = ways
    .filter((w) => "building" in w.tags && w.geometry)
    .map((w) => ({
      ref: w.tags.ref ?? null,
      name: w.tags.name ?? null,
      kind: w.tags.building,
      outline: w.geometry.map((p) => [round6(p.lat), round6(p.lon)] as [number, number]),
    }));

  const payload: CampusOsm = {
    fetchedAt: new Date().toISOString(),
    attribution: "© OpenStreetMap contributors (ODbL)",
    bbox,
    walk,
    entrances,
    busStops,
    context,
  };

  await writeFile(out, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(
    `wandelnetwerk ${walk.nodes.length} knopen / ${walk.edges.length} bogen\n` +
      `${entrances.length} ingangen, ${busStops.length} bushaltes, ${context.length} gebouwen\n` +
      `naar ${out}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
