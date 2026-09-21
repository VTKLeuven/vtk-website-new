import { driverColorVarFromIndex } from './driver-colors';

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
 * al een kleur (`driverColorIndex`), en die hier hergebruiken betekent dat wie
 * daar mint is, dat hier ook is. Dat twee chauffeurs op dezelfde kleur kunnen
 * vallen, is in de kalender al zo en wordt daar rechtgezet met
 * `UitleenDriver.colorIndex`; één palet betekent dat je dat één keer doet.
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
  /** 1 tot 24, zoals in de planning; 0 bestaat hier niet. */
  colorIndex: number;
  /** De uren van deze chauffeur over de hele periode. */
  hours: number;
  /** Vierentwintig getallen, index 0 is middernacht. */
  perHour: number[];
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
        color: driverColorVarFromIndex(driver.colorIndex),
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

  const legend: HourSegment[] = named
    .filter((driver) => driver.hours > 0)
    .map((driver) => ({
      key: driver.id,
      name: driver.name,
      color: driverColorVarFromIndex(driver.colorIndex),
      hours: driver.hours,
    }));
  const restTotal = rest.reduce((total, driver) => total + driver.hours, 0);
  if (restTotal > 0) {
    legend.push({ key: REST_KEY, name: `${REST_NAME} (${rest.length})`, color: REST_COLOR, hours: restTotal });
  }

  return { columns, legend };
}
