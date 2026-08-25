/**
 * Het maandrooster van de kalender.
 *
 * De site heeft hier `components/editorial/calendarGrid.ts` voor, maar dat is
 * bewust **geen kopie**: die helper rekent met de lokale tijd van de machine, en
 * op de server is dat Brussel. Een telefoon staat waar zijn eigenaar staat. Een
 * cantus die om 00:30 Brusselse tijd begint, zou voor iemand in Londen op de
 * verkeerde dag in het rooster komen.
 *
 * Daarom rekent alles hier met **datumsleutels** (`YYYY-MM-DD`) in plaats van met
 * tijdstippen, en worden de dagen van het rooster op UTC-middag gebouwd. Twaalf
 * uur speling aan beide kanten betekent dat geen enkele tijdzone en geen enkele
 * zomertijdsprong een dag kan doen verschuiven.
 */

const TZ = 'Europe/Brussels';

/** `en-CA` geeft precies `YYYY-MM-DD`, en dat is de sleutel die we overal gebruiken. */
const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });

/** De Brusselse kalenderdag van een tijdstip. */
export function dayKeyOf(iso: string): string {
  return keyFormat.format(new Date(iso));
}

/** De Brusselse kalenderdag van nu. */
export function todayKey(now: Date = new Date()): string {
  return keyFormat.format(now);
}

export type GridCell = {
  /** `YYYY-MM-DD`, meteen de React-key. */
  key: string;
  /** Het dagnummer zoals het in het vakje staat. */
  day: number;
  /** Hoort deze dag bij de getoonde maand, of is het opvulling? */
  inMonth: boolean;
};

export type MonthAnchor = { year: number; month: number };

/** De maand waar een datumsleutel in valt. `month` is 1-12, niet 0-11. */
export function anchorOf(key: string): MonthAnchor {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

export function shiftMonth(anchor: MonthAnchor, delta: number): MonthAnchor {
  const zeroBased = anchor.month - 1 + delta;
  return {
    year: anchor.year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

function utcNoon(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function keyOfUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Maandag = 0, zondag = 6. De week begint hier op maandag, zoals op de site. */
function mondayFirstIndex(date: Date): number {
  const sunday0 = date.getUTCDay();
  return sunday0 === 0 ? 6 : sunday0 - 1;
}

/**
 * Zes weken van zeven dagen, met opvulling voor en na de maand.
 *
 * Altijd 42 vakjes en niet "zoveel als nodig": een rooster dat van maand tot
 * maand van hoogte verandert, laat de knoppen eronder verspringen terwijl je
 * bladert.
 */
export function monthGrid(anchor: MonthAnchor): GridCell[] {
  const first = utcNoon(anchor.year, anchor.month, 1);
  const start = utcNoon(anchor.year, anchor.month, 1 - mondayFirstIndex(first));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      key: keyOfUtc(date),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() + 1 === anchor.month,
    };
  });
}

/** De naam van de maand, voor boven het rooster. */
export function monthLabel(anchor: MonthAnchor, locale: 'nl' | 'en'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(utcNoon(anchor.year, anchor.month, 1));
}

/** De zeven kopletters boven het rooster, maandag eerst. */
export function weekdayLabels(locale: 'nl' | 'en'): string[] {
  const format = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
  });
  // 2026-01-05 was een maandag; het jaar doet er niet toe, enkel de weekdag.
  return Array.from({ length: 7 }, (_, index) => format.format(utcNoon(2026, 1, 5 + index)));
}

/**
 * De ISO-grenzen van het rooster, om precies die periode op te halen.
 *
 * De start gaat naar het begin van de eerste dag en het einde naar het einde van
 * de laatste; met UTC-middag als basis zou een evenement van 's ochtends vroeg
 * of 's avonds laat aan de rand buiten de opvraging vallen.
 */
export function gridRange(anchor: MonthAnchor): { from: string; to: string } {
  const cells = monthGrid(anchor);
  const [firstYear, firstMonth, firstDay] = cells[0].key.split('-').map(Number);
  const [lastYear, lastMonth, lastDay] = cells[cells.length - 1].key.split('-').map(Number);
  return {
    from: new Date(Date.UTC(firstYear, firstMonth - 1, firstDay - 1)).toISOString(),
    to: new Date(Date.UTC(lastYear, lastMonth - 1, lastDay + 1)).toISOString(),
  };
}
