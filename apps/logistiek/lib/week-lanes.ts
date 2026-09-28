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
 *
 * Geëxporteerd omdat `lib/month-lanes.ts` dezelfde dagrand moet gebruiken: twee
 * eigen berekeningen zouden dag- en maandweergave op verschillende momenten
 * laten knippen, en dan staat dezelfde rit in de ene weergave op zaterdag en in
 * de andere op zondag.
 */
export function startOfBrusselsDay(dayAsUtcMidnight: Date): number {
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
  /** Minuten sinds het begin van deze dag, geknipt op die dag. */
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
 * Minuten sinds het begin van de dag, met een dag die niet om middernacht hoeft
 * te beginnen.
 *
 * Bij `dayStartMinutes` 0 is dit gewoon `minutesOfDay`. Begint de dag om 05:00,
 * dan ligt 02:00 er niet drie uur vóór maar eenentwintig uur ná: het is de nacht
 * van deze dag en niet de ochtend van de vorige.
 */
function minutesSinceDayStart(moment: Date, dayStartMinutes: number): number {
  const raw = minutesOfDay(moment);
  return raw < dayStartMinutes ? raw + MINUTES_PER_DAY : raw;
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
 *
 * `dayStartMinutes` schuift de dagrand op. De planning laat die op middernacht
 * staan, want een rit om 02:00 is een rit op die datum; het intekenscherm voor
 * beschikbaarheid zet ze op 05:00, zodat zaterdagnacht bij zaterdag hoort (zie
 * `DAG_START_UUR` in `availability-day.ts`). `from` en `to` tellen dan door
 * voorbij 1440, en dat is precies wat de kolom nodig heeft om die uren onderaan
 * te tekenen.
 */
export function placeForDay<T extends Spanning>(
  blocks: readonly T[],
  day: Date,
  dayStartMinutes = 0
): Array<Placed<T>> {
  const offset = dayStartMinutes * 60_000;
  const dayStart = startOfBrusselsDay(day) + offset;
  const dayEnd = startOfBrusselsDay(new Date(day.getTime() + DAY_MS)) + offset;
  const dayLast = dayStartMinutes + MINUTES_PER_DAY;

  const touching = blocks
    .map((block) => ({ ...block, start: new Date(block.startAt), end: new Date(block.endAt) }))
    .filter((block) => block.start.getTime() < dayEnd && block.end.getTime() > dayStart)
    .map((block) => {
      const continuesBefore = block.start.getTime() < dayStart;
      const continuesAfter = block.end.getTime() > dayEnd;
      const endsAt = minutesSinceDayStart(block.end, dayStartMinutes);
      return {
        ...block,
        continuesBefore,
        continuesAfter,
        from: continuesBefore ? dayStartMinutes : minutesSinceDayStart(block.start, dayStartMinutes),
        // Een rit die precies op de dagrand eindigt, geeft het beginuur terug;
        // dat is het einde van deze dag en niet het begin ervan.
        to: continuesAfter || endsAt === dayStartMinutes ? dayLast : endsAt,
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
