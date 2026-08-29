import 'server-only';
import { prisma } from '@vtk/db';

/**
 * De openingsuren van 't ElixIr.
 *
 * **Dit is niet onze eigen tabel.** Ze staan in `Setting` onder
 * `home.openingHours.elixir`, dezelfde rij die de openingsurenband op de
 * homepage van vtk.be voedt (zie `apps/web/lib/openingHoursSettings.ts`). Een
 * tweede bron zou binnen de maand uiteenlopen en dan staan er twee
 * verschillende uren op twee VTK-sites.
 *
 * De leeskant hieronder is bewust defensief en NL-only: deze app is niet
 * meertalig, en de rij wordt redactioneel bewerkt, dus ze mag er van alles in
 * hebben staan. De EN-velden laten we staan zoals ze zijn wanneer we schrijven.
 */

export const ELIXIR_HOURS_KEY = 'home.openingHours.elixir';

/** Dezelfde dagen en volgorde als `ELIXIR_DAYS` op de hoofdsite. */
export const ELIXIR_DAYS = [
  { nl: 'Zondag', en: 'Sunday', jsDay: 0 },
  { nl: 'Maandag', en: 'Monday', jsDay: 1 },
  { nl: 'Dinsdag', en: 'Tuesday', jsDay: 2 },
  { nl: 'Woensdag', en: 'Wednesday', jsDay: 3 },
  { nl: 'Donderdag', en: 'Thursday', jsDay: 4 },
] as const;

export type OpeningHoursRow = {
  dayNl: string;
  /** De uren zoals ingetikt, of `null` wanneer die dag gesloten is. */
  hours: string | null;
  /** De weekdag van vandaag in Brussel valt op deze rij. */
  isToday: boolean;
};

export type ElixirHours = {
  note: string;
  rows: OpeningHoursRow[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

const CLOSED = /^(gesloten|closed|dicht|—|-|\/)$/;

/** De weekdag van nu in Brussel (0 = zondag), los van de servertijdzone. */
export function brusselsWeekday(now: Date = new Date()): number {
  const short = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Brussels', weekday: 'short' }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(short);
}

export function parseElixirHours(value: unknown, now: Date = new Date()): ElixirHours {
  const source = asRecord(value);
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];
  const today = brusselsWeekday(now);

  const rows = ELIXIR_DAYS.map((day, index) => {
    // Op de dagnaam matchen en pas daarna op de positie: de redacteur mag de
    // rijen in de hoofdsite-admin in een andere volgorde hebben staan.
    const match =
      rawEntries.map(asRecord).find((row) => asText(row.dayNl).toLocaleLowerCase('nl-BE') === day.nl.toLowerCase()) ??
      asRecord(rawEntries[index]);
    const hours = asText(match.hours);
    return {
      dayNl: day.nl,
      hours: !hours || CLOSED.test(hours.toLocaleLowerCase('nl-BE')) ? null : hours,
      isToday: day.jsDay === today,
    };
  });

  return { note: asText(source.noteNl), rows };
}

export async function getElixirHours(now: Date = new Date()): Promise<ElixirHours> {
  const setting = await prisma.setting.findUnique({ where: { key: ELIXIR_HOURS_KEY } });
  return parseElixirHours(setting?.value, now);
}

/**
 * Schrijft de uren terug en laat alles wat wij niet tonen (de EN-titels, de
 * EN-notitie) ongemoeid: de hoofdsite gebruikt die rij ook.
 */
export async function saveElixirHours(input: { note: string; hours: string[] }): Promise<void> {
  const existing = await prisma.setting.findUnique({ where: { key: ELIXIR_HOURS_KEY } });
  const current = asRecord(existing?.value);
  const value = {
    ...current,
    noteNl: input.note,
    entries: ELIXIR_DAYS.map((day, index) => ({
      dayNl: day.nl,
      dayEn: day.en,
      hours: input.hours[index]?.trim() ?? '',
    })),
  };
  await prisma.setting.upsert({
    where: { key: ELIXIR_HOURS_KEY },
    create: { key: ELIXIR_HOURS_KEY, value },
    update: { value },
  });
}
