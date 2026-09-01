/**
 * Ritten in een maandraster leggen: per weekrij een balk die over zoveel dagen
 * loopt als de rit duurt.
 *
 * De tegenhanger van `lib/week-lanes.ts`, dat hetzelfde doet binnen één dag. Hier
 * is de as horizontaal: een verhuis van vrijdag tot zondag is één balk van drie
 * kolommen breed, en niet drie losse blokjes waarvan je niet ziet dat ze bij
 * elkaar horen.
 *
 * Ook dit is puur en zonder weergave, om dezelfde reden als week-lanes: het is
 * het enige stuk waar iets aan te rekenen valt.
 */

import { startOfBrusselsDay, type Spanning } from './week-lanes';

const DAY_MS = 24 * 60 * 60 * 1000;

export type MonthBar<T> = T & {
  start: Date;
  end: Date;
  /** Kolom binnen de rij waar de balk begint, 0 = de eerste dag van de rij. */
  col: number;
  /** Over hoeveel dagen ze loopt, minstens 1. */
  span: number;
  /** De rij binnen de weekrij; 0 is bovenaan. */
  lane: number;
  /** De rit begon vóór deze weekrij, of loopt erna door. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Banen toewijzen: de eerste baan waar deze balk vrij past. Balken die elkaar
 * raken schuiven dus onder elkaar in plaats van over elkaar.
 *
 * Gesorteerd op begin en dan op lengte, zodat de lange balk bovenaan komt: die
 * is de rit die de week structureert, en die hoort niet onder twee korte te
 * verdwijnen.
 */
function assignLanes<T>(bars: Array<MonthBar<T>>): void {
  const laneEnds: number[] = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end <= bar.col);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(bar.col + bar.span);
    } else {
      laneEnds[lane] = bar.col + bar.span;
    }
    bar.lane = lane;
  }
}

/**
 * De balken voor één rij van zeven dagen.
 *
 * `rowDays` zijn date-only datums (UTC-middernacht van een Belgische dag), zoals
 * `calendarRange` ze levert. De dagranden worden via `startOfBrusselsDay`
 * omgerekend, precies zoals in de dag- en weekweergave: anders staat een rit van
 * 23:30 in de ene weergave op zaterdag en in de andere op zondag.
 */
export function placeForWeekRow<T extends Spanning>(
  blocks: readonly T[],
  rowDays: readonly Date[]
): Array<MonthBar<T>> {
  if (rowDays.length === 0) return [];

  // Acht grenzen voor zeven dagen: het begin van elke dag plus het einde van de
  // laatste.
  const edges = [
    ...rowDays.map((day) => startOfBrusselsDay(day)),
    startOfBrusselsDay(new Date(rowDays[rowDays.length - 1].getTime() + DAY_MS)),
  ];
  const rowStart = edges[0];
  const rowEnd = edges[edges.length - 1];

  const bars = blocks
    .map((block) => ({ ...block, start: new Date(block.startAt), end: new Date(block.endAt) }))
    .filter((block) => block.start.getTime() < rowEnd && block.end.getTime() > rowStart)
    .map((block) => {
      const from = Math.max(block.start.getTime(), rowStart);
      // Een rit die precies op een dagrand eindigt, hoort bij de dag ervóór: een
      // minieme terugschuif houdt "tot zondag 00:00" een balk tot en met
      // zaterdag, in plaats van een extra lege kolom op zondag.
      const to = Math.max(from + 1, Math.min(block.end.getTime(), rowEnd) - 1);
      // De eerste dag waarvan het venster `from` bevat, en de laatste die `to`
      // nog raakt. Een lus en geen deling door 86400000: een dag met een
      // zomeruurwissel duurt 23 of 25 uur, en dan schuift zo'n deling de balk
      // een kolom op.
      let col = 0;
      while (col + 1 < rowDays.length && edges[col + 1] <= from) col += 1;
      let last = col;
      while (last + 1 < rowDays.length && edges[last + 1] <= to) last += 1;
      return {
        ...block,
        col,
        span: Math.max(1, last - col + 1),
        lane: 0,
        continuesBefore: block.start.getTime() < rowStart,
        continuesAfter: block.end.getTime() > rowEnd,
      };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span);

  assignLanes(bars);
  return bars;
}

/**
 * De maand in rijen van zeven dagen. `days` is wat `calendarRange` voor de
 * maandweergave teruggeeft: altijd een veelvoud van zeven, maandag eerst.
 */
export function weekRows(days: readonly Date[]): Date[][] {
  const rows: Date[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    rows.push(days.slice(index, index + 7));
  }
  return rows;
}
