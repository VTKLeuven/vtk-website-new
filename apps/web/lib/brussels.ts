/**
 * Brussel-tijd (correct in zomer- én winteruur).
 *
 * Alles wat we plannen (Theokot-vensters, pianoslots) staat in wandkloktijd: "19u"
 * blijft 19u op de klok, ook wanneer de offset t.o.v. UTC in maart en oktober
 * verspringt. Deze helpers zetten die wandklok om naar instants en terug, via
 * `Intl` zodat de DST-regels niet hier hoeven te staan.
 *
 * Bevat GEEN server-only imports, zodat client- en servercomponenten hetzelfde
 * bestand kunnen gebruiken.
 */

const BRUSSELS_TZ = 'Europe/Brussels';

export type YMD = { year: number; month: number; day: number };

/**
 * Offset (minuten toe te voegen aan UTC om Brussel-lokaaltijd te krijgen) op het
 * gegeven instant. Afgeleid via Intl zodat DST automatisch klopt.
 */
function brusselsOffsetMinutes(instant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: BRUSSELS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get('hour');
  if (hour === 24) hour = 0; // sommige runtimes geven 24 voor middernacht
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** De Brussel-kalenderdatum (jaar/maand/dag) van een instant. */
export function brusselsYMD(date: Date): YMD {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUSSELS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = dtf.format(date).split('-').map(Number);
  return { year, month, day };
}

/** Minuten sinds middernacht op de Brusselse klok, 0 t/m 1439. */
export function brusselsMinutesOfDay(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone: BRUSSELS_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const hour = get('hour');
  return (hour === 24 ? 0 : hour) * 60 + get('minute');
}

/**
 * Instant voor een wandklokmoment (kalenderdag + minuten sinds middernacht) in
 * Europe/Brussels.
 */
export function brusselsWallClockMinutes(ymd: YMD, minutes: number): Date {
  // Eerste gok: behandel de wandklok alsof ze UTC is, corrigeer daarna met de
  // offset op dat (ongeveer) instant. Voldoende nauwkeurig buiten DST-overgangen.
  const guess = Date.UTC(ymd.year, ymd.month - 1, ymd.day) + minutes * 60000;
  const offset = brusselsOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000);
}

/** Instant voor een wandkloktijd (jaar/maand/dag + "HH:mm") in Europe/Brussels. */
export function brusselsWallClock(year: number, month: number, day: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return brusselsWallClockMinutes({ year, month, day }, h * 60 + m);
}

/** Instant voor "HH:mm" Brussel-tijd op de Brussel-kalenderdag van `day`. */
export function brusselsTimeOnDay(day: Date, hhmm: string): Date {
  const { year, month, day: d } = brusselsYMD(day);
  return brusselsWallClock(year, month, d, hhmm);
}

/** `n` dagen bij een kalenderdatum optellen/aftrekken (blijft correct rond DST). */
export function shiftYMD(ymd: YMD, deltaDays: number): YMD {
  // Middag-UTC gebruiken zodat het optellen van dagen nooit over een DST-grens
  // naar een verkeerde kalenderdag springt.
  const base = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12) + deltaDays * 86400000;
  const dt = new Date(base);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** `yyyy-mm-dd` van een kalenderdatum; de sorteerbare sleutel voor dagen. */
export function ymdKey(ymd: YMD): string {
  return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`;
}

/** `yyyy-mm-dd` terug naar een kalenderdatum, of null als het geen datum is. */
export function parseYMD(value: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const ymd = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  // Rondtrip: 2026-02-31 rolt door naar maart en is dus geen echte datum.
  return ymdKey(shiftYMD(ymd, 0)) === ymdKey(ymd) ? ymd : null;
}

/** ISO-weekdag van een kalenderdatum: 1 = maandag ... 7 = zondag. */
export function isoWeekday(ymd: YMD): number {
  const dow = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

/**
 * ISO-weeksleutel ("2026-W31") van een kalenderdatum. Weken lopen van maandag
 * tot zondag; de sleutel is wat een "één reservatie per week"-limiet telt.
 */
export function isoWeekKey(ymd: YMD): string {
  // Donderdag van dezelfde week bepaalt het ISO-jaar én het weeknummer.
  const thursday = shiftYMD(ymd, 4 - isoWeekday(ymd));
  const jan1 = Date.UTC(thursday.year, 0, 1, 12);
  const target = Date.UTC(thursday.year, thursday.month - 1, thursday.day, 12);
  const week = Math.floor((target - jan1) / (7 * 86400000)) + 1;
  return `${thursday.year}-W${String(week).padStart(2, '0')}`;
}
