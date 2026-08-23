/**
 * Ritten van één dag naast elkaar leggen, zoals een agenda-app dat doet.
 *
 * Apart van de weergave omdat dit het enige stuk is waar iets aan te rekenen
 * valt: welk blok komt op welke baan, en hoe breed is die baan dan. Zonder deze
 * berekening dekt een rit die over een andere valt de andere volledig af, en
 * dat is precies het geval waarin je wil zien dat er twee zijn.
 */

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

const wallClockFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

/** Minuten sinds middernacht (Belgische tijd) van dit moment. */
export function minutesOfDay(moment: Date): number {
  const [hours, minutes] = timeFormatter.format(moment).split(':').map(Number);
  return hours * 60 + minutes;
}

/** Hoeveel de Belgische klok op dit moment voorloopt op UTC. */
function brusselsOffsetMs(at: Date): number {
  const parts = wallClockFormatter.formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const hour = get('hour') === '24' ? '00' : get('hour');
  const asIfUtc = Date.parse(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}.000Z`
  );
  return asIfUtc - at.getTime();
}

/**
 * Het moment waarop deze Belgische kalenderdag begint.
 *
 * De dagen komen binnen als UTC-middernacht van een Belgische datum (zoals
 * `todayDateOnly` ze maakt), maar de uren in de kalender zijn Belgisch. Wie die
 * twee door elkaar gebruikt, knipt de dag twee uur te laat: een rit van 23:00
 * tot 01:00 viel dan volledig binnen "dezelfde" dag en kreeg een einduur (01:00)
 * dat vóór zijn beginuur (23:00) lag, dus een blok met een negatieve hoogte. Een
 * rit van 00:30 belandde om dezelfde reden op de dag ervoor.
 *
 * Twee passages, want de eerste gok kan net aan de andere kant van een
 * zomeruurwissel vallen.
 */
function startOfBrusselsDay(dayAsUtcMidnight: Date): number {
  const target = dayAsUtcMidnight.getTime();
  const first = target - brusselsOffsetMs(new Date(target));
  return target - brusselsOffsetMs(new Date(first));
}

export type Spanning = {
  /** ISO-strings: dit reist naar een client-component, en Date-objecten niet. */
  startAt: string;
  endAt: string;
};

export type Placed<T> = T & {
  start: Date;
  end: Date;
  /** Minuten sinds middernacht, geknipt op deze dag. */
  from: number;
  to: number;
  /** De baan waarop dit blok staat, en hoeveel banen er in zijn groep zijn. */
  lane: number;
  lanes: number;
  /** Deze rit begon gisteren, of loopt door tot morgen. */
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Banen toewijzen binnen één groep elkaar rakende blokken: het eerste blok dat
 * past, schuift niet op.
 */
function assignLanes<T>(cluster: Array<Placed<T>>): void {
  const laneEnds: number[] = [];
  for (const block of cluster) {
    let lane = laneEnds.findIndex((end) => end <= block.from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.to);
    } else {
      laneEnds[lane] = block.to;
    }
    block.lane = lane;
  }
  for (const block of cluster) block.lanes = laneEnds.length;
}

/**
 * De blokken die deze dag raken, met hun baan.
 *
 * Geknipt op de dag: een rit van zaterdag 22:00 tot zondag 02:00 verschijnt op
 * beide dagen, elke keer met het stuk dat op die dag valt.
 *
 * De breedte wordt per **groep** berekend en niet per dag: vier ritten die
 * elkaar niet raken, staan alle vier volledig breed. Zou je de banen over de
 * hele dag tellen, dan werd elke rit een kwart breed omdat er ergens anders op
 * die dag toevallig iets overlapte.
 */
export function placeForDay<T extends Spanning>(blocks: readonly T[], day: Date): Array<Placed<T>> {
  const dayStart = startOfBrusselsDay(day);
  const dayEnd = startOfBrusselsDay(new Date(day.getTime() + DAY_MS));

  const touching = blocks
    .map((block) => ({ ...block, start: new Date(block.startAt), end: new Date(block.endAt) }))
    .filter((block) => block.start.getTime() < dayEnd && block.end.getTime() > dayStart)
    .map((block) => {
      const continuesBefore = block.start.getTime() < dayStart;
      const continuesAfter = block.end.getTime() > dayEnd;
      return {
        ...block,
        continuesBefore,
        continuesAfter,
        from: continuesBefore ? 0 : minutesOfDay(block.start),
        // Een rit die om middernacht eindigt, geeft 0 minuten; dat is het einde
        // van deze dag en niet het begin ervan.
        to: continuesAfter ? MINUTES_PER_DAY : minutesOfDay(block.end) || MINUTES_PER_DAY,
        lane: 0,
        lanes: 1,
      };
    })
    // Het langste blok eerst bij een gelijke start: dat houdt de brede rit links
    // en de korte ernaast, in plaats van omgekeerd.
    .sort((a, b) => a.from - b.from || b.to - a.to);

  let cluster: Array<Placed<T>> = [];
  let clusterEnd = -1;
  for (const block of touching) {
    if (cluster.length > 0 && block.from >= clusterEnd) {
      assignLanes(cluster);
      cluster = [];
    }
    cluster.push(block);
    clusterEnd = Math.max(clusterEnd, block.to);
  }
  if (cluster.length > 0) assignLanes(cluster);

  return touching;
}
