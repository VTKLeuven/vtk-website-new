
/**
 * Uren per chauffeur per uur van de dag (F4.23).
 *
 * De vraag van Logistiek: "op welk uur wordt er gereden, en door wie". De
 * drukteweergave ernaast zegt wanneer de voertuigen weg zijn, maar niet wie er
 * dan achter het stuur zit, en dat is precies wat je nodig hebt wanneer je een
 * chauffeur zoekt voor een rit om zes uur 's ochtends.
 *
 * **Apart van `uitleen-stats.ts`, en met opzet.** Die module is `server-only` en
 * trekt Prisma mee; dit rekenwerk draait in de browser (de keuze per 1, 2 of 4
 * uur mag geen nieuwe pagina vragen) en in de tests. Wat hier staat, is dus puur:
 * getallen in, getallen uit.
 *
 * **De kleur is de kleur van de kalender.** Een chauffeur heeft in de planning
 * al een kleur (`driverColorVar`), en die hier hergebruiken betekent dat wie
 * daar mint is, dat hier ook is. Dat twee chauffeurs op dezelfde kleur kunnen
 * vallen, is in de kalender al zo en wordt daar rechtgezet met
 * `UitleenDriver.colorIndex` of een eigen kleur; één bron betekent dat je dat
 * één keer doet. De kleur komt hier als CSS-waarde binnen en niet als nummer,
 * want een eigen kleur heeft geen nummer.
 */
export const HOUR_BUCKETS = [1, 2, 4] as const;

export type HourBucket = (typeof HOUR_BUCKETS)[number];

export const HOUR_BUCKET_LABELS: Record<HourBucket, string> = {
  1: 'Per uur',
  2: 'Per 2 uur',
  4: 'Per 4 uur',
};

/**
 * Iedereen buiten de top samen in één segment.
 *
 * Vierentwintig kleuren tegenover veertig chauffeurs: een balk met veertig
 * segmenten is geen grafiek meer, en een legende met veertig namen leest niemand.
 * De rest staat er dus samen in, zodat de hoogte van de balk wél blijft kloppen.
 */
export const REST_KEY = 'overige';
const REST_NAME = 'Overige chauffeurs';
const REST_COLOR = 'var(--chart-rest)';

export type HourDriver = {
  id: string;
  name: string;
  /** De kleur uit de planning, als CSS-waarde (`driverColorVar`). */
  color: string;
  /** De uren van deze chauffeur over de hele periode. */
  hours: number;
  /** Vierentwintig getallen, index 0 is middernacht. */
  perHour: number[];
  /**
   * 168 getallen, index `dag * 24 + uur`, maandag is dag 0 (F6.4, F6.6). De som
   * over de dagen is `perHour`.
   */
  heat: number[];
};

export type HourSegment = {
  key: string;
  name: string;
  color: string;
  hours: number;
};

export type HourColumn = {
  key: string;
  /** Onder de balk: het beginuur, twee cijfers. */
  label: string;
  /** Voluit, voor de tooltip en de tabel: "14:00 tot 16:00". */
  rangeLabel: string;
  hours: number;
  /** Van onder naar boven, in dezelfde volgorde als de legende. */
  segments: HourSegment[];
};

export type DriverHourChart = {
  columns: HourColumn[];
  /** Wie er in de balken zit, met zijn totaal over de periode. */
  legend: HourSegment[];
};

/*
 * Hier wordt niet afgerond. `transportStats` levert de uren al op één cijfer na
 * de komma, en er nog eens overheen afronden per blok maakt van een rit van drie
 * kwartier "0,8 u" en van vier zulke ritten een balk die niet meer optelt tot wat
 * eronder staat. Het scherm toont de getallen met één cijfer; de som blijft
 * hier exact.
 */

