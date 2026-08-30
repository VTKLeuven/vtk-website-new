import { metres, type LatLng } from './geo';

/**
 * De wandelroute over het OSM-padennet.
 *
 * **Waarom dit hier staat en niet bij een routeerdienst.** De graaf is een
 * kleine duizend knopen; Dijkstra erover kost op een telefoon minder dan een
 * beeldwissel. Er is dus geen reden om er een netwerkverzoek voor te doen, en
 * een goede reden om dat niet te doen: wie zoekt waar hij moet zijn, staat vaak
 * net in een gang of een kelder zonder ontvangst. Deze route werkt daar wel.
 *
 * De graaf komt uit `/api/app/v1/lokalen` en bevat enkel de grootste
 * samenhangende component; zie `scripts/scrape-osm.ts`.
 */

export type WalkGraph = {
  nodes: LatLng[];
  edges: [number, number][];
};

/** De graaf met zijn buurlijsten erbij, klaar om over te zoeken. */
export type RoutableGraph = {
  nodes: LatLng[];
  neighbours: { to: number; cost: number }[][];
};

export function prepare(graph: WalkGraph): RoutableGraph {
  const neighbours: { to: number; cost: number }[][] = graph.nodes.map(() => []);
  for (const [a, b] of graph.edges) {
    const cost = metres(graph.nodes[a], graph.nodes[b]);
    neighbours[a].push({ to: b, cost });
    neighbours[b].push({ to: a, cost });
  }
  return { nodes: graph.nodes, neighbours };
}

/**
 * Het knooppunt dat het dichtst bij een punt ligt.
 *
 * Vergelijkt het kwadraat van de afstand in graden en niet de echte afstand in
 * meter: dat scheelt een wortel en een handvol goniometrie per knoop, en de
 * volgorde is dezelfde. De lengtegraad wordt wel geschaald, anders telt een
 * graad oost-west even zwaar als een graad noord-zuid en dat is op deze
 * breedtegraad bijna dubbel zo veel meter.
 */
const LNG_SCALE = 0.63;

export function nearestNode(graph: RoutableGraph, point: LatLng): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const dLat = graph.nodes[i][0] - point[0];
    const dLng = (graph.nodes[i][1] - point[1]) * LNG_SCALE;
    const distance = dLat * dLat + dLng * dLng;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

export type Route = {
  /** De route als punten, klaar om te projecteren. */
  points: LatLng[];
  metres: number;
};

/**
 * Dijkstra met een binaire hoop.
 *
 * Een gesorteerde array zou bij duizend knopen ook werken, maar dan sorteer je
 * bij elke stap opnieuw; de hoop is twintig regels en houdt dit onder de
 * milliseconde, ook wanneer het netwerk ooit heel Arenberg beslaat.
 */
export function shortestPath(graph: RoutableGraph, from: number, to: number): Route | null {
  return shortestPathToAny(graph, from, [to]);
}

/**
 * De kortste route naar het dichtstbijzijnde doel uit een verzameling.
 *
 * **Waarom dit bestaat.** Een gebouw heeft meerdere deuren, en welke de juiste
 * is hangt af van waar je vandaan komt: 200G heeft er vijf, en de deur die het
 * dichtst bij het midden van het gebouw ligt gaf vanuit Quadrivium een route van
 * 508 meter voor 56 meter hemelsbreed. Dijkstra bezoekt de knopen toch al in
 * volgorde van afstand, dus stoppen bij de eerste deur die afgehandeld wordt
 * geeft de beste deur in één zoektocht in plaats van vijf.
 */
export function shortestPathToAny(
  graph: RoutableGraph,
  from: number,
  targets: number[],
): Route | null {
  if (targets.length === 0) return null;
  const wanted = new Set(targets);
  const count = graph.nodes.length;
  const distance = new Float64Array(count).fill(Infinity);
  const previous = new Int32Array(count).fill(-1);
  const settled = new Uint8Array(count);

  distance[from] = 0;
  let reached = -1;
  const heap = new MinHeap();
  heap.push(from, 0);

  while (heap.size > 0) {
    const current = heap.pop();
    if (current === -1 || settled[current]) continue;
    settled[current] = 1;
    if (wanted.has(current)) {
      reached = current;
      break;
    }

    for (const edge of graph.neighbours[current]) {
      const next = distance[current] + edge.cost;
      if (next < distance[edge.to]) {
        distance[edge.to] = next;
        previous[edge.to] = current;
        heap.push(edge.to, next);
      }
    }
  }

  if (reached === -1) return null;

  const points: LatLng[] = [];
  for (let node = reached; node !== -1; node = previous[node]) {
    points.push(graph.nodes[node]);
    if (node === from) break;
  }
  return { points: points.reverse(), metres: distance[reached] };
}

/** Een minimum-hoop op twee parallelle arrays. */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    this.items.push(item);
    this.keys.push(key);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    if (this.items.length === 0) return -1;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastKey = this.keys.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.keys.length && this.keys[left] < this.keys[smallest]) smallest = left;
        if (right < this.keys.length && this.keys[right] < this.keys[smallest]) smallest = right;
        if (smallest === i) break;
        this.swap(smallest, i);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
