/**
 * Legt overlappende kalenderevenementen van één dag naast elkaar op banen (lanes),
 * zoals in Google Calendar en in apps/logistiek/lib/week-lanes.ts.
 *
 * Zonder deze berekening worden overlappende evenementen op exact dezelfde
 * horizontale coördinaten getekend en bedekken ze elkaar volledig.
 */

export type PositionedEvent<T> = T & {
  lane: number;
  lanes: number;
};

/**
 * Wijst aan elk evenement een baan (lane) en het totaal aantal banen (lanes) in
 * zijn overlappingsgroep toe.
 *
 * @param events De evenementen van één dag
 * @param minDurationMinutes Minimale visuele duur in minuten (bijv. de hoogte van een chip)
 */
export function layoutDayEvents<T extends { minutes: number; endMinutes: number }>(
  events: readonly T[],
  minDurationMinutes: number = 0,
): Array<PositionedEvent<T>> {
  if (events.length === 0) return [];

  const items = events.map((event, index) => {
    const from = event.minutes;
    const to = Math.max(event.endMinutes, from + minDurationMinutes);
    return {
      event,
      index,
      from,
      to,
      lane: 0,
      lanes: 1,
    };
  });

  // Eerst op beginuur sorteren; bij gelijke start het langste blok eerst.
  items.sort((a, b) => a.from - b.from || b.to - a.to || a.index - b.index);

  let cluster: typeof items = [];
  let clusterEnd = -1;

  function processCluster(c: typeof items) {
    if (c.length === 0) return;
    const laneEnds: number[] = [];
    for (const item of c) {
      let lane = laneEnds.findIndex((end) => end <= item.from);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.to);
      } else {
        laneEnds[lane] = item.to;
      }
      item.lane = lane;
    }
    const numLanes = laneEnds.length;
    for (const item of c) {
      item.lanes = numLanes;
    }
  }

  for (const item of items) {
    if (cluster.length > 0 && item.from >= clusterEnd) {
      processCluster(cluster);
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.to);
  }
  if (cluster.length > 0) {
    processCluster(cluster);
  }

  return items.map((item) => ({
    ...item.event,
    lane: item.lane,
    lanes: item.lanes,
  }));
}
