/**
 * Weeknummers voor de fakbar.
 *
 * Dit stond eerder als vier regels in `app/admin/page.tsx`:
 *
 *     const diff = now.getTime() - start.getTime();
 *     return Math.ceil((diff + start.getDay() * 86400000) / oneWeek);
 *
 * Dat is geen ISO-weeknummer. Het schuift met de weekdag waarop 1 januari valt,
 * geeft rond de jaarwissel week 53 én week 1 door elkaar, en het antwoord
 * verschilt van wat er in de kalender of in Excel staat. Aangezien de fakbar
 * haar tellingen per weeknummer archiveert, moet dat nummer hetzelfde zijn als
 * dat van iedereen anders.
 *
 * **De fakbarweek loopt van zondag tot vrijdag**, niet maandag tot zondag: de
 * bar is op zaterdag dicht en de zondagavond hoort bij de week die daarna
 * begint. Week N is dus: de zondag vóór de ISO-maandag van week N, tot en met de
 * vrijdag van die week.
 */

const DAY_MS = 86_400_000;

/** Middernacht UTC, zodat dagrekenen niet over een zomeruurgrens struikelt. */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Het ISO-weeknummer en -jaar van een datum (ma=1 ... zo=7). */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const target = utcDay(date.getFullYear(), date.getMonth(), date.getDate());
  // Naar de donderdag van dezelfde ISO-week: dat is per definitie de dag die
  // bepaalt in welk ISO-jaar de week valt.
  const dayNumber = (target.getUTCDay() + 6) % 7; // ma = 0
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
  return { year: isoYear, week };
}

/** De maandag van ISO-week `week` in ISO-jaar `year`, als UTC-middernacht. */
export function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNumber = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - dayNumber * DAY_MS);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * DAY_MS);
}

/** Hoeveel ISO-weken een jaar telt (52 of 53). */
export function isoWeeksInYear(year: number): number {
  return isoWeekOf(new Date(Date.UTC(year, 11, 28))).week;
}

export type FakbarWeekDay = { dayOfWeek: string; date: Date };

/**
 * De zes avonden van fakbarweek `week`, in volgorde: zondag tot en met vrijdag.
 * De zaterdag zit er niet bij; de bar is dan dicht.
 */
export function fakbarWeekDays(year: number, week: number): FakbarWeekDay[] {
  const monday = isoWeekMonday(year, week);
  const sunday = new Date(monday.getTime() - DAY_MS);
  const names = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag'];
  return names.map((dayOfWeek, index) => ({
    dayOfWeek,
    date: new Date(sunday.getTime() + index * DAY_MS),
  }));
}

export function fakbarWeekRange(year: number, week: number): { startDate: Date; endDate: Date } {
  const days = fakbarWeekDays(year, week);
  return { startDate: days[0].date, endDate: days[days.length - 1].date };
}

/**
 * De fakbarweek waar een datum in valt. Een zondag hoort bij de week die dan
 * begint, niet bij de ISO-week die dan eindigt.
 */
export function currentFakbarWeek(now: Date = new Date()): { year: number; week: number } {
  const isSunday = now.getDay() === 0;
  const reference = isSunday ? new Date(now.getTime() + DAY_MS) : now;
  return isoWeekOf(reference);
}

/**
 * De week die je nog kan plannen.
 *
 * `currentFakbarWeek` geeft de week waarin vandaag valt, en dat is de juiste
 * week om te *tellen*: op zaterdag tel je de kassa van vrijdag. Om te *plannen*
 * is ze dan net verkeerd, want al haar avonden zijn voorbij. De fakbarweek
 * eindigt op vrijdag, dus op zaterdag hoort een special bij de week die
 * morgen begint.
 */
export function planningFakbarWeek(now: Date = new Date()): { year: number; week: number } {
  const current = currentFakbarWeek(now);
  const { endDate } = fakbarWeekRange(current.year, current.week);
  // Middernacht van vandaag in UTC, om met de datums van de avonden (db.Date)
  // te vergelijken zonder over een uur te struikelen.
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (endDate.getTime() >= today.getTime()) return current;

  const nextMonday = new Date(isoWeekMonday(current.year, current.week).getTime() + 7 * DAY_MS);
  return isoWeekOf(nextMonday);
}

/** "Week 13, 15/03 tot 20/03" voor in een lijst. */
export function formatWeekRange(startDate: Date, endDate: Date): string {
  const fmt = new Intl.DateTimeFormat('nl-BE', { day: '2-digit', month: '2-digit' });
  return `${fmt.format(startDate)} tot ${fmt.format(endDate)}`;
}