function clock(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * De balken en de legende, voor een blokbreedte van 1, 2 of 4 uur.
 *
 * `drivers` staat al op uren gesorteerd (dat doet `transportStats`), dus "de top"
 * is gewoon de eerste `top` van de lijst. Geef er één chauffeur aan mee en je
 * krijgt de balken van die ene; dat is wat het scherm doet zodra je iemand
 * aanklikt.
 */
export function driverHourChart(drivers: HourDriver[], options: { bucket: HourBucket; top: number }): DriverHourChart {
  const { bucket, top } = options;
  const named = drivers.slice(0, top);
  const rest = drivers.slice(top);

  const sum = (perHour: number[], start: number) => {
    let total = 0;
    for (let hour = start; hour < start + bucket; hour += 1) total += perHour[hour] ?? 0;
    return total;
  };

  const columns: HourColumn[] = [];
  for (let start = 0; start < 24; start += bucket) {
    const segments: HourSegment[] = [];
    for (const driver of named) {
      const value = sum(driver.perHour, start);
      if (value <= 0) continue;
      segments.push({
        key: driver.id,
        name: driver.name,
        color: driver.color,
        hours: value,
      });
    }
    const restHours = rest.reduce((total, driver) => total + sum(driver.perHour, start), 0);
    if (restHours > 0) {
      segments.push({ key: REST_KEY, name: REST_NAME, color: REST_COLOR, hours: restHours });
    }
    columns.push({
      key: String(start),
      label: String(start).padStart(2, '0'),
      rangeLabel: `${clock(start)} tot ${clock(start + bucket)}`,
      hours: segments.reduce((total, segment) => total + segment.hours, 0),
      segments,
    });
  }

  const legend = legendOf(named, rest);

  return { columns, legend };
}

// ---------------------------------------------------------------------------
// Per weekdag (F6.4)
// ---------------------------------------------------------------------------

export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;
const WEEKDAY_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;

/** De uren van één chauffeur per weekdag: zeven getallen, maandag eerst. */
export function perWeekday(heat: number[]): number[] {
  return Array.from({ length: 7 }, (_, day) => {
    let total = 0;
    for (let hour = 0; hour < 24; hour += 1) total += heat[day * 24 + hour] ?? 0;
    return total;
  });
}

/**
 * De gestapelde balken per weekdag, op dezelfde manier opgebouwd als per uur van
 * de dag: een segment per chauffeur (de top), de rest samen. Dezelfde vorm als
 * {@link driverHourChart}, zodat het scherm beide met één tekenfunctie toont.
 */
export function driverWeekdayChart(drivers: HourDriver[], options: { top: number }): DriverHourChart {
  const named = drivers.slice(0, options.top);
  const rest = drivers.slice(options.top);
  const namedDays = named.map((driver) => ({ driver, days: perWeekday(driver.heat) }));
  const restDays = Array.from({ length: 7 }, (_, day) =>
    rest.reduce((total, driver) => total + perWeekday(driver.heat)[day], 0)
  );

  const columns: HourColumn[] = WEEKDAY_SHORT.map((label, day) => {
    const segments: HourSegment[] = [];
    for (const { driver, days } of namedDays) {
      if (days[day] <= 0) continue;
      segments.push({
        key: driver.id,
        name: driver.name,
        color: driver.color,
        hours: days[day],
      });
    }
    if (restDays[day] > 0) {
      segments.push({ key: REST_KEY, name: REST_NAME, color: REST_COLOR, hours: restDays[day] });
    }
    return {
      key: String(day),
      label,
      rangeLabel: WEEKDAY_LONG[day],
      hours: segments.reduce((total, segment) => total + segment.hours, 0),
      segments,
    };
  });

  return { columns, legend: legendOf(named, rest) };
}

/** De legende van een gestapelde grafiek: de top bij naam, de rest samen. */
function legendOf(named: HourDriver[], rest: HourDriver[]): HourSegment[] {
  const legend: HourSegment[] = named
    .filter((driver) => driver.hours > 0)
    .map((driver) => ({
      key: driver.id,
      name: driver.name,
      color: driver.color,
      hours: driver.hours,
    }));
  const restTotal = rest.reduce((total, driver) => total + driver.hours, 0);
  if (restTotal > 0) {
    legend.push({ key: REST_KEY, name: `${REST_NAME} (${rest.length})`, color: REST_COLOR, hours: restTotal });
  }
  return legend;
}

// ---------------------------------------------------------------------------
// Per chauffeur naast elkaar (F6.5)
// ---------------------------------------------------------------------------

export type ProfileRow = {
  key: string;
  name: string;
  color: string;
  hours: number;
  /** Eén getal per kolom, in de volgorde van `columns`. */
  values: number[];
};

export type DriverProfiles = {
  columns: Array<{ key: string; label: string; rangeLabel: string }>;
  rows: ProfileRow[];
  /**
   * Het hoogste getal over alle rijen. Elke rij tekent tegen deze ene maat: dat is
   * de hele reden van deze weergave. In een gestapelde balk heeft enkel het
   * onderste segment een gedeelde basislijn, dus enkel dat vergelijk je
   * betrouwbaar; hier staat elke chauffeur op zijn eigen basislijn en op dezelfde
   * schaal.
   */
  max: number;
};

/**
 * Een rij per chauffeur (de top, daarna "overige"), met zijn uren per uur van de
 * dag of per weekdag. Hetzelfde rekenwerk als de gestapelde balken, anders
 * uitgezet.
 */
export function driverProfiles(
  drivers: HourDriver[],
  options: { by: 'hour' | 'weekday'; bucket: HourBucket; top: number }
): DriverProfiles {
  const { by, bucket, top } = options;
  const named = drivers.slice(0, top);
  const rest = drivers.slice(top);

  const slots = by === 'weekday' ? 7 : 24 / bucket;
  const columns = Array.from({ length: slots }, (_, index) => {
    if (by === 'weekday') {
      return { key: String(index), label: WEEKDAY_SHORT[index], rangeLabel: WEEKDAY_LONG[index] };
    }
    const start = index * bucket;
    return {
      key: String(start),
      label: String(start).padStart(2, '0'),
      rangeLabel: `${clock(start)} tot ${clock(start + bucket)}`,
    };
  });

  const valuesOf = (driver: HourDriver): number[] => {
    if (by === 'weekday') return perWeekday(driver.heat);
    return columns.map((_, index) => {
      let total = 0;
      for (let hour = index * bucket; hour < index * bucket + bucket; hour += 1) total += driver.perHour[hour] ?? 0;
      return total;
    });
  };

  const rows: ProfileRow[] = named
    .filter((driver) => driver.hours > 0)
    .map((driver) => ({
      key: driver.id,
      name: driver.name,
      color: driver.color,
      hours: driver.hours,
      values: valuesOf(driver),
    }));
  const restHours = rest.reduce((total, driver) => total + driver.hours, 0);
  if (restHours > 0) {
    const restValues = columns.map((_, index) =>
      rest.reduce((total, driver) => total + valuesOf(driver)[index], 0)
    );
    rows.push({ key: REST_KEY, name: `${REST_NAME} (${rest.length})`, color: REST_COLOR, hours: restHours, values: restValues });
  }

  const max = rows.reduce((most, row) => Math.max(most, ...row.values), 0);
  return { columns, rows, max };
}

/**
 * De drukteweergave voor deze keuze (F6.6): het totaal, of enkel de uren van één
 * chauffeur, als zeven rijen van vierentwintig. Zonder keuze is het wat
 * `transportStats` al berekende.
 */
export function heatmapFor(total: number[][], focus: HourDriver | null): number[][] {
  if (!focus) return total;
  return Array.from({ length: 7 }, (_, day) => focus.heat.slice(day * 24, day * 24 + 24));
}
